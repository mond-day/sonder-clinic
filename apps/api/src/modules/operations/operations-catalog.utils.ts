import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, prisma } from '@sonder/database';
import { money } from './operations-finance.utils';

export async function updateProcedure(
  organizationId: string,
  id: string,
  input: {
    internalCode?: string;
    tussCode?: string | null;
    name?: string;
    specialty?: string | null;
    defaultDuration?: number;
    defaultSessions?: number;
    requiresTooth?: boolean;
    requiresFace?: boolean;
    requiresConsent?: boolean;
    active?: boolean;
  },
) {
  const existing = await prisma.procedure.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundException('Procedimento não encontrado.');
  if (input.internalCode && input.internalCode !== existing.internalCode) {
    const clash = await prisma.procedure.findFirst({
      where: { organizationId, internalCode: input.internalCode, id: { not: id } },
    });
    if (clash) throw new ConflictException('Já existe um procedimento com este código interno.');
  }
  try {
    return await prisma.procedure.update({
      where: { id },
      data: {
        internalCode: input.internalCode,
        tussCode: input.tussCode === undefined ? undefined : input.tussCode,
        name: input.name,
        specialty: input.specialty === undefined ? undefined : input.specialty,
        defaultDuration: input.defaultDuration,
        defaultSessions: input.defaultSessions,
        requiresTooth: input.requiresTooth,
        requiresFace: input.requiresFace,
        requiresConsent: input.requiresConsent,
        active: input.active,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Já existe um procedimento com este código interno.');
    }
    throw error;
  }
}

export function listPriceTables(organizationId: string, clinicId?: string) {
  return prisma.priceTable.findMany({
    where: {
      organizationId,
      ...(clinicId ? { OR: [{ clinicId }, { clinicId: null }] } : {}),
    },
    include: { items: { include: { procedure: { select: { id: true, name: true, internalCode: true } } } } },
    orderBy: { name: 'asc' },
  });
}

export async function createPriceTable(
  organizationId: string,
  input: {
    name: string;
    type: string;
    clinicId?: string;
    validFrom: string;
    validUntil?: string;
    items?: Array<{ procedureId: string; price: string; cost?: string }>;
  },
) {
  if (input.clinicId) {
    const clinic = await prisma.clinic.findFirst({ where: { id: input.clinicId, organizationId } });
    if (!clinic) throw new NotFoundException('Clínica não encontrada.');
  }
  return prisma.priceTable.create({
    data: {
      organizationId,
      clinicId: input.clinicId,
      name: input.name.trim(),
      type: input.type.trim(),
      validFrom: new Date(`${input.validFrom}T00:00:00.000Z`),
      validUntil: input.validUntil ? new Date(`${input.validUntil}T00:00:00.000Z`) : null,
      items: input.items?.length
        ? {
            create: input.items.map((item) => ({
              procedureId: item.procedureId,
              price: money(item.price),
              cost: money(item.cost ?? '0'),
            })),
          }
        : undefined,
    },
    include: { items: true },
  });
}

export async function updatePriceTable(
  organizationId: string,
  id: string,
  input: {
    name?: string;
    type?: string;
    active?: boolean;
    validFrom?: string;
    validUntil?: string | null;
  },
) {
  const table = await prisma.priceTable.findFirst({ where: { id, organizationId } });
  if (!table) throw new NotFoundException('Tabela de preço não encontrada.');
  return prisma.priceTable.update({
    where: { id },
    data: {
      name: input.name?.trim(),
      type: input.type?.trim(),
      active: input.active,
      validFrom: input.validFrom ? new Date(`${input.validFrom}T00:00:00.000Z`) : undefined,
      validUntil: input.validUntil === undefined
        ? undefined
        : input.validUntil
          ? new Date(`${input.validUntil}T00:00:00.000Z`)
          : null,
    },
    include: { items: true },
  });
}

export async function upsertPriceTableItem(
  organizationId: string,
  priceTableId: string,
  input: { procedureId: string; price: string; cost?: string },
) {
  const table = await prisma.priceTable.findFirst({ where: { id: priceTableId, organizationId } });
  if (!table) throw new NotFoundException('Tabela de preço não encontrada.');
  const procedure = await prisma.procedure.findFirst({
    where: { id: input.procedureId, organizationId },
  });
  if (!procedure) throw new NotFoundException('Procedimento não encontrado.');
  return prisma.priceTableItem.upsert({
    where: { priceTableId_procedureId: { priceTableId, procedureId: input.procedureId } },
    create: {
      priceTableId,
      procedureId: input.procedureId,
      price: money(input.price),
      cost: money(input.cost ?? '0'),
    },
    update: {
      price: money(input.price),
      cost: input.cost !== undefined ? money(input.cost) : undefined,
    },
  });
}

export async function deletePriceTableItem(organizationId: string, priceTableId: string, itemId: string) {
  const item = await prisma.priceTableItem.findFirst({
    where: { id: itemId, priceTableId, table: { organizationId } },
  });
  if (!item) throw new NotFoundException('Item de tabela não encontrado.');
  await prisma.priceTableItem.delete({ where: { id: itemId } });
  return { success: true as const };
}

export async function resolveProcedurePrice(
  organizationId: string,
  procedureId: string,
  clinicId?: string,
): Promise<{ price: string; priceTableId: string | null; priceTableItemId: string | null }> {
  const now = new Date();
  const tables = await prisma.priceTable.findMany({
    where: {
      organizationId,
      active: true,
      validFrom: { lte: now },
      AND: [
        { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
        clinicId ? { OR: [{ clinicId }, { clinicId: null }] } : { clinicId: null },
      ],
    },
    include: {
      items: { where: { procedureId }, take: 1 },
    },
    orderBy: [{ clinicId: 'desc' }, { validFrom: 'desc' }],
  });
  for (const table of tables) {
    const item = table.items[0];
    if (item) {
      return {
        price: item.price.toFixed(2),
        priceTableId: table.id,
        priceTableItemId: item.id,
      };
    }
  }
  throw new BadRequestException('Não há preço vigente para este procedimento.');
}

export function listFinanceCategories(organizationId: string, kind?: string) {
  return prisma.financeCategory.findMany({
    where: { organizationId, ...(kind ? { kind } : {}), active: true },
    orderBy: { name: 'asc' },
  });
}

export async function createFinanceCategory(
  organizationId: string,
  input: { name: string; kind: string; clinicId?: string },
) {
  if (input.clinicId) {
    const clinic = await prisma.clinic.findFirst({ where: { id: input.clinicId, organizationId } });
    if (!clinic) throw new NotFoundException('Clínica não encontrada.');
  }
  try {
    return await prisma.financeCategory.create({
      data: {
        organizationId,
        clinicId: input.clinicId,
        name: input.name.trim(),
        kind: input.kind.trim().toUpperCase(),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Categoria já existe para este tipo.');
    }
    throw error;
  }
}

export async function updateFinanceCategory(
  organizationId: string,
  id: string,
  input: { name?: string; active?: boolean },
) {
  const existing = await prisma.financeCategory.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundException('Categoria não encontrada.');
  return prisma.financeCategory.update({
    where: { id },
    data: { name: input.name?.trim(), active: input.active },
  });
}

export function listCostCenters(organizationId: string) {
  return prisma.costCenter.findMany({
    where: { organizationId, active: true },
    orderBy: { name: 'asc' },
  });
}

export async function createCostCenter(
  organizationId: string,
  input: { name: string; code?: string; clinicId?: string },
) {
  try {
    return await prisma.costCenter.create({
      data: {
        organizationId,
        clinicId: input.clinicId,
        name: input.name.trim(),
        code: input.code?.trim(),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Centro de custo já existe.');
    }
    throw error;
  }
}

export async function updateCostCenter(
  organizationId: string,
  id: string,
  input: { name?: string; code?: string | null; active?: boolean },
) {
  const existing = await prisma.costCenter.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundException('Centro de custo não encontrado.');
  return prisma.costCenter.update({
    where: { id },
    data: {
      name: input.name?.trim(),
      code: input.code === undefined ? undefined : input.code,
      active: input.active,
    },
  });
}
