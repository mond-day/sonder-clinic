import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Client } from 'pg';

const ADVISORY_LOCK_KEY = 87_214_601;
const DEFAULT_WAIT_MS = 60_000;
const REQUIRED_TABLES = ['_prisma_migrations', 'Organization', 'User', 'SystemInstallation'];

export class BootstrapError extends Error {
  constructor(message: string, readonly exitCode = 1) {
    super(message);
    this.name = 'BootstrapError';
  }
}

export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return '[url-invalida]';
  }
}

export function looksLocalHost(value: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return /localhost|127\.0\.0\.1/i.test(value);
  }
}

export function sanitizePgIdentifier(name: string, label: string): string {
  const trimmed = name.trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed) || trimmed.length > 63) {
    throw new BootstrapError(
      `${label} inválido (${trimmed}). Use apenas letras, números e underscore, até 63 caracteres.`,
    );
  }
  return trimmed;
}

export function parseDatabaseUrl(databaseUrl: string): {
  name: string;
  user: string;
  host: string;
  maintenanceUrl: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new BootstrapError('DATABASE_URL inválida.');
  }
  const name = sanitizePgIdentifier(
    decodeURIComponent(parsed.pathname.replace(/^\//, '')).split('/')[0] ?? '',
    'Nome do database',
  );
  const user = sanitizePgIdentifier(decodeURIComponent(parsed.username || 'postgres'), 'Usuário do database');
  const maintenance = new URL(databaseUrl);
  maintenance.pathname = '/postgres';
  return { name, user, host: parsed.hostname, maintenanceUrl: maintenance.toString() };
}

export function findRepoRoot(startDir = process.cwd()): string {
  let dir = startDir;
  for (let i = 0; i < 10; i += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

function log(event: string, extra: Record<string, unknown> = {}): void {
  console.info(JSON.stringify({ service: 'sonder-db-bootstrap', event, ...extra }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withClient<T>(connectionString: string, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString, connectionTimeoutMillis: 5_000 });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function waitForPostgres(connectionString: string, timeoutMs = DEFAULT_WAIT_MS): Promise<void> {
  const started = Date.now();
  let lastError = 'desconhecido';
  while (Date.now() - started < timeoutMs) {
    try {
      await withClient(connectionString, async (client) => {
        await client.query('SELECT 1');
      });
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'erro de conexão';
      await sleep(1_000);
    }
  }
  throw new BootstrapError(
    `PostgreSQL indisponível após ${timeoutMs}ms (${lastError}). Verifique host, porta e credenciais.`,
  );
}

async function databaseExists(client: Client, dbName: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists',
    [dbName],
  );
  return Boolean(result.rows[0]?.exists);
}

function isInsufficientPrivilege(error: unknown): boolean {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: string }).code) : '';
  const message = error instanceof Error ? error.message : String(error);
  return code === '42501' || /permission denied to create database|must be superuser|CREATEDB/i.test(message);
}

export async function ensureDatabaseExists(options: {
  databaseUrl: string;
  adminUrl?: string;
}): Promise<{ created: boolean; name: string }> {
  const parsed = parseDatabaseUrl(options.databaseUrl);
  const adminUrl = options.adminUrl?.trim() || parsed.maintenanceUrl;

  await waitForPostgres(adminUrl);

  return withClient(adminUrl, async (client) => {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    try {
      if (await databaseExists(client, parsed.name)) {
        log('database.exists', { database: parsed.name, host: parsed.host });
        return { created: false, name: parsed.name };
      }

      log('database.creating', { database: parsed.name, host: parsed.host });
      try {
        await client.query(`CREATE DATABASE "${parsed.name}"`);
      } catch (error) {
        if (await databaseExists(client, parsed.name)) {
          return { created: false, name: parsed.name };
        }
        if (isInsufficientPrivilege(error)) {
          throw new BootstrapError(
            `Sem permissão CREATE DATABASE para criar "${parsed.name}". `
            + 'Forneça DATABASE_ADMIN_URL com um usuário privilegiado (secret/env) '
            + 'ou crie o database manualmente e rode o bootstrap de novo. '
            + 'Não conceda CREATEDB permanente ao usuário runtime da aplicação.',
          );
        }
        throw new BootstrapError(
          `Falha ao criar o database "${parsed.name}": ${error instanceof Error ? error.message : 'erro'}.`,
        );
      }

      try {
        await client.query(`ALTER DATABASE "${parsed.name}" OWNER TO "${parsed.user}"`);
      } catch {
        await client.query(`GRANT ALL PRIVILEGES ON DATABASE "${parsed.name}" TO "${parsed.user}"`);
      }

      log('database.created', { database: parsed.name, host: parsed.host });
      return { created: true, name: parsed.name };
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => undefined);
    }
  });
}

