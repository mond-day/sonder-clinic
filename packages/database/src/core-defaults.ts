import type { Prisma, PrismaClient } from '@prisma/client';
import { installDefaultAnamnesisTemplates } from '../prisma/seeds/anamnesis';
import { ODONTOGRAM_CONDITIONS, PERMISSION_CODES } from './permissions';

export type PrismaLike = PrismaClient | Prisma.TransactionClient;

export { ODONTOGRAM_CONDITIONS, PERMISSION_CODES };

export async function installPermissions(db: PrismaLike): Promise<void> {
  for (const code of PERMISSION_CODES) {
    await db.permission.upsert({
      where: { code },
      update: {},
      create: { code, description: code },
    });
  }
}

export async function installAdminRole(
  db: PrismaLike,
  organizationId: string,
): Promise<{ id: string }> {
  const role = await db.role.upsert({
    where: { organizationId_code: { organizationId, code: 'ADMIN' } },
    update: { name: 'Administrador' },
    create: { organizationId, name: 'Administrador', code: 'ADMIN' },
  });
  const persisted = await db.permission.findMany({
    where: { code: { in: [...PERMISSION_CODES] } },
  });
  await db.rolePermission.createMany({
    data: persisted.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
    skipDuplicates: true,
  });
  return { id: role.id };
}

export async function installOdontogramConditions(
  db: PrismaLike,
  organizationId: string,
): Promise<void> {
  for (const [code, name, color] of ODONTOGRAM_CONDITIONS) {
    await db.odontogramCondition.upsert({
      where: { organizationId_code: { organizationId, code } },
      update: {},
      create: { organizationId, code, name, color },
    });
  }
}

/**
 * Defaults obrigatórios para o sistema funcionar (sem dados de demonstração).
 * Seguro para setup de produção.
 */
export async function installCoreDefaults(
  db: PrismaLike,
  organizationId: string,
): Promise<{ adminRoleId: string }> {
  await installPermissions(db);
  const adminRole = await installAdminRole(db, organizationId);
  await installOdontogramConditions(db, organizationId);
  await installDefaultAnamnesisTemplates(db as PrismaClient, organizationId);
  return { adminRoleId: adminRole.id };
}
