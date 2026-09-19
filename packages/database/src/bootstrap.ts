import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Client } from 'pg';

/** Lock para CREATE DATABASE (serviço migrate / bootstrap completo). */
const ADVISORY_LOCK_KEY = 87_214_601;
/** Lock para `prisma migrate deploy` (API/worker boot + serviço migrate). */
const MIGRATE_ADVISORY_LOCK_KEY = 87_214_602;
const DEFAULT_WAIT_MS = 60_000;
const REQUIRED_TABLES = ['_prisma_migrations', 'Organization', 'User', 'SystemInstallation'];

/** Colunas críticas (Nibo + Google paciente). Ausência = P2022 em produção. */
const REQUIRED_COLUMNS: ReadonlyArray<{ table: string; column: string }> = [
  { table: 'Receivable', column: 'externalId' },
  { table: 'Payable', column: 'externalId' },
  { table: 'Payable', column: 'provider' },
  { table: 'Patient', column: 'externalCalendarEventId' },
];

/** Pastas de migration que o boot exige no filesystem da imagem. */
const REQUIRED_MIGRATION_DIRS = [
  '20260917120000_nibo_external_ids',
  '20260917130000_patient_calendar_event',
] as const;

/** DDL idempotente se migrate deploy “passou” mas colunas ainda faltam (histórico divergente). */
const COLUMN_REPAIR_SQL = `
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "provider" "IntegrationProvider";
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "externalCalendarEventId" TEXT;
`.trim();

/** Swarm monta secrets em /run/secrets/<nome>; o serviço migrate não passa por main da API. */
const BOOTSTRAP_DOCKER_SECRETS: ReadonlyArray<readonly [envName: string, fileName: string]> = [
  ['DATABASE_URL', 'database_url'],
  ['DATABASE_ADMIN_URL', 'database_admin_url'],
];

/**
 * Preenche DATABASE_URL / DATABASE_ADMIN_URL a partir de Docker secrets se o env estiver vazio.
 * Idempotente; não sobrescreve variáveis já definidas.
 */
export function hydrateBootstrapSecrets(
  env: NodeJS.ProcessEnv = process.env,
  secretsDir = '/run/secrets',
): void {
  for (const [envName, fileName] of BOOTSTRAP_DOCKER_SECRETS) {
    if (env[envName]?.trim()) continue;
    try {
      const value = readFileSync(`${secretsDir}/${fileName}`, 'utf8').trim();
      if (value) env[envName] = value;
    } catch {
      /* secret ausente neste ambiente */
    }
  }
}

export class BootstrapError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = 'BootstrapError';
    // Atribução explícita: Node strip-types não aceita parameter properties (1.3.9 quebrava require).
    this.exitCode = exitCode;
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

/** Garante que schema + pasta migrations existem no filesystem (imagem Docker incompleta = no-op silencioso). */
export function assertMigrationsPresent(root = findRepoRoot()): {
  schema: string;
  migrationsDir: string;
} {
  const schema = join(root, 'packages', 'database', 'prisma', 'schema.prisma');
  const migrationsDir = join(root, 'packages', 'database', 'prisma', 'migrations');
  if (!existsSync(schema)) {
    throw new BootstrapError(
      `schema.prisma ausente em ${schema}. A imagem de produção precisa incluir packages/database/prisma.`,
    );
  }
  if (!existsSync(migrationsDir)) {
    throw new BootstrapError(
      `Pasta prisma/migrations ausente em ${migrationsDir}. `
      + 'Sem ela, `prisma migrate deploy` não aplica nada e o schema fica atrás do Prisma Client (P2022).',
    );
  }
  const missingDirs = REQUIRED_MIGRATION_DIRS.filter(
    (name) => !existsSync(join(migrationsDir, name, 'migration.sql')),
  );
  if (missingDirs.length) {
    throw new BootstrapError(
      `Migrations críticas ausentes na imagem: ${missingDirs.join(', ')}. `
      + `Esperado sob ${migrationsDir}. Rebuild a imagem a partir do monorepo completo.`,
    );
  }
  const prismaCli = (() => {
    try {
      return resolvePrismaCli(root);
    } catch {
      return null;
    }
  })();
  if (!prismaCli) {
    throw new BootstrapError(
      'Prisma CLI ausente em node_modules. Em produção, `prisma` deve ser dependency '
      + '(não só devDependency) e copiada na imagem runner.',
    );
  }
  log('migrate.filesystem.ok', {
    root,
    schema,
    migrationsDir,
    requiredMigrations: REQUIRED_MIGRATION_DIRS,
    prisma: prismaCli.command,
  });
  return { schema, migrationsDir };
}

