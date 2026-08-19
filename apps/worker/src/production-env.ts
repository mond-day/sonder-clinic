/**
 * Fail-fast do worker em produção.
 * Não inicia o loop de jobs se o ambiente estiver incompleto.
 */

function isProduction(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.NODE_ENV ?? '').toLowerCase() === 'production';
}

function looksLocalHost(value: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return /localhost|127\.0\.0\.1/i.test(value);
  }
}

export function assertWorkerProductionEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  if (!isProduction(env)) return;

  const errors: string[] = [];
  const databaseUrl = env.DATABASE_URL?.trim() ?? '';
  if (!databaseUrl) {
    errors.push('DATABASE_URL ausente.');
  } else if (looksLocalHost(databaseUrl)) {
    errors.push('DATABASE_URL não pode apontar para localhost em produção.');
  }

  if ((env.QUEUE_DRIVER ?? '').toLowerCase() !== 'redis') {
    errors.push('QUEUE_DRIVER deve ser redis em produção.');
  }
  if (!env.REDIS_URL?.trim()) {
    errors.push('REDIS_URL ausente (obrigatório com QUEUE_DRIVER=redis).');
  } else if (looksLocalHost(env.REDIS_URL)) {
    errors.push('REDIS_URL não pode apontar para localhost em produção.');
  }

  const storage = (env.STORAGE_DRIVER ?? 'local').toLowerCase();
  if (storage === 'local') {
    errors.push('STORAGE_DRIVER=local não é permitido em produção (use minio|s3).');
  }

  const master = env.ENCRYPTION_MASTER_KEY?.trim() ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(master)) {
    errors.push('ENCRYPTION_MASTER_KEY deve ser 64 hex (credenciais criptografadas no outbox).');
  }

  if (errors.length) {
    throw new Error(
      `Ambiente de produção inválido no worker — recusando startup:\n- ${errors.join('\n- ')}`,
    );
  }
}
