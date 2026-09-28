import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, prisma } from '@sonder/database';
import { z } from 'zod';
import { assertClinicInScope, resolveClinicScope } from '../../common/clinic-scope';
import { parseWithZod } from '../../common/zod-validation';
import { appointmentsImport } from './definitions/appointments.import';
import { cashflowImport } from './definitions/cashflow.import';
import { patientsImport } from './definitions/patients.import';
import { treatmentPlansImport } from './definitions/treatment-plans.import';
import { treatmentsImport } from './definitions/treatments.import';
import { revertBatchRecords } from './import-revert';
import type { ImportContext, ImportDefinition, ImportKind, ImportPlan, ParsedRow, SheetRow } from './import-types';
import { readSheet, SpreadsheetError } from './xlsx-reader';

export const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
const IMPORT_MAX_ROWS = 5000;
const ISSUES_LIMIT = 300;
const TX_OPTIONS = { timeout: 180_000, maxWait: 15_000 } as const;

export const IMPORT_SLUGS = {
  patients: 'PATIENTS',
  'treatment-plans': 'TREATMENT_PLANS',
  treatments: 'TREATMENTS',
  appointments: 'APPOINTMENTS',
  cashflow: 'CASHFLOW',
} as const satisfies Record<string, ImportKind>;

export type ImportSlug = keyof typeof IMPORT_SLUGS;

// Cada definição tem tipos próprios de linha; aqui só importa o contrato comum.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DEFINITIONS: Record<ImportKind, ImportDefinition<any, any>> = {
  PATIENTS: patientsImport,
  TREATMENT_PLANS: treatmentPlansImport,
  TREATMENTS: treatmentsImport,
  APPOINTMENTS: appointmentsImport,
  CASHFLOW: cashflowImport,
};

export type ImportAuth = { organizationId: string; userId: string; permissions: string[] };
export type ImportUpload = { originalname: string; size: number; buffer: Buffer; mimetype: string };

const optionalUuid = z.string().uuid().or(z.literal('')).optional();

const optionsSchema = z.object({
  clinicId: z.string().uuid('Clínica inválida.'),
  unitId: optionalUuid,
});

const listSchema = z.object({
  clinicId: z.string().uuid(),
  kind: z.enum(Object.keys(IMPORT_SLUGS) as [ImportSlug, ...ImportSlug[]]).optional(),
});

const cashQuerySchema = z.object({
  clinicId: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

type Prepared = {
  definition: ImportDefinition<unknown, unknown>;
  ctx: ImportContext;
  fileName: string;
  fileSha256: string;
  totalRows: number;
  parsed: ParsedRow<unknown>[];
  ignoredColumns: string[];
};

function kindFromSlug(slug: string): ImportKind {
  const kind = IMPORT_SLUGS[slug as ImportSlug];
  if (!kind) throw new NotFoundException('Tipo de importação desconhecido.');
  return kind;
}

function slugFromKind(kind: ImportKind): ImportSlug {
  return (Object.keys(IMPORT_SLUGS) as ImportSlug[]).find((slug) => IMPORT_SLUGS[slug] === kind)!;
}

function assertKindPermission(auth: ImportAuth, definition: ImportDefinition<unknown, unknown>) {
  if (!auth.permissions.includes('organization.manage') && !auth.permissions.includes(definition.permission)) {
    throw new ForbiddenException(`Sem permissão para importar ${definition.label.toLowerCase()}.`);
  }
}

function assertUpload(file: ImportUpload | undefined): asserts file is ImportUpload {
  if (!file?.buffer?.length) throw new BadRequestException('Envie o arquivo da planilha (.xlsx).');
  if (file.size > IMPORT_MAX_FILE_BYTES) throw new BadRequestException('Arquivo maior que 5 MB.');
  if (!/\.xlsx$/i.test(file.originalname)) throw new BadRequestException('Formato não suportado. Envie um arquivo .xlsx.');
  // .xlsx é um ZIP: assinatura "PK\x03\x04".
  if (file.buffer.subarray(0, 4).toString('binary') !== 'PK\u0003\u0004') {
    throw new BadRequestException('O arquivo não é uma planilha .xlsx válida.');
  }
}

function safeFileName(name: string): string {
  return name.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120);
}

function planSummary(plan: ImportPlan<unknown>) {
  const counts = { create: 0, skip: 0, error: 0 };
  for (const row of plan.rows) counts[row.status === 'CREATE' ? 'create' : row.status === 'SKIP' ? 'skip' : 'error'] += 1;
  return counts;
}

function translateWriteError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictException('Um registro da planilha já existe no sistema (conflito de chave única). Nada foi gravado; gere a prévia novamente.');
  }
  const message = error instanceof Error ? error.message : '';
  if (message.includes('no_overlap')) {
    throw new ConflictException('Conflito de horário na agenda durante a gravação. Nada foi gravado; gere a prévia novamente.');
  }
  throw error;
}