function resolvePrismaCli(root: string): { command: string; prefix: string[] } {
  const candidates = [
    join(root, 'node_modules', 'prisma', 'build', 'index.js'),
    join(root, 'packages', 'database', 'node_modules', 'prisma', 'build', 'index.js'),
    join(root, 'node_modules', '.bin', 'prisma'),
    join(root, 'packages', 'database', 'node_modules', '.bin', 'prisma'),
  ];
  const found = candidates.find((path) => existsSync(path));
  if (!found) {
    throw new BootstrapError('Prisma CLI não encontrada. Instale as dependências do monorepo.');
  }
  if (found.endsWith('.js')) {
    return { command: process.execPath, prefix: [found] };
  }
  return { command: found, prefix: [] };
}

function runPrisma(args: string[], env: NodeJS.ProcessEnv, root: string): { status: number; output: string } {
  const schema = join(root, 'packages', 'database', 'prisma', 'schema.prisma');
  const cli = resolvePrismaCli(root);
  const result = spawnSync(cli.command, [...cli.prefix, ...args, '--schema', schema], {
    cwd: join(root, 'packages', 'database'),
    env,
    encoding: 'utf8',
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.error) {
    throw new BootstrapError(`Falha ao executar prisma ${args.join(' ')}: ${result.error.message}`);
  }
  return { status: result.status ?? 1, output };
}

export function applyMigrations(databaseUrl: string, root = findRepoRoot()): void {
  const env = { ...process.env, DATABASE_URL: databaseUrl, PRISMA_HIDE_UPDATE_MESSAGE: '1' };
  log('migrate.deploy.start');
  const deployed = runPrisma(['migrate', 'deploy'], env, root);
  if (deployed.status !== 0) {
    throw new BootstrapError(
      `prisma migrate deploy falhou (exit ${deployed.status}). `
      + 'Não execute seed, reset ou DROP. Inspecione `prisma migrate status` e, se aplicável, `prisma migrate resolve` com intervenção consciente.\n'
      + deployed.output.slice(-4000),
    );
  }
  log('migrate.deploy.ok');

  const status = runPrisma(['migrate', 'status'], env, root);
  if (status.status !== 0) {
    throw new BootstrapError(
      `prisma migrate status indica migrations pendentes ou banco divergente.\n${status.output.slice(-4000)}`,
    );
  }
  log('migrate.status.ok');
}

export async function assertSchemaReady(databaseUrl: string): Promise<void> {
  await withClient(databaseUrl, async (client) => {
    const result = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
      [REQUIRED_TABLES],
    );
    const found = new Set(result.rows.map((row) => row.tablename));
    const missing = REQUIRED_TABLES.filter((name) => !found.has(name));
    if (missing.length) {
      throw new BootstrapError(`Schema incompleto. Tabelas ausentes: ${missing.join(', ')}.`);
    }

    const pending = await client.query<{ pending: number }>(
      `SELECT COUNT(*)::int AS pending FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL`,
    );
    if ((pending.rows[0]?.pending ?? 0) > 0) {
      throw new BootstrapError('Há migrations não finalizadas em _prisma_migrations.');
    }
  });
  log('schema.ready', { tables: REQUIRED_TABLES });
}

export async function runProductionBootstrap(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new BootstrapError('DATABASE_URL ausente. Defina a URL do database da aplicação.');
  }

  const adminUrl = env.DATABASE_ADMIN_URL?.trim() || undefined;
  const parsed = parseDatabaseUrl(databaseUrl);
  log('start', { database: parsed.name, host: parsed.host, hasAdminUrl: Boolean(adminUrl) });

  await ensureDatabaseExists({ databaseUrl, adminUrl });
  applyMigrations(databaseUrl);
  await assertSchemaReady(databaseUrl);

  log('complete', { database: parsed.name });

  if ((env.BOOTSTRAP_KEEP_ALIVE ?? '').toLowerCase() === 'true') {
    log('keep_alive');
    await new Promise(() => undefined);
  }
}
