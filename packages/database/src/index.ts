import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export { Prisma } from '@prisma/client';
export {
  installAdminRole,
  installCoreDefaults,
  installOdontogramConditions,
  installPermissions,
} from './core-defaults.ts';
export { ODONTOGRAM_CONDITIONS, PERMISSION_CODES } from './permissions.ts';
export { INSTALLATION_SINGLETON_ID } from './installation.ts';