@Injectable()
export class ImportsService {
  private async prepare(auth: ImportAuth, slug: string, file: ImportUpload | undefined, body: unknown): Promise<Prepared> {
    const definition = DEFINITIONS[kindFromSlug(slug)] as ImportDefinition<unknown, unknown>;
    assertKindPermission(auth, definition);
    const parsedOptions = parseWithZod(optionsSchema, body);
    const options = {
      clinicId: parsedOptions.clinicId,
      unitId: parsedOptions.unitId || undefined,
    };
    const clinic = await prisma.clinic.findFirst({
      where: { id: options.clinicId, organizationId: auth.organizationId },
      select: { id: true, organization: { select: { timezone: true } } },
    });
    if (!clinic) throw new NotFoundException('Clínica não encontrada.');
    assertClinicInScope(await resolveClinicScope(auth.organizationId, auth.userId, auth.permissions), clinic.id);
    assertUpload(file);

    let sheet: { headers: string[]; rows: SheetRow[] };
    try {
      sheet = await readSheet(file.buffer, IMPORT_MAX_ROWS);
    } catch (error) {
      if (error instanceof SpreadsheetError) throw new BadRequestException(error.message);
      throw error;
    }
    const missing = definition.requiredColumns.filter((column) => !sheet.headers.includes(column));
    if (missing.length) {
      throw new BadRequestException(`Esta planilha não parece ser de ${definition.label.toLowerCase()}. Colunas obrigatórias ausentes: ${missing.join(', ')}.`);
    }
    if (!sheet.rows.length) throw new BadRequestException('A planilha não tem linhas de dados.');

    const ctx: ImportContext = {
      organizationId: auth.organizationId,
      clinicId: clinic.id,
      actorId: auth.userId,
      options,
      now: new Date(),
      timezone: clinic.organization.timezone,
    };
    return {
      definition,
      ctx,
      fileName: safeFileName(file.originalname),
      fileSha256: createHash('sha256').update(file.buffer).digest('hex'),
      totalRows: sheet.rows.length,
      parsed: sheet.rows.map((row) => definition.parseRow(row, ctx)),
      ignoredColumns: sheet.headers.filter((header) => !definition.optionalColumns.includes(header)),
    };
  }

  async preview(auth: ImportAuth, slug: string, file: ImportUpload | undefined, body: unknown) {
    const prepared = await this.prepare(auth, slug, file, body);
    const plan = await prepared.definition.plan(prisma, prepared.ctx, prepared.parsed);
    const counts = planSummary(plan);
    const issues = plan.rows.filter((row) => row.status !== 'CREATE' || row.messages.length);
    return {
      kind: slugFromKind(prepared.definition.kind),
      label: prepared.definition.label,
      fileName: prepared.fileName,
      totalRows: prepared.totalRows,
      counts,
      blocking: plan.blocking,
      warnings: plan.warnings,
      creations: plan.creations,
      mappings: plan.mappings,
      ignoredColumns: prepared.ignoredColumns,
      issues: issues.slice(0, ISSUES_LIMIT),
      issuesTruncated: Math.max(0, issues.length - ISSUES_LIMIT),
      sample: plan.sample,
      canCommit: plan.blocking.length === 0 && counts.create > 0,
    };
  }

