/**
 * Fail-fast de ambiente em produção.
 * Recusa startup se secrets/drivers críticos estiverem ausentes, fracos ou default.
 */

const WEAK_JWT = [
  'change-me-access-dev-only-min-32-chars!!',
  'change-me-refresh-dev-only-min-32-chars!',
  'change-me-access-ci-only-min-32-chars!!',
  'change-me-refresh-ci-only-min-32-chars!',
];

const DEFAULT_ENCRYPTION =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function isProduction(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.NODE_ENV ?? '').toLowerCase() === 'production';
}

function looksLocalDatabase(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url);
  }
}

export function assertProductionEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  if (!isProduction(env)) return;

  const errors: string[] = [];

  const access = env.JWT_ACCESS_SECRET?.trim() ?? '';
  const refresh = env.JWT_REFRESH_SECRET?.trim() ?? '';
  if (!access || access.length < 32 || WEAK_JWT.includes(access)) {
    errors.push('JWT_ACCESS_SECRET ausente, fraco ou valor default.');
  }
  if (!refresh || refresh.length < 32 || WEAK_JWT.includes(refresh)) {
    errors.push('JWT_REFRESH_SECRET ausente, fraco ou valor default.');
  }

  const master = env.ENCRYPTION_MASTER_KEY?.trim() ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(master) || master.toLowerCase() === DEFAULT_ENCRYPTION) {
    errors.push('ENCRYPTION_MASTER_KEY deve ser 64 hex e não pode ser o default do .env.example.');
  }

  if (env.COOKIE_SECURE !== 'true') {
    errors.push('COOKIE_SECURE deve ser true em produção.');
  }

  const databaseUrl = env.DATABASE_URL?.trim() ?? '';
  if (!databaseUrl) {
    errors.push('DATABASE_URL ausente.');
  } else if (looksLocalDatabase(databaseUrl)) {
    errors.push('DATABASE_URL não pode apontar para localhost em produção.');
  }

  if ((env.QUEUE_DRIVER ?? '').toLowerCase() !== 'redis') {
    errors.push('QUEUE_DRIVER deve ser redis em produção.');
  }
  if (!env.REDIS_URL?.trim()) {
    errors.push('REDIS_URL ausente (obrigatório com QUEUE_DRIVER=redis).');
  }

  const storage = (env.STORAGE_DRIVER ?? 'local').toLowerCase();
  if (storage === 'local') {
    errors.push('STORAGE_DRIVER=local não é permitido em produção (use minio|s3).');
  }

  if (!env.CORS_ORIGIN?.trim()) {
    errors.push('CORS_ORIGIN deve ser explícito em produção (sem fallback localhost).');
  }

  if (errors.length) {
    throw new Error(
      `Ambiente de produção inválido — recusando startup:\n- ${errors.join('\n- ')}`,
    );
  }
}

export function isSwaggerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.SWAGGER_ENABLED === 'true') return true;
  if (env.SWAGGER_ENABLED === 'false') return false;
  return !isProduction(env);
}
