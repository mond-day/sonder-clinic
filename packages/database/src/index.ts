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