  /** Refaz a prévia dentro da transação (com lock por organização) e grava só as linhas CREATE. */
  async commit(auth: ImportAuth, slug: string, file: ImportUpload | undefined, body: unknown) {
    const prepared = await this.prepare(auth, slug, file, body);
    const { definition, ctx } = prepared;
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`import:${ctx.organizationId}`}))`;
        const plan = await definition.plan(tx, ctx, prepared.parsed);
        if (plan.blocking.length) throw new BadRequestException(plan.blocking.join(' '));
        if (!plan.items.length) throw new BadRequestException('Nenhuma linha nova para importar.');
        const counts = planSummary(plan);

        const batch = await tx.importBatch.create({
          data: {
            organizationId: ctx.organizationId,
            clinicId: ctx.clinicId,
            kind: definition.kind,
            fileName: prepared.fileName,
            fileSha256: prepared.fileSha256,
            createdById: ctx.actorId,
            summary: { totalRows: prepared.totalRows, ...counts },
          },
          select: { id: true },
        });
        const records = await definition.write(tx, { ...ctx, batchId: batch.id }, plan);
        await tx.importBatchRecord.createMany({
          data: records.map((record) => ({
            batchId: batch.id,
            organizationId: ctx.organizationId,
            entity: record.entity,
            entityId: record.entityId,
            naturalKey: record.naturalKey ?? null,
          })),
        });
        const written = records.reduce<Record<string, number>>((acc, record) => {
          acc[record.entity] = (acc[record.entity] ?? 0) + 1;
          return acc;
        }, {});
        await tx.importBatch.update({
          where: { id: batch.id },
          data: { summary: { totalRows: prepared.totalRows, ...counts, written } },
        });
        await tx.auditEvent.create({
          data: {
            actorId: ctx.actorId,
            action: 'import.commit',
            entity: 'ImportBatch',
            entityId: batch.id,
            clinicId: ctx.clinicId,
            changes: { kind: definition.kind, ...counts, written },
            correlationId: randomUUID(),
          },
        });
        return { batchId: batch.id, kind: slugFromKind(definition.kind), counts, written };
      }, TX_OPTIONS);
    } catch (error) {
      return translateWriteError(error);
    }
  }

  async listBatches(auth: ImportAuth, query: unknown) {
    const { clinicId, kind } = parseWithZod(listSchema, query);
    await this.assertClinic(auth, clinicId);
    const batches = await prisma.importBatch.findMany({
      where: { organizationId: auth.organizationId, clinicId, ...(kind ? { kind: IMPORT_SLUGS[kind] } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, kind: true, status: true, fileName: true, summary: true, createdAt: true, revertedAt: true },
    });
    return batches.map((batch) => ({ ...batch, kind: slugFromKind(batch.kind) }));
  }

  async revert(auth: ImportAuth, batchId: string) {
    parseWithZod(z.string().uuid('Lote inválido.'), batchId);
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`import:${auth.organizationId}`}))`;
      const batch = await tx.importBatch.findFirst({
        where: { id: batchId, organizationId: auth.organizationId },
        select: { id: true, kind: true, status: true, clinicId: true },
      });
      if (!batch) throw new NotFoundException('Lote de importação não encontrado.');
      assertKindPermission(auth, DEFINITIONS[batch.kind] as ImportDefinition<unknown, unknown>);
      assertClinicInScope(await resolveClinicScope(auth.organizationId, auth.userId, auth.permissions), batch.clinicId);
      if (batch.status !== 'COMMITTED') throw new ConflictException('Este lote já foi revertido.');

      const removed = await revertBatchRecords(tx, auth.organizationId, batch.id);
      await tx.importBatch.update({
        where: { id: batch.id },
        data: { status: 'REVERTED', revertedAt: new Date(), revertedById: auth.userId },
      });
      await tx.auditEvent.create({
        data: {
          actorId: auth.userId,
          action: 'import.revert',
          entity: 'ImportBatch',
          entityId: batch.id,
          clinicId: batch.clinicId,
          changes: { kind: batch.kind, removed },
          correlationId: randomUUID(),
        },
      });
      return { batchId: batch.id, removed };
    }, TX_OPTIONS);
  }

  /** Histórico de caixa importado: somente leitura, nunca somado ao fluxo de caixa real. */
  async cashEntries(auth: ImportAuth, query: unknown) {
    const { clinicId, from, to } = parseWithZod(cashQuerySchema, query);
    await this.assertClinic(auth, clinicId);
    const range = {
      ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
      ...(to ? { lte: new Date(`${to}T00:00:00.000Z`) } : {}),
    };
    const hasRange = Boolean(from || to);
    const where: Prisma.ImportedCashEntryWhereInput = {
      organizationId: auth.organizationId,
      clinicId,
      batch: { status: 'COMMITTED' },
      ...(hasRange ? { OR: [{ paidAt: range }, { paidAt: null, dueDate: range }] } : {}),
    };
    const [items, grouped] = await Promise.all([
      prisma.importedCashEntry.findMany({
        where,
        orderBy: [{ paidAt: { sort: 'desc', nulls: 'last' } }, { dueDate: 'desc' }],
        take: 300,
        select: {
          id: true, kind: true, counterpartyName: true, description: true, category: true, dueDate: true,
          paidAt: true, amount: true, netAmount: true, paid: true, paymentMethod: true, professionalName: true,
        },
      }),
      prisma.importedCashEntry.groupBy({ by: ['kind', 'paid'], where, _sum: { amount: true }, _count: { _all: true } }),
    ]);
    const total = (kind: string, paid?: boolean) => grouped
      .filter((row) => row.kind === kind && (paid === undefined || row.paid === paid))
      .reduce((sum, row) => sum + Number(row._sum.amount ?? 0), 0);
    return {
      totals: {
        inflowPaid: total('INFLOW', true),
        inflowOpen: total('INFLOW', false),
        outflowPaid: total('OUTFLOW', true),
        outflowOpen: total('OUTFLOW', false),
        count: grouped.reduce((sum, row) => sum + row._count._all, 0),
      },
      items: items.map((item) => ({
        ...item,
        amount: Number(item.amount),
        netAmount: item.netAmount === null ? null : Number(item.netAmount),
      })),
    };
  }

  private async assertClinic(auth: ImportAuth, clinicId: string) {
    const clinic = await prisma.clinic.findFirst({ where: { id: clinicId, organizationId: auth.organizationId }, select: { id: true } });
    if (!clinic) throw new NotFoundException('Clínica não encontrada.');
    assertClinicInScope(await resolveClinicScope(auth.organizationId, auth.userId, auth.permissions), clinicId);
  }
}