import { Client } from 'pg';

type Mode = 'precheck' | 'post-bootstrap' | 'post-redeploy';

function adminUrl(): string {
  if (process.env.DATABASE_ADMIN_URL?.trim()) return process.env.DATABASE_ADMIN_URL;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL ausente');
  const parsed = new URL(url);
  parsed.pathname = '/postgres';
  return parsed.toString();
}

async function withClient(url: string, fn: (client: Client) => Promise<void>): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await fn(client);
  } finally {
    await client.end();
  }
}

async function precheck(): Promise<void> {
  await withClient(adminUrl(), async (client) => {
    const result = await client.query("SELECT datname FROM pg_database WHERE datname = 'sonder_clinic'");
    if ((result.rowCount ?? 0) > 0) {
      throw new Error('sonder_clinic já existe — este teste exige database alvo ausente.');
    }
  });
  console.info('precheck: sonder_clinic ausente');
}

async function postBootstrap(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL ausente');
  await withClient(url, async (client) => {
    const tables = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
      [['_prisma_migrations', 'Organization', 'User', 'SystemInstallation']],
    );
    if (tables.rowCount !== 4) {
      throw new Error(`tabelas principais ausentes: ${tables.rows.map((row) => row.tablename).join(',')}`);
    }
    const pending = await client.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NULL');
    if ((pending.rows[0]?.n ?? 0) > 0) throw new Error('migrations pendentes');
    const demo = await client.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM "User" WHERE email = $1', ['admin@sonder.local']);
    if ((demo.rows[0]?.n ?? 0) > 0) throw new Error('usuário demo presente em fresh install');
    const orgs = await client.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM "Organization"');
    if ((orgs.rows[0]?.n ?? 0) > 0) throw new Error('organização demo presente em fresh install');
  });
  console.info('post-bootstrap: schema ok, sem demo');
}

async function postRedeploy(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL ausente');
  await withClient(url, async (client) => {
    const orgs = await client.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM "Organization"');
    const users = await client.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM "User"');
    if ((orgs.rows[0]?.n ?? 0) !== 1 || (users.rows[0]?.n ?? 0) !== 1) {
      throw new Error(`redeploy alterou dados: orgs=${orgs.rows[0]?.n} users=${users.rows[0]?.n}`);
    }
  });
  console.info('redeploy idempotente: dados intactos');
}

const mode = process.argv[2] as Mode;
const runners: Record<Mode, () => Promise<void>> = {
  precheck,
  'post-bootstrap': postBootstrap,
  'post-redeploy': postRedeploy,
};

void (async () => {
  const run = runners[mode];
  if (!run) throw new Error(`modo inválido: ${mode}`);
  await run();
})().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