export function applyMigrations(databaseUrl: string, root = findRepoRoot()): void {
  assertMigrationsPresent(root);
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

async function listMissingRequiredColumns(databaseUrl: string): Promise<string[]> {
  return withClient(databaseUrl, async (client) => {
    const missing: string[] = [];
    for (const { table, column } of REQUIRED_COLUMNS) {
      const result = await client.query<{ exists: boolean }>(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
        ) AS exists`,
        [table, column],
      );
      if (!result.rows[0]?.exists) missing.push(`${table}.${column}`);
    }
    return missing;
  });
}

/**
 * Se colunas críticas faltarem após migrate deploy (ex.: migration marcada aplicada sem DDL),
 * aplica ALTER IF NOT EXISTS e revalida. Falha alto se ainda faltar.
 */
export async function assertRequiredColumns(databaseUrl: string): Promise<void> {
  let missing = await listMissingRequiredColumns(databaseUrl);
  if (!missing.length) {
    log('schema.columns.ok', { columns: REQUIRED_COLUMNS.map((c) => `${c.table}.${c.column}`) });
    return;
  }

  console.error(JSON.stringify({
    service: 'sonder-db-bootstrap',
    event: 'boot.migrate.columns_missing',
    missing,
    action: 'repair_if_not_exists',
  }));

  await withClient(databaseUrl, async (client) => {
    log('schema.columns.repair.start', { missing });
    await client.query(COLUMN_REPAIR_SQL);
  });

  missing = await listMissingRequiredColumns(databaseUrl);
  if (missing.length) {
    throw new BootstrapError(
      `Colunas críticas ausentes após migrate + repair: ${missing.join(', ')}. `
      + 'A API não pode subir (evitar P2022). Fallback manual SQL:\n'
      + COLUMN_REPAIR_SQL,
    );
  }
  log('schema.columns.repair.ok', { repaired: true });
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
  await assertRequiredColumns(databaseUrl);
  log('schema.ready', {
    tables: REQUIRED_TABLES,
    columns: REQUIRED_COLUMNS.map((c) => `${c.table}.${c.column}`),
  });
}

/**
 * Aplica `prisma migrate deploy` com lock consultivo (seguro com réplicas API/worker).
 * Não cria database nem roda seed — só migrate + verificação de schema.
 */
export async function applyMigrationsWithLock(
  databaseUrl: string,
  root = findRepoRoot(),
  waitMs = DEFAULT_WAIT_MS,
): Promise<void> {
  await waitForPostgres(databaseUrl, waitMs);
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 });
  await client.connect();
  try {
    log('migrate.lock.wait');
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATE_ADVISORY_LOCK_KEY]);
    log('migrate.lock.acquired');
    try {
      applyMigrations(databaseUrl, root);
      await assertSchemaReady(databaseUrl);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATE_ADVISORY_LOCK_KEY]).catch(() => undefined);
      log('migrate.lock.released');
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

export type BootMigrateOptions = {
  env?: NodeJS.ProcessEnv;
  /** Nome do serviço nos logs estruturados. */
  service?: string;
  root?: string;
  /** Diretório de Docker secrets (default `/run/secrets`). */
  secretsDir?: string;
  /** Timeout para aguardar Postgres (ms). */
  postgresWaitMs?: number;
};

/**
 * Hook de boot (API/worker): hidrata secrets Docker, aplica migrate deploy e falha o processo se der erro.
 * Idempotente; multi-réplica via advisory lock. Não executa seed nem `migrate dev`.
 */
export async function runBootMigrations(options: BootMigrateOptions = {}): Promise<void> {
  const env = options.env ?? process.env;
  const service = options.service ?? 'sonder-db-bootstrap';
  const appVersion = env.APP_VERSION?.trim() || env.npm_package_version?.trim() || 'unknown';
  const bootLog = (event: string, extra: Record<string, unknown> = {}): void => {
    console.info(JSON.stringify({ service, event, appVersion, ...extra }));
  };

  bootLog('boot.migrate.version', {
    node: process.version,
    cwd: process.cwd(),
  });

  hydrateBootstrapSecrets(env, options.secretsDir);
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new BootstrapError(
      'DATABASE_URL ausente. Defina a URL do database da aplicação '
      + '(env ou Docker secret `database_url`).',
    );
  }

  const root = options.root ?? findRepoRoot();
  const parsed = parseDatabaseUrl(databaseUrl);
  bootLog('boot.migrate.start', {
    database: parsed.name,
    host: parsed.host,
    root,
  });

  try {
    await applyMigrationsWithLock(
      databaseUrl,
      root,
      options.postgresWaitMs ?? DEFAULT_WAIT_MS,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'erro desconhecido';
    console.error(JSON.stringify({
      service,
      event: 'boot.migrate.failed',
      appVersion,
      error: message,
    }));
    throw error;
  }

  bootLog('boot.migrate.complete', { database: parsed.name });
}

export async function runProductionBootstrap(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  hydrateBootstrapSecrets(env);
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new BootstrapError(
      'DATABASE_URL ausente. Defina a URL do database da aplicação '
      + '(env ou Docker secret `database_url`).',
    );
  }

  const adminUrl = env.DATABASE_ADMIN_URL?.trim() || undefined;
  const parsed = parseDatabaseUrl(databaseUrl);
  log('start', { database: parsed.name, host: parsed.host, hasAdminUrl: Boolean(adminUrl) });

  await ensureDatabaseExists({ databaseUrl, adminUrl });
  await applyMigrationsWithLock(databaseUrl);

  log('complete', { database: parsed.name });

  if ((env.BOOTSTRAP_KEEP_ALIVE ?? '').toLowerCase() === 'true') {
    log('keep_alive');
    await new Promise(() => undefined);
  }
}
