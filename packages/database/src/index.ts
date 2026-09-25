import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Um único PrismaClient por processo (dev e prod).
 * Várias instâncias esgotam o pool do Postgres e geram
 * `Connection reset by peer` / "too many clients" em produção.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

globalForPrisma.prisma = prisma;

/** Falhas transitórias de rede/pool (ex.: Connection reset by peer no proxy Postgres). */
export function isTransientPrismaError(error: unknown): boolean {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  if (code === 'P1001' || code === 'P1017' || code === 'P2024' || code === 'P1008') return true;
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Connection reset|ECONNRESET|Can't reach database|Server has closed the connection|ConnectionTerminated|timed out/i.test(message);
}

/**
 * Reexecuta uma vez após reconectar — útil em uploads que já gravaram no storage
 * e falhariam só na persistência do metadata.
 */
export async function withTransientDbRetry<T>(
  operation: () => Promise<T>,
  options?: { retries?: number; delayMs?: number; onRetry?: (error: unknown) => void },
): Promise<T> {
  const retries = options?.retries ?? 1;
  const delayMs = options?.delayMs ?? 200;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      if (attempt > 0) {
        options?.onRetry?.(lastError);
        await prisma.$connect().catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isTransientPrismaError(error)) throw error;
    }
  }
  throw lastError;
}

export { Prisma } from '@prisma/client';
export {
  installAdminRole,
  installCoreDefaults,
  installOdontogramConditions,
  installPermissions,
} from './core-defaults.ts';
export { ODONTOGRAM_CONDITIONS, PERMISSION_CODES } from './permissions.ts';
export { INSTALLATION_SINGLETON_ID } from './installation.ts';
export {
  BootstrapError,
  applyMigrations,
  applyMigrationsWithLock,
  assertMigrationsPresent,
  assertRequiredColumns,
  hydrateBootstrapSecrets,
  runBootMigrations,
  runProductionBootstrap,
} from './bootstrap.ts';
export type { BootMigrateOptions } from './bootstrap.ts';
