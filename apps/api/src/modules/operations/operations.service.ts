import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Prisma, prisma } from '@sonder/database';
import { z } from 'zod';
import { buildClinicalDocumentPdf } from '../../common/pdf';
import { parseWithZod } from '../../common/zod-validation';
import { CertificateService } from '../settings/certificate.service';
import {
  buildReceivableFinanceView,
  computePayableStatus,
  computePaymentRefundStatus,
  computeReceivableStatus,
  confirmedNetPaid,
  money,
  netPayablePaid,
  netPaidAmount,
  positiveMoney,
  refundedTotal,
} from './operations-finance.utils';
import {
  createCostCenter as catalogCreateCostCenter,
  createFinanceCategory as catalogCreateCategory,
  createPriceTable as catalogCreatePriceTable,
  deletePriceTableItem as catalogDeletePriceItem,
  listCostCenters as catalogListCostCenters,
  listFinanceCategories as catalogListCategories,
  listPriceTables as catalogListPriceTables,
  resolveProcedurePrice as catalogResolvePrice,
  updateCostCenter as catalogUpdateCostCenter,
  updateFinanceCategory as catalogUpdateCategory,
  updatePriceTable as catalogUpdatePriceTable,
  updateProcedure as catalogUpdateProcedure,
  upsertPriceTableItem as catalogUpsertPriceItem,
} from './operations-catalog.utils';
import {
  createMessageTemplate,
  listMessageTemplates,
  updateMessageTemplate,
} from '../patients/patients-guardians-merge.utils';
import {
  createMessagingChannel,
  listMessagingChannels,
  sendManualMessage,
  updateMessagingChannel,
} from './operations-messaging.utils';
import {
  assertCidConsent,
  assertDocumentMutable,
  assertIgnoredWarningsJustified,
  assertTemplateEditable,
  buildServerFrozenContent,
  DEFAULT_PATIENT_FOLDERS,
  defaultFolderNameForTemplateType,
  hashDocumentContent,
  nextDocumentStatusAfterSign,
  normalizePrescriptionItems,
  parseSignatureRules,
  publicDocumentSafeView,
  stripClientIdentity,
  validateDocumentTemplateStructure,
  validateTemplateVariables,
  type DocumentStatus,
  type DocumentTemplateStatus,
} from './operations-documents.utils';
import {
  assertPlanTransition,
  canTransitionPlan,
  derivePlanStatusFromItems,
  isTerminalPlan,
  nextItemStatusAfterSession,
  planEditableStatuses,
  planMutableContentStatuses,
  type TreatmentItemStatus,
  type TreatmentPlanStatus,
} from './operations-treatments.utils';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const json = (value: unknown) => value as Prisma.InputJsonValue;
const monthStart = (value: string | Date) => {
  const date = typeof value === 'string' ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`) : value;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
};

async function lockReceivableRow(tx: Prisma.TransactionClient, receivableId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Receivable" WHERE id = ${receivableId}::uuid FOR UPDATE`;
}

async function lockPayableRow(tx: Prisma.TransactionClient, payableId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Payable" WHERE id = ${payableId}::uuid FOR UPDATE`;
}

async function recalculateReceivableStatus(
  tx: Prisma.TransactionClient,
  receivableId: string,
  netAmount: Prisma.Decimal,
) {
  const payments = await tx.payment.findMany({
    where: { receivableId, status: { in: ['CONFIRMED', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
    include: { refunds: true },
  });
  const paid = confirmedNetPaid(payments);
  const status = computeReceivableStatus(netAmount, paid);
  return tx.receivable.update({ where: { id: receivableId }, data: { status } });
}
const receivableSchema = z.object({
  clinicId: z.string().uuid(),
  patientId: z.string().uuid(),
  treatmentId: z.string().uuid().optional(),
  description: z.string().trim().min(3),
  originalAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  discount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  surcharge: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  dueDate: z.string().date(),
  paymentMethod: z.string().optional(),
});
const financeRecurrenceSchema = z.object({
  clinicId: z.string().uuid(),
  kind: z.enum(['PAYABLE', 'RECEIVABLE']),
  description: z.string().trim().min(3),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']),
  interval: z.number().int().min(1).max(36).optional(),
  nextOccurrence: z.string().date(),
  endsAt: z.string().date().optional(),
  patientId: z.string().uuid().optional(),
  supplierName: z.string().trim().min(2).optional(),
  notes: z.string().trim().min(2).optional(),
});
const financeRecurrencePatchSchema = z.object({
  description: z.string().trim().min(3).optional(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']).optional(),
  interval: z.number().int().min(1).max(36).optional(),
  nextOccurrence: z.string().date().optional(),
  endsAt: z.string().date().nullable().optional(),
  active: z.boolean().optional(),
  patientId: z.string().uuid().optional(),
  supplierName: z.string().trim().min(2).optional(),
  notes: z.string().trim().min(2).optional(),
});

@Injectable()
export class OperationsService {
  constructor(private readonly certificates: CertificateService) {}

  procedures(organizationId: string) {
    return prisma.procedure.findMany({ where: { organizationId, active: true }, orderBy: { name: 'asc' } });
  }

  createProcedure(organizationId: string, input: {
    internalCode: string; tussCode?: string; name: string; specialty?: string;
    defaultDuration: number; defaultSessions?: number; requiresTooth?: boolean; requiresFace?: boolean;
    requiresConsent?: boolean;
  }) {
    return prisma.procedure.create({ data: { organizationId, ...input } }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Já existe um procedimento com este código interno.');
      }
      throw error;
    });
  }

  updateProcedure(organizationId: string, id: string, input: Parameters<typeof catalogUpdateProcedure>[2]) {
    return catalogUpdateProcedure(organizationId, id, input);
  }

  listPriceTables(organizationId: string, clinicId?: string) {
    return catalogListPriceTables(organizationId, clinicId);
  }

  createPriceTable(organizationId: string, input: Parameters<typeof catalogCreatePriceTable>[1]) {
    return catalogCreatePriceTable(organizationId, input);
  }

  updatePriceTable(organizationId: string, id: string, input: Parameters<typeof catalogUpdatePriceTable>[2]) {
    return catalogUpdatePriceTable(organizationId, id, input);
  }

  upsertPriceTableItem(organizationId: string, priceTableId: string, input: Parameters<typeof catalogUpsertPriceItem>[2]) {
    return catalogUpsertPriceItem(organizationId, priceTableId, input);
  }

  deletePriceTableItem(organizationId: string, priceTableId: string, itemId: string) {
    return catalogDeletePriceItem(organizationId, priceTableId, itemId);
  }

  resolveProcedurePrice(organizationId: string, procedureId: string, clinicId?: string) {
    return catalogResolvePrice(organizationId, procedureId, clinicId);
  }

  listFinanceCategories(organizationId: string, kind?: string) {
    return catalogListCategories(organizationId, kind);
  }

  createFinanceCategory(organizationId: string, input: Parameters<typeof catalogCreateCategory>[1]) {
    return catalogCreateCategory(organizationId, input);
  }

  updateFinanceCategory(organizationId: string, id: string, input: Parameters<typeof catalogUpdateCategory>[2]) {
    return catalogUpdateCategory(organizationId, id, input);
  }

  listCostCenters(organizationId: string) {
    return catalogListCostCenters(organizationId);
  }

  createCostCenter(organizationId: string, input: Parameters<typeof catalogCreateCostCenter>[1]) {
    return catalogCreateCostCenter(organizationId, input);
  }

  updateCostCenter(organizationId: string, id: string, input: Parameters<typeof catalogUpdateCostCenter>[2]) {
    return catalogUpdateCostCenter(organizationId, id, input);
  }

  treatmentPlans(organizationId: string, patientId?: string, clinicId?: string, includeArchived = false) {
    return prisma.treatmentPlan.findMany({
      where: {
        organizationId,
        patientId,
        clinicId,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      include: {
        items: {
          include: { procedure: true, sessions: { where: { correctionOfId: null }, orderBy: { completedAt: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTreatmentPlan(organizationId: string, id: string) {
    const plan = await prisma.treatmentPlan.findFirst({
      where: { id, organizationId },
      include: {
        items: {
          include: {
            procedure: true,
            sessions: { include: { corrections: true }, orderBy: { completedAt: 'asc' } },
          },
          orderBy: { sortOrder: 'asc' },
        },
        events: { orderBy: { createdAt: 'desc' }, take: 100 },
        revisions: { orderBy: { version: 'desc' }, take: 20 },
      },
    });
    if (!plan) throw new NotFoundException('Plano de tratamento não encontrado.');
    return plan;
  }

  private requirePlanTransition(from: TreatmentPlanStatus, to: TreatmentPlanStatus) {
    try {
      assertPlanTransition(from, to);
    } catch (error) {
      throw new ConflictException(error instanceof Error ? error.message : 'Transição de plano inválida.');
    }
  }

  private async assertTreatmentScope(
    organizationId: string,
    input: { clinicId: string; patientId: string; professionalId: string },
  ) {
    const [clinic, patient, professional] = await Promise.all([
      prisma.clinic.findFirst({ where: { id: input.clinicId, organizationId }, select: { id: true } }),
      prisma.patient.findFirst({
        where: { id: input.patientId, organizationId },
        select: { id: true, clinics: { where: { clinicId: input.clinicId }, select: { clinicId: true } } },
      }),
      prisma.professional.findFirst({
        where: { id: input.professionalId, user: { organizationId }, status: 'ACTIVE' },
        select: { id: true },
      }),
    ]);
    if (!clinic) throw new NotFoundException('Clínica não encontrada.');
    if (!patient) throw new NotFoundException('Paciente não encontrado.');
    if (!patient.clinics.length) throw new ConflictException('Paciente não vinculado à clínica.');
    if (!professional) throw new NotFoundException('Profissional não encontrado ou inativo.');
  }

  private async assertProcedureItems(
    organizationId: string,
    items: Array<{
      procedureId: string; professionalId: string; toothFdi?: string; face?: string;
      quantity: number; unitPrice: string; discount?: string; plannedSessions?: number;
    }>,
  ) {
    if (!items.length) throw new BadRequestException('Informe ao menos um procedimento.');
    const procedureIds = [...new Set(items.map((item) => item.procedureId))];
    const professionalIds = [...new Set(items.map((item) => item.professionalId))];
    const [procedures, professionals] = await Promise.all([
      prisma.procedure.findMany({ where: { organizationId, id: { in: procedureIds }, active: true } }),
      prisma.professional.findMany({
        where: { id: { in: professionalIds }, user: { organizationId }, status: 'ACTIVE' },
      }),
    ]);
    const procedureMap = new Map(procedures.map((row) => [row.id, row]));
    const professionalSet = new Set(professionals.map((row) => row.id));
    for (const item of items) {
      const procedure = procedureMap.get(item.procedureId);
      if (!procedure) throw new NotFoundException('Procedimento inválido ou inativo.');
      if (!professionalSet.has(item.professionalId)) throw new NotFoundException('Profissional do item inválido.');
      if (procedure.requiresTooth && !item.toothFdi?.trim()) {
        throw new BadRequestException(`Procedimento ${procedure.name} exige dente/região.`);
      }
      if (procedure.requiresFace && !item.face?.trim()) {
        throw new BadRequestException(`Procedimento ${procedure.name} exige face.`);
      }
      if (item.quantity < 1) throw new BadRequestException('Quantidade deve ser positiva.');
      if ((item.plannedSessions ?? 1) < 1) throw new BadRequestException('Sessões planejadas devem ser positivas.');
      const unitPrice = money(item.unitPrice);
      const discount = money(item.discount ?? '0');
      if (unitPrice.lt(0) || discount.lt(0)) throw new BadRequestException('Preço e desconto não podem ser negativos.');
      if (discount.gt(unitPrice.mul(item.quantity))) {
        throw new BadRequestException('Desconto do item não pode superar o total.');
      }
    }
  }

  private mapItemCreates(items: Array<{
    procedureId: string; professionalId: string; toothFdi?: string; face?: string;
    quantity: number; unitPrice: string; discount?: string; plannedSessions?: number;
    urgent?: boolean; priority?: number; estimatedMinutes?: number;
  }>) {
    return items.map((item, index) => {
      const unitPrice = money(item.unitPrice);
      const discount = money(item.discount ?? '0');
      const total = unitPrice.mul(item.quantity).sub(discount);
      return {
        procedureId: item.procedureId,
        professionalId: item.professionalId,
        toothFdi: item.toothFdi,
        face: item.face,
        quantity: item.quantity,
        unitPrice,
        discount,
        total,
        plannedSessions: item.plannedSessions ?? 1,
        urgent: item.urgent ?? false,
        priority: item.priority ?? 0,
        estimatedMinutes: item.estimatedMinutes,
        sortOrder: index,
        status: 'PLANNED' as const,
      };
    });
  }

  private async recordPlanEvent(
    tx: Prisma.TransactionClient,
    input: { treatmentPlanId: string; type: string; actorId?: string; payload?: unknown },
  ) {
    await tx.treatmentPlanEvent.create({
      data: {
        treatmentPlanId: input.treatmentPlanId,
        type: input.type,
        actorId: input.actorId,
        payload: json(input.payload ?? {}),
      },
    });
  }

  private async auditTreatment(
    tx: Prisma.TransactionClient,
    input: { actorId?: string; action: string; entityId: string; clinicId: string; changes?: unknown },
  ) {
    await tx.auditEvent.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        entity: 'TreatmentPlan',
        entityId: input.entityId,
        clinicId: input.clinicId,
        changes: json(input.changes ?? {}),
        correlationId: randomUUID(),
      },
    });
  }

  private recalculateTotals(items: Array<{ unitPrice: Prisma.Decimal; quantity: number; discount: Prisma.Decimal }>, planDiscount: Prisma.Decimal) {
    const subtotal = items.reduce(
      (sum, item) => sum.add(item.unitPrice.mul(item.quantity).sub(item.discount)),
      money('0'),
    );
    if (planDiscount.gt(subtotal)) throw new ConflictException('Desconto não pode superar o subtotal.');
    return { subtotal, discount: planDiscount, total: subtotal.sub(planDiscount) };
  }

  async createTreatment(organizationId: string, actorId: string | undefined, input: {
    clinicId: string; patientId: string; professionalId: string; title: string;
    discount?: string; notes?: string; validUntil?: string; items: Array<{
      procedureId: string; professionalId: string; toothFdi?: string; face?: string;
      quantity: number; unitPrice: string; discount?: string; plannedSessions?: number; urgent?: boolean;
    }>;
  }) {
    await this.assertTreatmentScope(organizationId, input);
    await this.assertProcedureItems(organizationId, input.items);
    const itemValues = this.mapItemCreates(input.items);
    const planDiscount = money(input.discount ?? '0');
    const totals = this.recalculateTotals(itemValues, planDiscount);
    return prisma.$transaction(async (tx) => {
      const plan = await tx.treatmentPlan.create({
        data: {
          organizationId,
          clinicId: input.clinicId,
          patientId: input.patientId,
          professionalId: input.professionalId,
          title: input.title.trim(),
          notes: input.notes,
          validUntil: input.validUntil ? new Date(`${input.validUntil}T00:00:00Z`) : undefined,
          ...totals,
          priceSnapshot: { capturedAt: new Date().toISOString() },
          items: { create: itemValues },
        },
        include: { items: { include: { procedure: true }, orderBy: { sortOrder: 'asc' } } },
      });
      await this.recordPlanEvent(tx, {
        treatmentPlanId: plan.id,
        type: 'CREATED',
        actorId,
        payload: { title: plan.title, itemCount: itemValues.length, total: String(plan.total) },
      });
      await this.auditTreatment(tx, {
        actorId,
        action: 'treatment.create',
        entityId: plan.id,
        clinicId: plan.clinicId,
        changes: { title: plan.title, total: String(plan.total) },
      });
      return plan;
    });
  }

  async approveTreatment(
    organizationId: string,
    actorId: string | undefined,
    id: string,
    itemIds: string[],
    expectedVersion?: number,
    options?: { paymentMethod?: string; dueDate?: string },
  ) {
    const plan = await prisma.treatmentPlan.findFirst({ where: { id, organizationId }, include: { items: true } });
    if (!plan) throw new NotFoundException('Plano de tratamento não encontrado.');
    if (plan.archivedAt) throw new ConflictException('Plano arquivado não pode ser aprovado.');
    if (!['PRESENTED', 'PARTIALLY_APPROVED', 'APPROVED'].includes(plan.status)) {
      throw new ConflictException('Somente planos apresentados podem ser aprovados.');
    }
    if (expectedVersion != null && plan.version !== expectedVersion) {
      throw new ConflictException('Versão do plano desatualizada. Recarregue e tente novamente.');
    }
    const validIds = new Set(plan.items.filter((item) => item.status !== 'CANCELLED').map((item) => item.id));
    if (!itemIds.length || itemIds.some((itemId) => !validIds.has(itemId))) {
      throw new ConflictException('Item não pertence ao plano ou está cancelado.');
    }
    const paymentMethod = options?.paymentMethod?.trim() || undefined;
    if (!paymentMethod) {
      throw new BadRequestException('Informe a forma de pagamento na aprovação.');
    }
    const dueDate = options?.dueDate
      ? new Date(`${options.dueDate}T00:00:00Z`)
      : new Date(Date.now() + 7 * 86400_000);
    return prisma.$transaction(async (tx) => {
      await tx.treatmentItem.updateMany({
        where: { id: { in: itemIds }, treatmentPlanId: id },
        data: { status: 'APPROVED', approvedAt: new Date() },
      });
      const refreshed = await tx.treatmentItem.findMany({ where: { treatmentPlanId: id } });
      const active = refreshed.filter((item) => item.status !== 'CANCELLED');
      const allApproved = active.every((item) => ['APPROVED', 'IN_PROGRESS', 'COMPLETED'].includes(item.status));
      const nextStatus: TreatmentPlanStatus = allApproved ? 'APPROVED' : 'PARTIALLY_APPROVED';
      if (!canTransitionPlan(plan.status as TreatmentPlanStatus, nextStatus) && plan.status !== nextStatus) {
        this.requirePlanTransition(plan.status as TreatmentPlanStatus, nextStatus);
      }
      const approvedNow = refreshed.filter((item) => itemIds.includes(item.id));
      const receivableAmount = approvedNow.reduce(
        (sum, item) => sum.add(item.total),
        new Prisma.Decimal(0),
      );
      if (receivableAmount.gt(0)) {
        await tx.receivable.create({
          data: {
            organizationId,
            clinicId: plan.clinicId,
            patientId: plan.patientId,
            treatmentId: plan.id,
            description: `Tratamento · ${plan.title}`,
            originalAmount: receivableAmount,
            discount: money('0'),
            surcharge: money('0'),
            netAmount: receivableAmount,
            dueDate,
            paymentMethod,
          },
        });
      }
      const updated = await tx.treatmentPlan.update({
        where: { id },
        data: { status: nextStatus, version: { increment: 1 } },
        include: { items: { include: { procedure: true }, orderBy: { sortOrder: 'asc' } } },
      });
      await this.recordPlanEvent(tx, {
        treatmentPlanId: id,
        type: 'APPROVED',
        actorId,
        payload: { itemIds, status: nextStatus, paymentMethod, receivableAmount: receivableAmount.toString() },
      });
      await this.auditTreatment(tx, {
        actorId,
        action: 'treatment.approve',
        entityId: id,
        clinicId: plan.clinicId,
        changes: { itemIds, status: nextStatus, paymentMethod },
      });
      return updated;
    });
  }

  async updateTreatment(organizationId: string, actorId: string | undefined, id: string, input: {
    title?: string; notes?: string; discount?: string; validUntil?: string | null; version?: number;
    items?: Array<{ id: string; unitPrice?: string; quantity?: number; discount?: string; status?: string; plannedSessions?: number; toothFdi?: string; face?: string }>;
  }) {
    const plan = await prisma.treatmentPlan.findFirst({
      where: { id, organizationId },
      include: { items: { include: { procedure: { select: { name: true } } } } },
    });
    if (!plan) throw new NotFoundException('Plano de tratamento não encontrado.');
    if (plan.archivedAt) throw new ConflictException('Plano arquivado não pode ser editado.');
    if (!planEditableStatuses().includes(plan.status as TreatmentPlanStatus)) {
      throw new ConflictException('Plano concluído ou cancelado não pode ser editado.');
    }
    if (input.version != null && plan.version !== input.version) {
      throw new ConflictException('Versão do plano desatualizada. Recarregue e tente novamente.');
    }
    const newlyCompleted: Array<{ id: string; professionalId: string; procedureName: string; toothFdi: string | null }> = [];
    return prisma.$transaction(async (tx) => {
      if (input.items?.length) {
        for (const item of input.items) {
          const existing = plan.items.find((row) => row.id === item.id);
          if (!existing) throw new ConflictException('Item não pertence ao plano.');
          const nextStatus = item.status as TreatmentItemStatus | undefined;
          if (nextStatus === 'COMPLETED' && existing.status !== 'COMPLETED') {
            newlyCompleted.push({
              id: existing.id,
              professionalId: existing.professionalId,
              procedureName: existing.procedure.name,
              toothFdi: existing.toothFdi,
            });
          }
          const unitPrice = item.unitPrice != null ? money(item.unitPrice) : existing.unitPrice;
          const quantity = item.quantity ?? existing.quantity;
          const discount = item.discount != null ? money(item.discount) : existing.discount;
          if (unitPrice.lt(0) || discount.lt(0) || quantity < 1) {
            throw new BadRequestException('Valores do item inválidos.');
          }
          if (discount.gt(unitPrice.mul(quantity))) {
            throw new BadRequestException('Desconto do item não pode superar o total.');
          }
          await tx.treatmentItem.update({
            where: { id: item.id },
            data: {
              unitPrice,
              quantity,
              discount,
              total: unitPrice.mul(quantity).sub(discount),
              ...(item.plannedSessions != null ? { plannedSessions: item.plannedSessions } : {}),
              ...(item.toothFdi !== undefined ? { toothFdi: item.toothFdi } : {}),
              ...(item.face !== undefined ? { face: item.face } : {}),
              ...(nextStatus ? { status: nextStatus } : {}),
            },
          });
        }
      }
      const refreshed = await tx.treatmentItem.findMany({ where: { treatmentPlanId: id } });
      const totals = this.recalculateTotals(refreshed, money(input.discount ?? String(plan.discount)));
      const derived = derivePlanStatusFromItems(refreshed.map((item) => ({ status: item.status as TreatmentItemStatus })));
      const updated = await tx.treatmentPlan.update({
        where: { id },
        data: {
          title: input.title?.trim() ?? plan.title,
          notes: input.notes ?? plan.notes,
          validUntil: input.validUntil === null
            ? null
            : input.validUntil
              ? new Date(`${input.validUntil}T00:00:00Z`)
              : plan.validUntil,
          ...totals,
          version: { increment: 1 },
          ...(derived && derived !== plan.status ? { status: derived } : {}),
        },
        include: { items: { include: { procedure: true }, orderBy: { sortOrder: 'asc' } } },
      });
      for (const item of newlyCompleted) {
        await this.createAutoEvolution(tx, {
          organizationId,
          clinicId: plan.clinicId,
          patientId: plan.patientId,
          professionalId: item.professionalId,
          treatmentId: plan.id,
          treatmentItemId: item.id,
          renderedText: [
            `Procedimento finalizado: ${item.procedureName}.`,
            item.toothFdi ? `Dente FDI ${item.toothFdi}.` : null,
            `Plano: ${plan.title}.`,
            'Registro automático ao marcar o item como concluído.',
          ].filter(Boolean).join(' '),
        });
      }
      await this.recordPlanEvent(tx, {
        treatmentPlanId: id,
        type: 'UPDATED',
        actorId,
        payload: { title: updated.title, total: String(updated.total), version: updated.version },
      });
      await this.auditTreatment(tx, {
        actorId,
        action: 'treatment.update',
        entityId: id,
        clinicId: plan.clinicId,
        changes: { title: updated.title, total: String(updated.total), version: updated.version },
      });
      return updated;
    });
  }

  async presentTreatment(organizationId: string, actorId: string | undefined, id: string, expectedVersion?: number) {
    const plan = await prisma.treatmentPlan.findFirst({
      where: { id, organizationId },
      include: { items: { include: { procedure: true }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!plan) throw new NotFoundException('Plano de tratamento não encontrado.');
    if (plan.archivedAt) throw new ConflictException('Plano arquivado.');
    this.requirePlanTransition(plan.status as TreatmentPlanStatus, 'PRESENTED');
    if (!plan.items.filter((item) => item.status !== 'CANCELLED').length) {
      throw new BadRequestException('Plano precisa de ao menos um item para ser apresentado.');
    }
    if (expectedVersion != null && plan.version !== expectedVersion) {
      throw new ConflictException('Versão do plano desatualizada. Recarregue e tente novamente.');
    }
    const snapshot = {
      title: plan.title,
      discount: String(plan.discount),
      subtotal: String(plan.subtotal),
      total: String(plan.total),
      notes: plan.notes,
      items: plan.items.map((item) => ({
        id: item.id,
        procedureId: item.procedureId,
        procedureName: item.procedure.name,
        unitPrice: String(item.unitPrice),
        discount: String(item.discount),
        quantity: item.quantity,
        total: String(item.total),
        toothFdi: item.toothFdi,
        face: item.face,
        plannedSessions: item.plannedSessions,
      })),
      presentedAt: new Date().toISOString(),
    };
    return prisma.$transaction(async (tx) => {
      const presentedVersion = (plan.presentedVersion ?? 0) + 1;
      await tx.treatmentPlanRevision.create({
        data: {
          treatmentPlanId: id,
          version: presentedVersion,
          snapshot: json(snapshot),
          createdById: actorId,
        },
      });
      const updated = await tx.treatmentPlan.update({
        where: { id },
        data: {
          status: 'PRESENTED',
          presentedAt: new Date(),
          presentedVersion,
          priceSnapshot: json(snapshot),
          version: { increment: 1 },
        },
        include: { items: { include: { procedure: true }, orderBy: { sortOrder: 'asc' } } },
      });
      await this.recordPlanEvent(tx, {
        treatmentPlanId: id,
        type: 'PRESENTED',
        actorId,
        payload: { presentedVersion, total: String(updated.total) },
      });
      await this.auditTreatment(tx, {
        actorId,
        action: 'treatment.present',
        entityId: id,
        clinicId: plan.clinicId,
        changes: { presentedVersion },
      });
      return updated;
    });
  }

  async duplicateTreatment(organizationId: string, actorId: string | undefined, id: string) {
    const plan = await this.getTreatmentPlan(organizationId, id);
    const items = plan.items.filter((item) => item.status !== 'CANCELLED').map((item) => ({
      procedureId: item.procedureId,
      professionalId: item.professionalId,
      toothFdi: item.toothFdi ?? undefined,
      face: item.face ?? undefined,
      quantity: item.quantity,
      unitPrice: String(item.unitPrice),
      discount: String(item.discount),
      plannedSessions: item.plannedSessions,
      urgent: item.urgent,
      priority: item.priority,
      estimatedMinutes: item.estimatedMinutes ?? undefined,
    }));
    return this.createTreatment(organizationId, actorId, {
      clinicId: plan.clinicId,
      patientId: plan.patientId,
      professionalId: plan.professionalId,
      title: `${plan.title} — cópia`,
      discount: String(plan.discount),
      notes: plan.notes ?? undefined,
      items,
    });
  }

  async cancelTreatment(organizationId: string, actorId: string | undefined, id: string, reason: string, expectedVersion?: number) {
    const plan = await prisma.treatmentPlan.findFirst({ where: { id, organizationId } });
    if (!plan) throw new NotFoundException('Plano de tratamento não encontrado.');
    if (plan.archivedAt) throw new ConflictException('Plano arquivado.');
    this.requirePlanTransition(plan.status as TreatmentPlanStatus, 'CANCELLED');
    if (expectedVersion != null && plan.version !== expectedVersion) {
      throw new ConflictException('Versão do plano desatualizada. Recarregue e tente novamente.');
    }
    return prisma.$transaction(async (tx) => {
      const updated = await tx.treatmentPlan.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: actorId,
          cancelReason: reason.trim(),
          version: { increment: 1 },
        },
        include: { items: { include: { procedure: true }, orderBy: { sortOrder: 'asc' } } },
      });
      await this.recordPlanEvent(tx, {
        treatmentPlanId: id,
        type: 'CANCELLED',
        actorId,
        payload: { reason: reason.trim() },
      });
      await this.auditTreatment(tx, {
        actorId,
        action: 'treatment.cancel',
        entityId: id,
        clinicId: plan.clinicId,
        changes: { reason: reason.trim() },
      });
      return updated;
    });
  }

  async archiveTreatment(organizationId: string, actorId: string | undefined, id: string) {
    const plan = await prisma.treatmentPlan.findFirst({ where: { id, organizationId } });
    if (!plan) throw new NotFoundException('Plano de tratamento não encontrado.');
    if (plan.archivedAt) throw new ConflictException('Plano já arquivado.');
    if (!isTerminalPlan(plan.status as TreatmentPlanStatus)) {
      throw new ConflictException('Arquive apenas planos concluídos ou cancelados. Use cancelar para encerrar planos ativos.');
    }
    return prisma.$transaction(async (tx) => {
      const updated = await tx.treatmentPlan.update({
        where: { id },
        data: { archivedAt: new Date(), archivedById: actorId, version: { increment: 1 } },
        include: { items: { include: { procedure: true }, orderBy: { sortOrder: 'asc' } } },
      });
      await this.recordPlanEvent(tx, { treatmentPlanId: id, type: 'ARCHIVED', actorId });
      await this.auditTreatment(tx, {
        actorId,
        action: 'treatment.archive',
        entityId: id,
        clinicId: plan.clinicId,
      });
      return updated;
    });
  }

  async restoreTreatment(organizationId: string, actorId: string | undefined, id: string) {
    const plan = await prisma.treatmentPlan.findFirst({ where: { id, organizationId } });
    if (!plan) throw new NotFoundException('Plano de tratamento não encontrado.');
    if (!plan.archivedAt) throw new ConflictException('Plano não está arquivado.');
    return prisma.$transaction(async (tx) => {
      const updated = await tx.treatmentPlan.update({
        where: { id },
        data: { archivedAt: null, archivedById: null, version: { increment: 1 } },
        include: { items: { include: { procedure: true }, orderBy: { sortOrder: 'asc' } } },
      });
      await this.recordPlanEvent(tx, { treatmentPlanId: id, type: 'RESTORED', actorId });
      await this.auditTreatment(tx, {
        actorId,
        action: 'treatment.restore',
        entityId: id,
        clinicId: plan.clinicId,
      });
      return updated;
    });
  }

  async deleteDraftTreatment(organizationId: string, actorId: string | undefined, id: string) {
    const plan = await prisma.treatmentPlan.findFirst({
      where: { id, organizationId },
      include: {
        items: { include: { sessions: true } },
        receivables: { select: { id: true }, take: 1 },
      },
    });
    if (!plan) throw new NotFoundException('Plano de tratamento não encontrado.');
    if (plan.status !== 'DRAFT') {
      throw new ConflictException('Exclusão física só é permitida em rascunhos. Use cancelar/arquivar.');
    }
    const hasSessions = plan.items.some((item) => item.sessions.length > 0);
    const hasReceivables = plan.receivables.length > 0;
    const linkedEntries = await prisma.clinicalEntry.count({ where: { treatmentId: id } });
    if (hasSessions || hasReceivables || linkedEntries > 0) {
      throw new ConflictException('Rascunho possui vínculos clínicos/financeiros. Use cancelar.');
    }
    await prisma.$transaction(async (tx) => {
      await this.auditTreatment(tx, {
        actorId,
        action: 'treatment.delete_draft',
        entityId: id,
        clinicId: plan.clinicId,
        changes: { title: plan.title },
      });
      await tx.treatmentPlan.delete({ where: { id } });
    });
    return { deleted: true, id };
  }

  async addTreatmentItem(organizationId: string, actorId: string | undefined, planId: string, input: {
    procedureId: string; professionalId: string; toothFdi?: string; face?: string;
    quantity: number; unitPrice: string; discount?: string; plannedSessions?: number; urgent?: boolean;
  }, expectedVersion?: number) {
    const plan = await prisma.treatmentPlan.findFirst({ where: { id: planId, organizationId }, include: { items: true } });
    if (!plan) throw new NotFoundException('Plano de tratamento não encontrado.');
    if (!planMutableContentStatuses().includes(plan.status as TreatmentPlanStatus)) {
      throw new ConflictException('Itens só podem ser adicionados em rascunho. Após apresentação, cancele o item ou revise o plano.');
    }
    if (expectedVersion != null && plan.version !== expectedVersion) {
      throw new ConflictException('Versão do plano desatualizada. Recarregue e tente novamente.');
    }
    await this.assertProcedureItems(organizationId, [input]);
    const [mapped] = this.mapItemCreates([input]);
    if (!mapped) throw new BadRequestException('Falha ao montar item de tratamento.');
    return prisma.$transaction(async (tx) => {
      await tx.treatmentItem.create({
        data: {
          treatmentPlanId: planId,
          procedureId: mapped.procedureId,
          professionalId: mapped.professionalId,
          toothFdi: mapped.toothFdi,
          face: mapped.face,
          quantity: mapped.quantity,
          unitPrice: mapped.unitPrice,
          discount: mapped.discount,
          total: mapped.total,
          plannedSessions: mapped.plannedSessions,
          urgent: mapped.urgent,
          priority: mapped.priority,
          estimatedMinutes: mapped.estimatedMinutes,
          sortOrder: plan.items.length,
          status: 'PLANNED',
        },
      });
      const refreshed = await tx.treatmentItem.findMany({ where: { treatmentPlanId: planId } });
      const totals = this.recalculateTotals(refreshed, plan.discount);
      const updated = await tx.treatmentPlan.update({
        where: { id: planId },
        data: { ...totals, version: { increment: 1 } },
        include: { items: { include: { procedure: true }, orderBy: { sortOrder: 'asc' } } },
      });
      await this.recordPlanEvent(tx, {
        treatmentPlanId: planId,
        type: 'ITEM_ADDED',
        actorId,
        payload: { procedureId: input.procedureId },
      });
      return updated;
    });
  }

  async updateTreatmentItem(organizationId: string, actorId: string | undefined, planId: string, itemId: string, input: {
    procedureId?: string; professionalId?: string; toothFdi?: string | null; face?: string | null;
    quantity?: number; unitPrice?: string; discount?: string; plannedSessions?: number; urgent?: boolean; priority?: number;
  }, expectedVersion?: number) {
    const plan = await prisma.treatmentPlan.findFirst({
      where: { id: planId, organizationId },
      include: { items: true },
    });
    if (!plan) throw new NotFoundException('Plano de tratamento não encontrado.');
    if (plan.archivedAt || isTerminalPlan(plan.status as TreatmentPlanStatus)) {
      throw new ConflictException('Plano não permite edição de itens.');
    }
    if (expectedVersion != null && plan.version !== expectedVersion) {
      throw new ConflictException('Versão do plano desatualizada. Recarregue e tente novamente.');
    }
    const existing = plan.items.find((item) => item.id === itemId);
    if (!existing) throw new NotFoundException('Item não encontrado.');
    if (['COMPLETED', 'CANCELLED'].includes(existing.status)) {
      throw new ConflictException('Item concluído ou cancelado não pode ser editado.');
    }
    if (!planMutableContentStatuses().includes(plan.status as TreatmentPlanStatus) && (input.unitPrice || input.procedureId)) {
      throw new ConflictException('Após apresentação, alterações de preço/procedimento exigem nova revisão operacional.');
    }
    const unitPrice = input.unitPrice != null ? money(input.unitPrice) : existing.unitPrice;
    const quantity = input.quantity ?? existing.quantity;
    const discount = input.discount != null ? money(input.discount) : existing.discount;
    if (unitPrice.lt(0) || discount.lt(0) || quantity < 1) throw new BadRequestException('Valores inválidos.');
    if (discount.gt(unitPrice.mul(quantity))) throw new BadRequestException('Desconto do item inválido.');
    return prisma.$transaction(async (tx) => {
      await tx.treatmentItem.update({
        where: { id: itemId },
        data: {
          procedureId: input.procedureId ?? existing.procedureId,
          professionalId: input.professionalId ?? existing.professionalId,
          toothFdi: input.toothFdi === undefined ? existing.toothFdi : input.toothFdi,
          face: input.face === undefined ? existing.face : input.face,
          quantity,
          unitPrice,
          discount,
          total: unitPrice.mul(quantity).sub(discount),
          plannedSessions: input.plannedSessions ?? existing.plannedSessions,
          urgent: input.urgent ?? existing.urgent,
          priority: input.priority ?? existing.priority,
        },
      });
      const refreshed = await tx.treatmentItem.findMany({ where: { treatmentPlanId: planId } });
      const totals = this.recalculateTotals(refreshed, plan.discount);
      const updated = await tx.treatmentPlan.update({
        where: { id: planId },
        data: { ...totals, version: { increment: 1 } },
        include: { items: { include: { procedure: true }, orderBy: { sortOrder: 'asc' } } },
      });
      await this.recordPlanEvent(tx, {
        treatmentPlanId: planId,
        type: 'ITEM_UPDATED',
        actorId,
        payload: { itemId },
      });
      return updated;
    });
  }

  async cancelTreatmentItem(organizationId: string, actorId: string | undefined, planId: string, itemId: string, reason: string) {
    const plan = await prisma.treatmentPlan.findFirst({
      where: { id: planId, organizationId },
      include: { items: true },
    });
    if (!plan) throw new NotFoundException('Plano de tratamento não encontrado.');
    const existing = plan.items.find((item) => item.id === itemId);
    if (!existing) throw new NotFoundException('Item não encontrado.');
    if (existing.status === 'CANCELLED') throw new ConflictException('Item já cancelado.');
    if (plan.status === 'DRAFT' && existing.status === 'PLANNED') {
      return prisma.$transaction(async (tx) => {
        await tx.treatmentItem.delete({ where: { id: itemId } });
        const refreshed = await tx.treatmentItem.findMany({ where: { treatmentPlanId: planId } });
        const totals = this.recalculateTotals(refreshed, plan.discount);
        const updated = await tx.treatmentPlan.update({
          where: { id: planId },
          data: { ...totals, version: { increment: 1 } },
          include: { items: { include: { procedure: true }, orderBy: { sortOrder: 'asc' } } },
        });
        await this.recordPlanEvent(tx, {
          treatmentPlanId: planId,
          type: 'ITEM_REMOVED',
          actorId,
          payload: { itemId },
        });
        return updated;
      });
    }
    return prisma.$transaction(async (tx) => {
      await tx.treatmentItem.update({
        where: { id: itemId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: actorId,
          cancelReason: reason.trim(),
        },
      });
      const refreshed = await tx.treatmentItem.findMany({ where: { treatmentPlanId: planId } });
      const derived = derivePlanStatusFromItems(refreshed.map((item) => ({ status: item.status as TreatmentItemStatus })));
      const updated = await tx.treatmentPlan.update({
        where: { id: planId },
        data: {
          version: { increment: 1 },
          ...(derived ? { status: derived } : {}),
        },
        include: { items: { include: { procedure: true }, orderBy: { sortOrder: 'asc' } } },
      });
      await this.recordPlanEvent(tx, {
        treatmentPlanId: planId,
        type: 'ITEM_CANCELLED',
        actorId,
        payload: { itemId, reason: reason.trim() },
      });
      await this.auditTreatment(tx, {
        actorId,
        action: 'treatment.item_cancel',
        entityId: planId,
        clinicId: plan.clinicId,
        changes: { itemId, reason: reason.trim() },
      });
      return updated;
    });
  }

  async reorderTreatmentItems(organizationId: string, actorId: string | undefined, planId: string, itemIds: string[]) {
    const plan = await prisma.treatmentPlan.findFirst({
      where: { id: planId, organizationId },
      include: { items: true },
    });
    if (!plan) throw new NotFoundException('Plano de tratamento não encontrado.');
    if (!planMutableContentStatuses().includes(plan.status as TreatmentPlanStatus)) {
      throw new ConflictException('Reordenação só é permitida em rascunho.');
    }
    const currentIds = plan.items.map((item) => item.id).sort();
    const nextIds = [...itemIds].sort();
    if (currentIds.length !== nextIds.length || currentIds.some((id, index) => id !== nextIds[index])) {
      throw new BadRequestException('Lista de itens incompleta ou inválida para reordenação.');
    }
    return prisma.$transaction(async (tx) => {
      for (const [index, itemId] of itemIds.entries()) {
        await tx.treatmentItem.update({ where: { id: itemId }, data: { sortOrder: index } });
      }
      const updated = await tx.treatmentPlan.update({
        where: { id: planId },
        data: { version: { increment: 1 } },
        include: { items: { include: { procedure: true }, orderBy: { sortOrder: 'asc' } } },
      });
      await this.recordPlanEvent(tx, {
        treatmentPlanId: planId,
        type: 'ITEMS_REORDERED',
        actorId,
        payload: { itemIds },
      });
      return updated;
    });
  }

  treatmentHistory(organizationId: string, id: string) {
    return prisma.treatmentPlanEvent.findMany({
      where: { plan: { id, organizationId } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async listSessions(organizationId: string, itemId: string) {
    const item = await prisma.treatmentItem.findFirst({
      where: { id: itemId, plan: { organizationId } },
      select: { id: true },
    });
    if (!item) throw new NotFoundException('Item de tratamento não encontrado.');
    return prisma.treatmentSession.findMany({
      where: { treatmentItemId: itemId },
      include: { corrections: true },
      orderBy: { completedAt: 'asc' },
    });
  }

  async addSession(organizationId: string, actorId: string | undefined, itemId: string, input: {
    professionalId: string; appointmentId?: string; executionNotes: string; materials?: unknown[];
    complications?: string; patientSignatureHash?: string; professionalSignatureHash?: string;
    idempotencyKey?: string; allowExtraSession?: boolean; completedAt?: string;
  }) {
    const item = await prisma.treatmentItem.findFirst({
      where: { id: itemId, plan: { organizationId } },
      include: {
        procedure: { select: { name: true } },
        plan: { select: { id: true, clinicId: true, patientId: true, title: true, status: true, archivedAt: true } },
        sessions: { select: { id: true, correctionOfId: true, idempotencyKey: true } },
      },
    });
    if (!item) throw new NotFoundException('Item de tratamento não encontrado.');
    if (item.plan.archivedAt) throw new ConflictException('Plano arquivado.');
    const planAllowsSessions = ['PARTIALLY_APPROVED', 'APPROVED', 'IN_PROGRESS'].includes(item.plan.status);
    if (!planAllowsSessions || !['APPROVED', 'IN_PROGRESS'].includes(item.status)) {
      throw new ConflictException('Sessões só são permitidas em itens aprovados ou em andamento de planos aprovados.');
    }
    if (input.idempotencyKey) {
      const existing = item.sessions.find((session) => session.idempotencyKey === input.idempotencyKey);
      if (existing) {
        return prisma.treatmentSession.findUniqueOrThrow({ where: { id: existing.id } });
      }
    }
    const professional = await prisma.professional.findFirst({
      where: { id: input.professionalId, user: { organizationId }, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!professional) throw new NotFoundException('Profissional não encontrado.');

    return prisma.$transaction(async (tx) => {
      const session = await tx.treatmentSession.create({
        data: {
          treatmentItemId: itemId,
          professionalId: input.professionalId,
          appointmentId: input.appointmentId,
          executionNotes: input.executionNotes,
          materials: json(input.materials ?? []),
          complications: input.complications,
          patientSignatureHash: input.patientSignatureHash,
          professionalSignatureHash: input.professionalSignatureHash,
          idempotencyKey: input.idempotencyKey,
          ...(input.completedAt ? { completedAt: new Date(input.completedAt) } : {}),
        },
      });
      const validSessions = await tx.treatmentSession.findMany({
        where: { treatmentItemId: itemId, correctionOfId: null },
        select: { id: true },
      });
      const planned = Math.max(1, item.plannedSessions);
      let nextItemStatus: TreatmentItemStatus;
      let itemCompleted: boolean;
      try {
        ({ status: nextItemStatus, completed: itemCompleted } = nextItemStatusAfterSession({
          currentStatus: item.status as TreatmentItemStatus,
          plannedSessions: planned,
          validSessionCount: validSessions.length,
          allowExtraSession: input.allowExtraSession,
        }));
      } catch (error) {
        throw new ConflictException(error instanceof Error ? error.message : 'Sessão inválida para o item.');
      }
      await tx.treatmentItem.update({ where: { id: itemId }, data: { status: nextItemStatus } });

      const plan = await tx.treatmentPlan.findUnique({ where: { id: item.plan.id } });
      if (plan && !['COMPLETED', 'CANCELLED'].includes(plan.status)) {
        if (plan.status !== 'IN_PROGRESS' && canTransitionPlan(plan.status as TreatmentPlanStatus, 'IN_PROGRESS')) {
          await tx.treatmentPlan.update({ where: { id: plan.id }, data: { status: 'IN_PROGRESS', version: { increment: 1 } } });
        }
        const siblings = await tx.treatmentItem.findMany({ where: { treatmentPlanId: item.plan.id } });
        const derived = derivePlanStatusFromItems(
          siblings.map((row) => ({
            status: (row.id === itemId ? nextItemStatus : row.status) as TreatmentItemStatus,
          })),
        );
        if (derived === 'COMPLETED') {
          await tx.treatmentPlan.update({ where: { id: item.plan.id }, data: { status: 'COMPLETED', version: { increment: 1 } } });
        }
      }

      await this.createAutoEvolution(tx, {
        organizationId,
        clinicId: item.plan.clinicId,
        patientId: item.plan.patientId,
        professionalId: input.professionalId,
        treatmentId: item.plan.id,
        treatmentItemId: item.id,
        treatmentSessionId: session.id,
        appointmentId: input.appointmentId,
        toothFdi: item.toothFdi ?? undefined,
        clinicalDate: session.completedAt,
        renderedText: [
          `Sessão ${validSessions.length}/${planned}: ${item.procedure.name}.`,
          item.toothFdi ? `Dente FDI ${item.toothFdi}.` : null,
          input.executionNotes.trim(),
          input.complications ? `Complicações: ${input.complications}` : null,
          `Plano: ${item.plan.title}.`,
        ].filter(Boolean).join(' '),
      });
      await this.recordPlanEvent(tx, {
        treatmentPlanId: item.plan.id,
        type: itemCompleted ? 'ITEM_COMPLETED' : 'SESSION_RECORDED',
        actorId,
        payload: {
          itemId,
          sessionId: session.id,
          sessionCount: validSessions.length,
          planned,
          procedureName: item.procedure.name,
          toothFdi: item.toothFdi,
        },
      });
      return session;
    });
  }

  async correctSession(organizationId: string, actorId: string | undefined, sessionId: string, input: {
    reason: string; executionNotes: string; materials?: unknown[]; complications?: string;
  }) {
    const session = await prisma.treatmentSession.findFirst({
      where: { id: sessionId, item: { plan: { organizationId } } },
      include: {
        item: {
          include: {
            procedure: { select: { name: true } },
            plan: { select: { id: true, clinicId: true, patientId: true, title: true } },
          },
        },
      },
    });
    if (!session) throw new NotFoundException('Sessão não encontrada.');
    return prisma.$transaction(async (tx) => {
      const correction = await tx.treatmentSession.create({
        data: {
          treatmentItemId: session.treatmentItemId,
          appointmentId: session.appointmentId,
          professionalId: session.professionalId,
          executionNotes: input.executionNotes.trim(),
          materials: json(input.materials ?? session.materials),
          complications: input.complications,
          correctionOfId: session.id,
        },
      });
      const entry = await tx.clinicalEntry.findFirst({
        where: { treatmentSessionId: session.id },
        orderBy: { createdAt: 'desc' },
      });
      if (entry) {
        await tx.clinicalEntryCorrection.create({
          data: {
            clinicalEntryId: entry.id,
            authorId: actorId ?? session.professionalId,
            kind: 'ADDENDUM',
            reason: input.reason.trim(),
            renderedText: input.executionNotes.trim(),
            correctedContent: json({
              executionNotes: input.executionNotes.trim(),
              complications: input.complications ?? null,
              correctionSessionId: correction.id,
            }),
          },
        });
      }
      await this.recordPlanEvent(tx, {
        treatmentPlanId: session.item.plan.id,
        type: 'SESSION_CORRECTED',
        actorId,
        payload: { sessionId, correctionId: correction.id, reason: input.reason.trim() },
      });
      await this.auditTreatment(tx, {
        actorId,
        action: 'treatment.session_correct',
        entityId: session.item.plan.id,
        clinicId: session.item.plan.clinicId,
        changes: { sessionId, correctionId: correction.id, reason: input.reason.trim() },
      });
      return correction;
    });
  }

  async completeTreatmentItem(
    organizationId: string,
    actorId: string | undefined,
    itemId: string,
    input: { notes?: string; clinicalDate?: string } | string | undefined = {},
  ) {
    const options = typeof input === 'string' ? { notes: input } : (input ?? {});
    const clinicalDate = options.clinicalDate ? new Date(options.clinicalDate) : new Date();
    if (Number.isNaN(clinicalDate.getTime())) {
      throw new BadRequestException('Data clínica inválida.');
    }
    const item = await prisma.treatmentItem.findFirst({
      where: { id: itemId, plan: { organizationId } },
      include: {
        procedure: { select: { name: true } },
        plan: { select: { id: true, clinicId: true, patientId: true, title: true, status: true, archivedAt: true } },
        sessions: { select: { id: true, correctionOfId: true } },
      },
    });
    if (!item) throw new NotFoundException('Item de tratamento não encontrado.');
    if (item.plan.archivedAt) throw new ConflictException('Plano arquivado.');
    if (item.status === 'COMPLETED') return item;
    if (!['APPROVED', 'IN_PROGRESS'].includes(item.status)) {
      throw new ConflictException('Somente itens aprovados ou em andamento podem ser concluídos.');
    }
    const notes = options.notes?.trim();
    return prisma.$transaction(async (tx) => {
      const validSessionCount = item.sessions.filter((session) => !session.correctionOfId).length;
      let sessionId: string | undefined;
      if (validSessionCount === 0) {
        const session = await tx.treatmentSession.create({
          data: {
            treatmentItemId: itemId,
            professionalId: item.professionalId,
            executionNotes: notes || `Procedimento concluído: ${item.procedure.name}.`,
            completedAt: clinicalDate,
          },
        });
        sessionId = session.id;
      }
      const updatedItem = await tx.treatmentItem.update({
        where: { id: itemId },
        data: { status: 'COMPLETED' },
        include: { procedure: true, sessions: true },
      });
      const siblings = await tx.treatmentItem.findMany({ where: { treatmentPlanId: item.plan.id } });
      const derived = derivePlanStatusFromItems(siblings.map((row) => ({
        status: (row.id === itemId ? 'COMPLETED' : row.status) as TreatmentItemStatus,
      })));
      if (derived && item.plan.status !== derived) {
        await tx.treatmentPlan.update({
          where: { id: item.plan.id },
          data: { status: derived, version: { increment: 1 } },
        });
      }
      await this.createAutoEvolution(tx, {
        organizationId,
        clinicId: item.plan.clinicId,
        patientId: item.plan.patientId,
        professionalId: item.professionalId,
        treatmentId: item.plan.id,
        treatmentItemId: item.id,
        treatmentSessionId: sessionId,
        toothFdi: item.toothFdi ?? undefined,
        clinicalDate,
        renderedText: [
          `Procedimento concluído: ${item.procedure.name}.`,
          item.toothFdi ? `Dente FDI ${item.toothFdi}.` : null,
          notes || null,
          `Plano: ${item.plan.title}.`,
        ].filter(Boolean).join(' '),
      });
      await this.recordPlanEvent(tx, {
        treatmentPlanId: item.plan.id,
        type: 'ITEM_COMPLETED',
        actorId,
        payload: {
          itemId,
          explicit: true,
          procedureName: item.procedure.name,
          toothFdi: item.toothFdi,
          clinicalDate: clinicalDate.toISOString(),
        },
      });
      return updatedItem;
    });
  }

  private async createAutoEvolution(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      clinicId: string;
      patientId: string;
      professionalId: string;
      treatmentId: string;
      treatmentItemId: string;
      treatmentSessionId?: string;
      appointmentId?: string;
      toothFdi?: string;
      renderedText: string;
      clinicalDate?: Date;
    },
  ) {
    if (input.treatmentSessionId) {
      const existing = await tx.clinicalEntry.findFirst({
        where: { treatmentSessionId: input.treatmentSessionId },
        select: { id: true },
      });
      if (existing) return existing;
    }
    const record = await tx.clinicalRecord.upsert({
      where: { clinicId_patientId: { clinicId: input.clinicId, patientId: input.patientId } },
      create: {
        organizationId: input.organizationId,
        clinicId: input.clinicId,
        patientId: input.patientId,
      },
      update: {},
    });
    return tx.clinicalEntry.create({
      data: {
        clinicalRecordId: record.id,
        professionalId: input.professionalId,
        appointmentId: input.appointmentId,
        treatmentId: input.treatmentId,
        treatmentItemId: input.treatmentItemId,
        treatmentSessionId: input.treatmentSessionId,
        toothFdi: input.toothFdi,
        type: 'EVOLUTION',
        renderedText: input.renderedText,
        structuredData: json({
          schemaVersion: 1,
          source: 'auto-treatment-completion',
          treatmentId: input.treatmentId,
          treatmentItemId: input.treatmentItemId,
          treatmentSessionId: input.treatmentSessionId ?? null,
          appointmentId: input.appointmentId ?? null,
        }),
        clinicalDate: input.clinicalDate ?? new Date(),
        status: 'SIGNED',
        signedAt: new Date(),
        contentHash: hash({ text: input.renderedText, at: new Date().toISOString(), sessionId: input.treatmentSessionId }),
      },
    });
  }

  documentTemplates(organizationId: string, includeArchived = false) {
    return prisma.documentTemplate.findMany({
      where: {
        organizationId,
        ...(includeArchived ? {} : { status: { in: ['DRAFT', 'PUBLISHED'] }, active: true }),
      },
      orderBy: [{ name: 'asc' }, { version: 'desc' }],
    });
  }

  async getDocumentTemplate(organizationId: string, id: string) {
    const template = await prisma.documentTemplate.findFirst({ where: { id, organizationId } });
    if (!template) throw new NotFoundException('Modelo de documento não encontrado.');
    return template;
  }

  async createDocumentTemplate(organizationId: string, actorId: string | undefined, input: {
    type: string; name: string; structuredContent: Record<string, unknown>;
    allowedVariables: string[]; signatureRules?: Record<string, unknown>; isSystem?: boolean;
  }) {
    const type = input.type.trim().toUpperCase();
    if (type.length < 2) throw new BadRequestException('Tipo de modelo inválido.');
    const created = await prisma.documentTemplate.create({
      data: {
        organizationId,
        type,
        name: input.name.trim(),
        structuredContent: json(input.structuredContent),
        allowedVariables: json(input.allowedVariables),
        signatureRules: json(input.signatureRules ?? { requiredRoles: ['PROFESSIONAL'], minSignatures: 1 }),
        isSystem: input.isSystem === true,
        status: 'DRAFT',
        active: true,
        version: 1,
      },
    });
    await this.audit(actorId, 'document.template.created', 'DocumentTemplate', created.id, null, { type: created.type, name: created.name });
    return created;
  }

  async updateDocumentTemplate(organizationId: string, actorId: string | undefined, id: string, input: {
    name?: string; structuredContent?: Record<string, unknown>; allowedVariables?: string[];
    signatureRules?: Record<string, unknown>; type?: string;
  }) {
    const template = await this.getDocumentTemplate(organizationId, id);
    try {
      assertTemplateEditable(template.status as DocumentTemplateStatus);
    } catch (error) {
      throw new ConflictException(error instanceof Error ? error.message : 'Modelo não editável.');
    }
    const type = input.type?.trim().toUpperCase();
    if (input.type !== undefined && (!type || type.length < 2)) {
      throw new BadRequestException('Tipo de modelo inválido.');
    }
    return prisma.documentTemplate.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        type,
        structuredContent: input.structuredContent ? json(input.structuredContent) : undefined,
        allowedVariables: input.allowedVariables ? json(input.allowedVariables) : undefined,
        signatureRules: input.signatureRules ? json(input.signatureRules) : undefined,
      },
    });
  }

  async newDocumentTemplateVersion(organizationId: string, actorId: string | undefined, id: string) {
    const template = await this.getDocumentTemplate(organizationId, id);
    if (template.status !== 'PUBLISHED' && template.status !== 'ARCHIVED') {
      throw new ConflictException('Nova versão só a partir de modelo publicado ou arquivado.');
    }
    const latest = await prisma.documentTemplate.findFirst({
      where: { organizationId, name: template.name },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const created = await prisma.documentTemplate.create({
      data: {
        organizationId,
        type: template.type,
        name: template.name,
        structuredContent: json(template.structuredContent as object),
        allowedVariables: json(template.allowedVariables as object),
        signatureRules: json(template.signatureRules as object),
        isSystem: template.isSystem,
        sourceTemplateId: template.id,
        status: 'DRAFT',
        active: true,
        version: (latest?.version ?? template.version) + 1,
      },
    });
    await this.audit(actorId, 'document.template.new_version', 'DocumentTemplate', created.id, null, {
      sourceTemplateId: template.id,
      version: created.version,
    });
    return created;
  }

  async publishDocumentTemplate(organizationId: string, actorId: string | undefined, id: string) {
    const template = await this.getDocumentTemplate(organizationId, id);
    if (template.status !== 'DRAFT') throw new ConflictException('Somente rascunhos podem ser publicados.');
    const structureErrors = validateDocumentTemplateStructure({
      name: template.name,
      type: template.type,
      structuredContent: template.structuredContent,
      allowedVariables: template.allowedVariables,
      signatureRules: template.signatureRules,
    });
    if (structureErrors.length) {
      throw new BadRequestException({
        message: 'Modelo inválido para publicação.',
        errors: structureErrors,
      });
    }
    const published = await prisma.documentTemplate.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        active: true,
        publishedAt: new Date(),
        publishedById: actorId,
        archivedAt: null,
      },
    });
    await this.audit(actorId, 'document.template.published', 'DocumentTemplate', id, null, {
      version: published.version,
      type: published.type,
    });
    return published;
  }

  async archiveDocumentTemplate(organizationId: string, actorId: string | undefined, id: string) {
    const template = await this.getDocumentTemplate(organizationId, id);
    const archived = await prisma.documentTemplate.update({
      where: { id },
      data: { status: 'ARCHIVED', active: false, archivedAt: new Date() },
    });
    await this.audit(actorId, 'document.template.archived', 'DocumentTemplate', id, null, { from: template.status });
    return archived;
  }

  async restoreDocumentTemplate(organizationId: string, actorId: string | undefined, id: string) {
    const template = await this.getDocumentTemplate(organizationId, id);
    if (template.status !== 'ARCHIVED') throw new ConflictException('Somente modelos arquivados podem ser restaurados.');
    const restored = await prisma.documentTemplate.update({
      where: { id },
      data: { status: 'PUBLISHED', active: true, archivedAt: null, publishedAt: template.publishedAt ?? new Date() },
    });
    await this.audit(actorId, 'document.template.restored', 'DocumentTemplate', id, null, {});
    return restored;
  }

  async duplicateDocumentTemplate(organizationId: string, actorId: string | undefined, id: string) {
    const template = await this.getDocumentTemplate(organizationId, id);
    const name = `${template.name} (cópia)`;
    return this.createDocumentTemplate(organizationId, actorId, {
      type: template.type,
      name,
      structuredContent: (template.structuredContent ?? {}) as Record<string, unknown>,
      allowedVariables: Array.isArray(template.allowedVariables)
        ? template.allowedVariables.filter((v): v is string => typeof v === 'string')
        : [],
      signatureRules: (template.signatureRules ?? {}) as Record<string, unknown>,
      isSystem: false,
    });
  }

  async validateDocumentTemplate(organizationId: string, id: string, clinicalContent: Record<string, unknown> = {}) {
    const template = await this.getDocumentTemplate(organizationId, id);
    const errors = [
      ...validateDocumentTemplateStructure({
        name: template.name,
        type: template.type,
        structuredContent: template.structuredContent,
        allowedVariables: template.allowedVariables,
        signatureRules: template.signatureRules,
      }),
      ...validateTemplateVariables(template.allowedVariables, stripClientIdentity(clinicalContent)),
    ];
    try {
      assertCidConsent({ templateType: template.type, clinicalContent });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'CID inválido.');
    }
    return {
      ok: errors.length === 0,
      valid: errors.length === 0,
      errors,
      template: { id: template.id, type: template.type, version: template.version, status: template.status },
    };
  }

  documents(organizationId: string, clinicId?: string, patientId?: string, includeArchived = false) {
    return prisma.generatedDocument.findMany({
      where: {
        organizationId,
        clinicId,
        ...(patientId ? { patientId } : {}),
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      select: {
        id: true,
        patientId: true,
        professionalId: true,
        treatmentId: true,
        folderId: true,
        templateId: true,
        templateVersion: true,
        status: true,
        validationCode: true,
        generatedAt: true,
        archivedAt: true,
        cancelledAt: true,
        frozenContent: true,
        template: { select: { id: true, name: true, type: true, structuredContent: true, signatureRules: true } },
        signatures: { select: { signerName: true, role: true, signedAt: true, method: true } },
        folder: { select: { id: true, name: true } },
      },
      orderBy: { generatedAt: 'desc' },
      take: 200,
    });
  }

  async getDocument(organizationId: string, id: string) {
    const document = await prisma.generatedDocument.findFirst({
      where: { id, organizationId },
      include: {
        template: true,
        signatures: { orderBy: { signedAt: 'asc' } },
        signatureRequests: { orderBy: { createdAt: 'desc' } },
        folder: true,
        events: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!document) throw new NotFoundException('Documento não encontrado.');
    return document;
  }

  async documentHistory(organizationId: string, id: string) {
    await this.getDocument(organizationId, id);
    return prisma.documentEvent.findMany({
      where: { generatedDocumentId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async documentPdf(organizationId: string, id: string) {
    const document = await this.getDocument(organizationId, id);
    const patient = await prisma.patient.findFirst({
      where: { id: document.patientId, organizationId },
      select: { fullName: true, cpf: true },
    });
    const clinic = await prisma.clinic.findFirst({
      where: { id: document.clinicId, organizationId },
      select: { tradeName: true, legalName: true },
    });
    const content = (document.frozenContent ?? {}) as Record<string, unknown>;
    const identity = (content.identity ?? {}) as Record<string, unknown>;
    const bodyLines = [
      content.titulo ? String(content.titulo) : '',
      content.prescricao ? String(content.prescricao) : '',
      content.observacoes ? String(content.observacoes) : '',
      content.corpo ? String(content.corpo) : '',
      content.indication ? `Indicação: ${String(content.indication)}` : '',
      Array.isArray(content.exams) ? `Exames: ${(content.exams as unknown[]).map(String).join(', ')}` : '',
      content.cid ? `CID: ${String(content.cid)}` : '',
      ...Object.entries(content)
        .filter(([key]) => ![
          'titulo', 'prescricao', 'observacoes', 'corpo', 'paciente', 'data', 'identity', 'template',
          'cidConsent', 'exams', 'indication', 'cid',
        ].includes(key))
        .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`),
    ].filter(Boolean);
    if (!bodyLines.length) {
      bodyLines.push(`Modelo: ${document.template.name}`);
      bodyLines.push(`Gerado em: ${document.generatedAt.toISOString()}`);
    }
    const patientName = typeof identity.patientName === 'string' ? identity.patientName : patient?.fullName;
    const patientDocument = typeof identity.patientCpfMasked === 'string'
      ? `CPF ${identity.patientCpfMasked}`
      : (patient?.cpf ? `CPF ${patient.cpf.replace(/^(\d{3})\d{5}(\d{2})$/, '$1.***.***-$2')}` : undefined);
    const pdf = await buildClinicalDocumentPdf({
      clinicName: clinic?.tradeName ?? clinic?.legalName ?? 'Sonder Clinic',
      title: document.template.name,
      patientName,
      patientDocument,
      bodyLines,
      validationCode: document.validationCode,
      footerLeft: 'Assinatura do profissional\nA1 ou assinatura na tela',
      footerRight: 'Assinatura do paciente\nPresencial ou link remoto',
    });
    return {
      filename: `${document.template.name.replaceAll(/\s+/g, '-').toLowerCase()}.pdf`,
      contentType: 'application/pdf',
      content: pdf,
    };
  }

  async ensurePatientFolders(organizationId: string, patientId: string) {
    const patient = await prisma.patient.findFirst({ where: { id: patientId, organizationId }, select: { id: true } });
    if (!patient) throw new NotFoundException('Paciente não encontrado.');
    const existing = await prisma.patientDocumentFolder.findMany({
      where: { organizationId, patientId, archivedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
    if (existing.length) return existing;
    await prisma.patientDocumentFolder.createMany({
      data: DEFAULT_PATIENT_FOLDERS.map((folder) => ({
        organizationId,
        patientId,
        name: folder.name,
        isSystem: true,
        sortOrder: folder.sortOrder,
      })),
      skipDuplicates: true,
    });
    return prisma.patientDocumentFolder.findMany({
      where: { organizationId, patientId, archivedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createPatientFolder(organizationId: string, patientId: string, input: { name: string }) {
    await this.ensurePatientFolders(organizationId, patientId);
    const name = input.name.trim();
    if (name.length < 2) throw new BadRequestException('Nome da pasta inválido.');
    return prisma.patientDocumentFolder.create({
      data: { organizationId, patientId, name, isSystem: false, sortOrder: 100 },
    });
  }

  async listPatientFolders(organizationId: string, patientId: string) {
    return this.ensurePatientFolders(organizationId, patientId);
  }

  async documentLibrary(organizationId: string, patientId: string, query?: {
    folderId?: string; q?: string; includeArchived?: boolean;
  }) {
    await this.ensurePatientFolders(organizationId, patientId);
    const archivedFilter = query?.includeArchived ? {} : { archivedAt: null };
    const folderFilter = query?.folderId ? { folderId: query.folderId } : {};
    const [documents, prescriptions, media] = await Promise.all([
      prisma.generatedDocument.findMany({
        where: { organizationId, patientId, ...archivedFilter, ...folderFilter },
        include: {
          template: { select: { id: true, name: true, type: true } },
          folder: { select: { id: true, name: true } },
          signatures: { select: { role: true, signedAt: true, method: true } },
        },
        orderBy: { generatedAt: 'desc' },
        take: 200,
      }),
      prisma.prescription.findMany({
        where: {
          organizationId,
          patientId,
          ...(query?.includeArchived ? {} : { status: { not: 'CANCELLED' } }),
          ...folderFilter,
        },
        include: { folder: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      prisma.patientMedia.findMany({
        where: { organizationId, patientId, ...archivedFilter, ...folderFilter },
        include: {
          folder: { select: { id: true, name: true } },
          file: { select: { originalName: true, mimeType: true, sizeBytes: true, antivirusStatus: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);

    const q = query?.q?.trim().toLowerCase();
    const items = [
      ...documents.map((doc) => ({
        source: 'generated' as const,
        id: doc.id,
        name: doc.template.name,
        type: doc.template.type,
        status: doc.status,
        folderId: doc.folderId,
        folderName: doc.folder?.name ?? null,
        date: doc.generatedAt,
        professionalId: doc.professionalId,
        validationCode: doc.validationCode,
      })),
      ...prescriptions.map((rx) => ({
        source: 'prescription' as const,
        id: rx.id,
        name: rx.purpose,
        type: 'PRESCRIPTION',
        status: rx.status,
        folderId: rx.folderId,
        folderName: rx.folder?.name ?? null,
        date: rx.createdAt,
        professionalId: rx.professionalId,
        validationCode: rx.validationCode,
      })),
      ...media.map((item) => ({
        source: 'upload' as const,
        id: item.id,
        name: item.displayName ?? item.file.originalName,
        type: item.type,
        status: item.archivedAt ? 'ARCHIVED' : item.file.status,
        folderId: item.folderId,
        folderName: item.folder?.name ?? null,
        date: item.createdAt,
        professionalId: null as string | null,
        validationCode: null as string | null,
        antivirusStatus: item.file.antivirusStatus,
      })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime());

    return q
      ? items.filter((item) => item.name.toLowerCase().includes(q) || item.type.toLowerCase().includes(q))
      : items;
  }

  async generateDocument(organizationId: string, actorId: string | undefined, input: {
    clinicId: string;
    templateId: string;
    patientId: string;
    professionalId?: string;
    treatmentId?: string;
    folderId?: string;
    /** Conteúdo clínico editável — identidade é montada no servidor. */
    clinicalContent?: Record<string, unknown>;
    /** @deprecated Aceito só por compatibilidade; identidade do client é descartada. */
    frozenContent?: Record<string, unknown>;
  }) {
    const clinicalContent = stripClientIdentity(input.clinicalContent ?? input.frozenContent ?? {});
    const [template, clinic, patient, professional, treatment] = await Promise.all([
      prisma.documentTemplate.findFirst({
        where: { id: input.templateId, organizationId, status: 'PUBLISHED', active: true },
      }),
      prisma.clinic.findFirst({
        where: { id: input.clinicId, organizationId, status: 'ACTIVE' },
        select: { id: true, tradeName: true, legalName: true },
      }),
      prisma.patient.findFirst({
        where: { id: input.patientId, organizationId, status: { not: 'ARCHIVED' } },
        select: { id: true, fullName: true, cpf: true },
      }),
      input.professionalId
        ? prisma.professional.findFirst({
          where: { id: input.professionalId, user: { organizationId }, status: 'ACTIVE' },
          select: { id: true, name: true, croNumber: true, croState: true },
        })
        : Promise.resolve(null),
      input.treatmentId
        ? prisma.treatmentPlan.findFirst({
          where: { id: input.treatmentId, organizationId, patientId: input.patientId },
          select: { id: true },
        })
        : Promise.resolve({ id: 'optional' }),
    ]);
    if (!template) throw new NotFoundException('Modelo publicado não encontrado.');
    if (!clinic || !patient || !treatment) throw new NotFoundException('Clínica, paciente ou tratamento inválido.');
    if (input.professionalId && !professional) throw new NotFoundException('Profissional inválido.');

    try {
      assertCidConsent({ templateType: template.type, clinicalContent });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'CID inválido.');
    }
    const missing = validateTemplateVariables(template.allowedVariables, clinicalContent);
    if (missing.length) throw new BadRequestException({ message: 'Variáveis obrigatórias ausentes.', errors: missing });

    const folders = await this.ensurePatientFolders(organizationId, input.patientId);
    let folderId = input.folderId;
    if (folderId) {
      const folder = folders.find((f) => f.id === folderId) ?? await prisma.patientDocumentFolder.findFirst({
        where: { id: folderId, organizationId, patientId: input.patientId, archivedAt: null },
      });
      if (!folder) throw new NotFoundException('Pasta não encontrada.');
      folderId = folder.id;
    } else {
      const defaultName = defaultFolderNameForTemplateType(template.type);
      folderId = folders.find((f) => f.name === defaultName)?.id;
    }

    const generatedAt = new Date();
    const frozenContent = buildServerFrozenContent({
      clinicalContent,
      patient,
      professional,
      clinic,
      template: { id: template.id, name: template.name, type: template.type, version: template.version },
      generatedAt,
    });
    const contentHash = hashDocumentContent(frozenContent);

    const created = await prisma.$transaction(async (tx) => {
      const document = await tx.generatedDocument.create({
        data: {
          organizationId,
          clinicId: input.clinicId,
          templateId: template.id,
          templateVersion: template.version,
          patientId: input.patientId,
          professionalId: professional?.id,
          treatmentId: input.treatmentId,
          folderId,
          generatedById: actorId,
          frozenContent: json(frozenContent),
          contentHash,
          validationCode: randomBytes(18).toString('base64url'),
          status: 'GENERATED',
          generatedAt,
        },
      });
      await tx.documentEvent.create({
        data: {
          generatedDocumentId: document.id,
          type: 'GENERATED',
          actorId,
          payload: json({ templateId: template.id, templateVersion: template.version, contentHash }),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'document.generated',
          entity: 'GeneratedDocument',
          entityId: document.id,
          clinicId: input.clinicId,
          changes: json({ templateId: template.id, patientId: input.patientId, contentHash }),
          correlationId: randomUUID(),
        },
      });
      return document;
    });
    return this.getDocument(organizationId, created.id);
  }

  async signDocument(organizationId: string, id: string, input: {
    signerId?: string; signerName: string; role: string; method: string;
    ipAddress?: string; userAgent?: string; evidence?: Record<string, unknown>; clinicId?: string;
    actorId?: string;
  }) {
    const document = await prisma.generatedDocument.findFirst({
      where: { id, organizationId },
      include: { template: true, signatures: true },
    });
    if (!document) throw new NotFoundException('Documento não encontrado.');
    try {
      assertDocumentMutable(document.status as DocumentStatus, document.archivedAt);
    } catch (error) {
      throw new ConflictException(error instanceof Error ? error.message : 'Documento imutável.');
    }

    if (input.method === 'MOCK_A1') {
      throw new BadRequestException('Assinatura MOCK_A1 não é permitida. Use A1 com certificado válido ou DRAWN/REMOTE.');
    }

    const rules = parseSignatureRules(document.template.signatureRules);
    let nextStatus: DocumentStatus;
    try {
      nextStatus = nextDocumentStatusAfterSign({
        currentStatus: document.status as DocumentStatus,
        signatures: document.signatures.map((s) => ({ role: s.role })),
        newRole: input.role,
        rules,
      });
    } catch (error) {
      throw new ConflictException(error instanceof Error ? error.message : 'Assinatura inválida.');
    }

    let a1Evidence: Record<string, unknown> | undefined;
    if (input.method === 'A1') {
      const clinicId = input.clinicId ?? document.clinicId;
      const signed = await this.certificates.signWithA1(
        organizationId,
        clinicId,
        JSON.stringify({
          documentId: document.id,
          contentHash: document.contentHash,
          signer: input.signerName,
          role: input.role,
          at: new Date().toISOString(),
        }),
      );
      a1Evidence = {
        a1: true,
        algorithm: signed.algorithm,
        signature: signed.signature,
        subject: signed.subject,
        serialNumber: signed.serialNumber,
        validTo: signed.validTo,
      };
    }

    return prisma.$transaction(async (tx) => {
      const signature = await tx.documentSignature.create({
        data: {
          generatedDocumentId: id,
          signerId: input.signerId,
          signerName: input.signerName,
          role: input.role,
          method: input.method,
          evidence: json({ ...(input.evidence ?? {}), ...(a1Evidence ?? {}) }),
          signedHash: hash({
            documentHash: document.contentHash,
            signer: input.signerName,
            method: input.method,
            a1: a1Evidence?.signature ?? null,
            at: new Date().toISOString(),
          }),
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        },
      });
      await tx.generatedDocument.update({ where: { id }, data: { status: nextStatus } });
      await tx.documentEvent.create({
        data: {
          generatedDocumentId: id,
          type: 'SIGNED',
          actorId: input.actorId ?? input.signerId,
          payload: json({ role: input.role, method: input.method, status: nextStatus }),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: input.actorId ?? input.signerId,
          action: 'document.signed',
          entity: 'GeneratedDocument',
          entityId: id,
          clinicId: document.clinicId,
          changes: json({ role: input.role, method: input.method, status: nextStatus }),
          correlationId: randomUUID(),
        },
      });
      return signature;
    });
  }

  async createDocumentSignatureRequest(organizationId: string, actorId: string | undefined, id: string, input: {
    signerRole: string; signerName: string; expiresInHours?: number;
  }) {
    const document = await this.getDocument(organizationId, id);
    try {
      assertDocumentMutable(document.status as DocumentStatus, document.archivedAt);
    } catch (error) {
      throw new ConflictException(error instanceof Error ? error.message : 'Documento imutável.');
    }
    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + (input.expiresInHours ?? 72) * 3600_000);
    const request = await prisma.documentSignatureRequest.create({
      data: {
        generatedDocumentId: id,
        tokenHash: hash(token),
        signerRole: input.signerRole,
        signerName: input.signerName.trim(),
        expiresAt,
        createdById: actorId,
      },
    });
    await prisma.documentEvent.create({
      data: {
        generatedDocumentId: id,
        type: 'SIGNATURE_REQUESTED',
        actorId,
        payload: json({ requestId: request.id, signerRole: input.signerRole, expiresAt }),
      },
    });
    await this.audit(actorId, 'document.signature_requested', 'GeneratedDocument', id, document.clinicId, {
      requestId: request.id,
      signerRole: input.signerRole,
    });
    return {
      requestId: request.id,
      token,
      expiresAt,
      publicPath: `/assinar/documento/${token}`,
    };
  }

  async revokeDocumentSignatureRequest(organizationId: string, actorId: string | undefined, id: string, requestId: string) {
    const document = await this.getDocument(organizationId, id);
    const request = await prisma.documentSignatureRequest.findFirst({
      where: { id: requestId, generatedDocumentId: id },
    });
    if (!request) throw new NotFoundException('Solicitação de assinatura não encontrada.');
    if (request.usedAt) throw new ConflictException('Solicitação já utilizada.');
    if (request.revokedAt) return request;
    const revoked = await prisma.documentSignatureRequest.update({
      where: { id: requestId },
      data: { revokedAt: new Date() },
    });
    await prisma.documentEvent.create({
      data: {
        generatedDocumentId: id,
        type: 'SIGNATURE_REQUEST_REVOKED',
        actorId,
        payload: json({ requestId }),
      },
    });
    await this.audit(actorId, 'document.signature_request_revoked', 'GeneratedDocument', id, document.clinicId, { requestId });
    return revoked;
  }

  async cancelDocument(organizationId: string, actorId: string | undefined, id: string, reason: string) {
    const document = await this.getDocument(organizationId, id);
    if (document.status === 'CANCELLED') throw new ConflictException('Documento já cancelado.');
    if (!reason.trim() || reason.trim().length < 3) throw new BadRequestException('Informe o motivo do cancelamento.');
    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.generatedDocument.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: actorId,
          cancelReason: reason.trim(),
        },
      });
      await tx.documentEvent.create({
        data: {
          generatedDocumentId: id,
          type: 'CANCELLED',
          actorId,
          payload: json({ reason: reason.trim() }),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'document.cancelled',
          entity: 'GeneratedDocument',
          entityId: id,
          clinicId: document.clinicId,
          changes: json({ reason: reason.trim(), previousStatus: document.status }),
          correlationId: randomUUID(),
        },
      });
      return next;
    });
    return updated;
  }

  async archiveDocument(organizationId: string, actorId: string | undefined, id: string) {
    const document = await this.getDocument(organizationId, id);
    if (document.archivedAt) return document;
    const updated = await prisma.generatedDocument.update({
      where: { id },
      data: { archivedAt: new Date(), archivedById: actorId },
    });
    await prisma.documentEvent.create({
      data: { generatedDocumentId: id, type: 'ARCHIVED', actorId, payload: json({}) },
    });
    await this.audit(actorId, 'document.archived', 'GeneratedDocument', id, document.clinicId, {});
    return updated;
  }

  async getPublicSignatureRequest(token: string) {
    const request = await prisma.documentSignatureRequest.findFirst({
      where: { tokenHash: hash(token) },
      include: {
        document: {
          include: {
            template: { select: { name: true, type: true, version: true } },
          },
        },
      },
    });
    if (!request || request.revokedAt || request.usedAt || request.expiresAt < new Date()) {
      throw new NotFoundException('Link de assinatura inválido ou expirado.');
    }
    const clinic = await prisma.clinic.findFirst({
      where: { id: request.document.clinicId },
      select: { tradeName: true, legalName: true },
    });
    const identity = ((request.document.frozenContent as Record<string, unknown>)?.identity ?? {}) as Record<string, unknown>;
    return {
      requestId: request.id,
      signerName: request.signerName,
      signerRole: request.signerRole,
      expiresAt: request.expiresAt,
      document: {
        id: request.document.id,
        status: request.document.status,
        templateName: request.document.template.name,
        templateType: request.document.template.type,
        clinicName: clinic?.tradeName ?? clinic?.legalName ?? null,
        patientName: typeof identity.patientName === 'string' ? identity.patientName : null,
        // sem CPF completo / conteúdo clínico livre
      },
    };
  }

  async signPublicDocument(token: string, input: {
    evidence?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const request = await prisma.documentSignatureRequest.findFirst({
      where: { tokenHash: hash(token) },
    });
    if (!request || request.revokedAt || request.usedAt || request.expiresAt < new Date()) {
      throw new NotFoundException('Link de assinatura inválido ou expirado.');
    }
    const document = await prisma.generatedDocument.findUnique({ where: { id: request.generatedDocumentId } });
    if (!document) throw new NotFoundException('Documento não encontrado.');
    const signature = await this.signDocument(document.organizationId, document.id, {
      signerName: request.signerName,
      role: request.signerRole,
      method: 'REMOTE',
      evidence: input.evidence,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    await prisma.documentSignatureRequest.update({
      where: { id: request.id },
      data: { usedAt: new Date() },
    });
    return { ok: true, signatureId: signature.id };
  }

  async publicDocument(validationCode: string) {
    const document = await prisma.generatedDocument.findUnique({
      where: { validationCode },
      include: {
        template: { select: { type: true, name: true } },
        signatures: { select: { signerName: true, role: true, method: true, signedAt: true } },
      },
    });
    if (!document) throw new NotFoundException('Documento não encontrado.');
    const clinic = await prisma.clinic.findFirst({
      where: { id: document.clinicId },
      select: { tradeName: true, legalName: true },
    });
    return publicDocumentSafeView({
      status: document.status as DocumentStatus,
      contentHash: document.contentHash,
      generatedAt: document.generatedAt,
      templateType: document.template.type,
      clinicName: clinic?.tradeName ?? clinic?.legalName ?? null,
      signatures: document.signatures,
    });
  }

  private async audit(
    actorId: string | undefined,
    action: string,
    entity: string,
    entityId: string,
    clinicId: string | null | undefined,
    changes: Record<string, unknown>,
  ) {
    await prisma.auditEvent.create({
      data: {
        actorId,
        action,
        entity,
        entityId,
        clinicId: clinicId ?? undefined,
        changes: json(changes),
        correlationId: randomUUID(),
      },
    });
  }

  async receivables(organizationId: string, clinicId?: string, patientId?: string) {
    const rows = await prisma.receivable.findMany({
      where: {
        organizationId,
        ...(clinicId ? { clinicId } : {}),
        ...(patientId ? { patientId } : {}),
      },
      include: {
        payments: { include: { refunds: true } },
        treatment: { select: { id: true, title: true, status: true, total: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
    const patientIds = [...new Set(rows.map((row) => row.patientId))];
    const patients = patientIds.length
      ? await prisma.patient.findMany({
          where: { id: { in: patientIds }, organizationId },
          select: { id: true, fullName: true },
        })
      : [];
    const patientMap = new Map(patients.map((item) => [item.id, item]));
    return rows.map((row) => {
      const finance = buildReceivableFinanceView(row);
      const displayStatus = finance.effectiveStatus === 'OVERDUE' && !['CANCELLED', 'PAID'].includes(row.status)
        ? 'OVERDUE'
        : row.status === 'PAID' || row.status === 'CANCELLED'
          ? row.status
          : finance.effectiveStatus;
      return {
        ...row,
        patient: patientMap.get(row.patientId) ?? null,
        paidAmount: finance.paidAmount,
        refundedAmount: finance.refundedAmount,
        outstandingAmount: finance.outstandingAmount,
        effectiveStatus: finance.effectiveStatus,
        status: displayStatus,
      };
    });
  }

  async createReceivable(organizationId: string, input: {
    clinicId: string; patientId: string; treatmentId?: string; description: string;
    originalAmount: string; discount?: string; surcharge?: string; dueDate: string; paymentMethod?: string;
  }) {
    parseWithZod(receivableSchema, input);
    const [clinic, patient, treatment] = await Promise.all([
      prisma.clinic.findFirst({ where: { id: input.clinicId, organizationId, status: 'ACTIVE' }, select: { id: true } }),
      prisma.patient.findFirst({ where: { id: input.patientId, organizationId, status: { not: 'ARCHIVED' } }, select: { id: true } }),
      input.treatmentId ? prisma.treatmentPlan.findFirst({ where: { id: input.treatmentId, organizationId, patientId: input.patientId }, select: { id: true } }) : Promise.resolve({ id: 'optional' }),
    ]);
    if (!clinic || !patient || !treatment) throw new NotFoundException('Clínica, paciente ou tratamento inválido.');
    const originalAmount = money(input.originalAmount);
    const discount = money(input.discount ?? '0');
    const surcharge = money(input.surcharge ?? '0');
    if (discount.greaterThan(originalAmount.add(surcharge))) throw new ConflictException('Desconto supera o valor do título.');
    return prisma.receivable.create({
      data: { organizationId, ...input, originalAmount, discount, surcharge, netAmount: originalAmount.sub(discount).add(surcharge), dueDate: new Date(`${input.dueDate}T00:00:00Z`) },
    });
  }

  async registerPayment(organizationId: string, receivableId: string, input: {
    amount: string; method: string; idempotencyKey: string; provider?: 'NIBO' | 'ABACATEPAY';
  }) {
    const existing = await prisma.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
    const amount = positiveMoney(input.amount);
    return prisma.$transaction(async (tx) => {
      const receivable = await tx.receivable.findFirst({
        where: { id: receivableId, organizationId },
        include: {
          payments: { include: { refunds: true } },
          treatment: { select: { id: true, professionalId: true, clinicId: true } },
        },
      });
      if (!receivable) throw new NotFoundException('Recebível não encontrado.');
      await lockReceivableRow(tx, receivableId);
      if (receivable.status === 'CANCELLED') throw new ConflictException('Recebível cancelado.');

      const alreadyPaid = confirmedNetPaid(receivable.payments);
      const remaining = receivable.netAmount.sub(alreadyPaid);
      if (amount.gt(remaining)) {
        throw new ConflictException(`Pagamento excede o saldo restante (${remaining.toFixed(2)}).`);
      }

      const payment = await tx.payment.create({
        data: {
          receivableId,
          amount,
          method: input.method,
          provider: input.provider,
          idempotencyKey: input.idempotencyKey,
          status: 'CONFIRMED',
          paidAt: new Date(),
        },
      });
      await recalculateReceivableStatus(tx, receivableId, receivable.netAmount);
      await this.generateCommissionForPayment(tx, {
        organizationId,
        clinicId: receivable.clinicId,
        paymentId: payment.id,
        amount,
        occurredAt: payment.paidAt ?? new Date(),
        professionalId: receivable.treatment?.professionalId,
        treatmentId: receivable.treatmentId,
      });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'Payment',
          aggregateId: payment.id,
          eventType: 'payment.confirmed',
          payload: { paymentId: payment.id, receivableId },
        },
      });
      return payment;
    });
  }

  async refund(organizationId: string, paymentId: string, actorId: string, input: { amount: string; reason: string }) {
    const amount = positiveMoney(input.amount, 'Valor do estorno');
    if (!input.reason?.trim() || input.reason.trim().length < 5) {
      throw new BadRequestException('Motivo do estorno é obrigatório.');
    }
    return prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { id: paymentId, receivable: { organizationId } },
        include: { refunds: true, receivable: true },
      });
      if (!payment) throw new NotFoundException('Pagamento não encontrado.');
      await lockReceivableRow(tx, payment.receivableId);
      if (!['CONFIRMED', 'PARTIALLY_REFUNDED'].includes(payment.status)) {
        throw new ConflictException('Pagamento não aceita estorno.');
      }
      const totalRefunded = payment.refunds.reduce((sum, item) => sum.add(item.amount), money('0'));
      if (totalRefunded.add(amount).gt(payment.amount)) {
        throw new ConflictException('Estorno supera o valor disponível do pagamento.');
      }
      const refund = await tx.refund.create({
        data: { paymentId, amount, reason: input.reason.trim(), authorizedById: actorId },
      });
      const nextRefunded = totalRefunded.add(amount);
      const paymentStatus = computePaymentRefundStatus(payment.amount, nextRefunded);
      await tx.payment.update({ where: { id: paymentId }, data: { status: paymentStatus } });
      await recalculateReceivableStatus(tx, payment.receivableId, payment.receivable.netAmount);
      await this.reverseCommissionForRefund(tx, {
        organizationId,
        paymentId,
        refundAmount: amount,
        paymentAmount: payment.amount,
        actorId,
        refundId: refund.id,
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'payment.refund',
          entity: 'Payment',
          entityId: paymentId,
          clinicId: payment.receivable.clinicId,
          changes: json({
            refundId: refund.id,
            amount: amount.toString(),
            reason: input.reason.trim(),
            paymentStatus,
          }),
          correlationId: randomUUID(),
        },
      });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'Payment',
          aggregateId: paymentId,
          eventType: 'payment.refunded',
          payload: { paymentId, refundId: refund.id, amount: amount.toString() },
        },
      });
      return refund;
    });
  }

  private async reverseCommissionForRefund(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      paymentId: string;
      refundAmount: Prisma.Decimal;
      paymentAmount: Prisma.Decimal;
      actorId: string;
      refundId: string;
    },
  ) {
    const events = await tx.commissionEvent.findMany({
      where: {
        organizationId: input.organizationId,
        sourceType: 'PAYMENT',
        sourceId: input.paymentId,
        status: { in: ['FORECASTED', 'GENERATED', 'RELEASED', 'PENDING_ADJUSTMENT', 'BLOCKED'] },
      },
    });
    const totalRefunded = (await tx.refund.aggregate({
      where: { paymentId: input.paymentId },
      _sum: { amount: true },
    }))._sum.amount ?? money('0');
    const fullyRefunded = totalRefunded.gte(input.paymentAmount);

    for (const event of events) {
      if (fullyRefunded) {
        await tx.commissionEvent.update({
          where: { id: event.id },
          data: {
            status: 'REVERSED',
            metadata: json({
              ...(typeof event.metadata === 'object' && event.metadata && !Array.isArray(event.metadata)
                ? (event.metadata as Record<string, unknown>)
                : {}),
              reversedAt: new Date().toISOString(),
              reversedById: input.actorId,
              refundId: input.refundId,
            }),
          },
        });
        continue;
      }
      const ratio = input.refundAmount.div(input.paymentAmount);
      await tx.commissionEvent.create({
        data: {
          organizationId: event.organizationId,
          clinicId: event.clinicId,
          professionalId: event.professionalId,
          ruleId: event.ruleId,
          periodId: event.periodId,
          sourceType: 'PAYMENT_REFUND',
          sourceId: input.refundId,
          basisAmount: input.refundAmount.mul(-1),
          commissionAmount: event.commissionAmount.mul(ratio).mul(-1),
          status: 'GENERATED',
          occurredAt: new Date(),
          metadata: json({
            parentEventId: event.id,
            refundId: input.refundId,
            proportional: true,
            actorId: input.actorId,
          }),
        },
      });
    }
  }

  commissionRules(organizationId: string, includeInactive = false) {
    return prisma.commissionRule.findMany({
      where: { organizationId, ...(includeInactive ? {} : { active: true }) },
      orderBy: { priority: 'desc' },
    });
  }

  createCommissionRule(organizationId: string, input: {
    clinicId?: string; professionalId?: string; procedureId?: string; specialty?: string;
    basis: string; calculationType: string; value: string; validFrom: string; priority?: number;
    validUntil?: string; reversalBehavior?: string;
  }) {
    return prisma.commissionRule.create({
      data: {
        organizationId,
        clinicId: input.clinicId,
        professionalId: input.professionalId,
        procedureId: input.procedureId,
        specialty: input.specialty,
        basis: input.basis,
        calculationType: input.calculationType,
        value: money(input.value),
        validFrom: new Date(`${input.validFrom}T00:00:00Z`),
        validUntil: input.validUntil ? new Date(`${input.validUntil}T00:00:00Z`) : null,
        priority: input.priority ?? 0,
        reversalBehavior: input.reversalBehavior ?? 'REVERSE',
      },
    });
  }

  async deactivateCommissionRule(organizationId: string, id: string, validUntil?: string) {
    const rule = await prisma.commissionRule.findFirst({ where: { id, organizationId } });
    if (!rule) throw new NotFoundException('Regra de comissão não encontrada.');
    return prisma.commissionRule.update({
      where: { id },
      data: {
        active: false,
        validUntil: validUntil
          ? new Date(`${validUntil}T00:00:00Z`)
          : (rule.validUntil ?? new Date()),
      },
    });
  }

  /** Nova versão: encerra a regra atual e cria outra (sem mutação retroativa). */
  async reviseCommissionRule(organizationId: string, id: string, input: {
    clinicId?: string; professionalId?: string; procedureId?: string; specialty?: string;
    basis: string; calculationType: string; value: string; validFrom: string; priority?: number;
    validUntil?: string; reversalBehavior?: string;
  }) {
    const current = await prisma.commissionRule.findFirst({ where: { id, organizationId } });
    if (!current) throw new NotFoundException('Regra de comissão não encontrada.');
    const dayBefore = new Date(`${input.validFrom}T00:00:00Z`);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    return prisma.$transaction(async (tx) => {
      await tx.commissionRule.update({
        where: { id },
        data: { active: false, validUntil: dayBefore },
      });
      return tx.commissionRule.create({
        data: {
          organizationId,
          clinicId: input.clinicId ?? current.clinicId,
          professionalId: input.professionalId ?? current.professionalId,
          procedureId: input.procedureId ?? current.procedureId,
          specialty: input.specialty ?? current.specialty,
          basis: input.basis,
          calculationType: input.calculationType,
          value: money(input.value),
          validFrom: new Date(`${input.validFrom}T00:00:00Z`),
          validUntil: input.validUntil ? new Date(`${input.validUntil}T00:00:00Z`) : null,
          priority: input.priority ?? current.priority,
          reversalBehavior: input.reversalBehavior ?? current.reversalBehavior,
        },
      });
    });
  }

  commissionEvents(organizationId: string, query: {
    clinicId?: string; professionalId?: string; from?: string; to?: string; periodId?: string;
  }) {
    const from = query.from ? new Date(`${query.from}T00:00:00.000Z`) : undefined;
    const to = query.to ? new Date(`${query.to}T23:59:59.999Z`) : undefined;
    return prisma.commissionEvent.findMany({
      where: {
        organizationId,
        clinicId: query.clinicId,
        professionalId: query.professionalId,
        periodId: query.periodId,
        occurredAt: from || to ? { gte: from, lte: to } : undefined,
      },
      orderBy: { occurredAt: 'desc' },
      take: 500,
    });
  }

  commissionPeriods(organizationId: string, clinicId?: string) {
    return prisma.commissionPeriod.findMany({
      where: { organizationId, clinicId },
      include: { _count: { select: { events: true } } },
      orderBy: { referenceMonth: 'desc' },
      take: 36,
    });
  }

  async openCommissionPeriod(organizationId: string, input: { clinicId: string; referenceMonth: string }) {
    const clinic = await prisma.clinic.findFirst({ where: { id: input.clinicId, organizationId }, select: { id: true } });
    if (!clinic) throw new NotFoundException('Clínica não encontrada.');
    const referenceMonth = monthStart(input.referenceMonth);
    const existing = await prisma.commissionPeriod.findUnique({
      where: { clinicId_referenceMonth: { clinicId: input.clinicId, referenceMonth } },
    });
    if (existing) return existing;
    return prisma.commissionPeriod.create({
      data: { organizationId, clinicId: input.clinicId, referenceMonth, status: 'OPEN' },
    });
  }

  async closeCommissionPeriod(organizationId: string, actorId: string, id: string) {
    const period = await prisma.commissionPeriod.findFirst({ where: { id, organizationId } });
    if (!period) throw new NotFoundException('Período de comissão não encontrado.');
    if (period.status === 'CLOSED') return period;
    return prisma.$transaction(async (tx) => {
      const closed = await tx.commissionPeriod.update({
        where: { id },
        data: { status: 'CLOSED', closedAt: new Date(), closedById: actorId },
      });
      await tx.commissionEvent.updateMany({
        where: { periodId: id, status: { in: ['FORECASTED', 'GENERATED'] } },
        data: { status: 'RELEASED' },
      });
      return closed;
    });
  }

  async reopenCommissionPeriod(organizationId: string, id: string) {
    const period = await prisma.commissionPeriod.findFirst({ where: { id, organizationId } });
    if (!period) throw new NotFoundException('Período de comissão não encontrado.');
    if (period.status !== 'CLOSED') throw new ConflictException('Somente períodos fechados podem ser reabertos.');
    return prisma.$transaction(async (tx) => {
      const reopened = await tx.commissionPeriod.update({
        where: { id },
        data: { status: 'OPEN', closedAt: null, closedById: null },
      });
      await tx.commissionEvent.updateMany({
        where: { periodId: id, status: 'RELEASED' },
        data: { status: 'GENERATED' },
      });
      return reopened;
    });
  }

  private async generateCommissionForPayment(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      clinicId: string;
      paymentId: string;
      amount: Prisma.Decimal;
      occurredAt: Date;
      professionalId?: string | null;
      treatmentId?: string | null;
    },
  ) {
    if (!input.professionalId) return;
    let procedureIds: string[] = [];
    let specialties: string[] = [];
    if (input.treatmentId) {
      const items = await tx.treatmentItem.findMany({
        where: { treatmentPlanId: input.treatmentId },
        select: { procedure: { select: { id: true, specialty: true } } },
      });
      procedureIds = items.map((item) => item.procedure.id);
      specialties = items.map((item) => item.procedure.specialty).filter((value): value is string => Boolean(value));
    }
    const eligible = (await tx.commissionRule.findMany({
      where: {
        organizationId: input.organizationId,
        active: true,
        validFrom: { lte: input.occurredAt },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    })).filter((rule) => {
      if (rule.clinicId && rule.clinicId !== input.clinicId) return false;
      if (rule.professionalId && rule.professionalId !== input.professionalId) return false;
      if (rule.validUntil && rule.validUntil < input.occurredAt) return false;
      if (rule.procedureId) {
        if (!procedureIds.length || !procedureIds.includes(rule.procedureId)) return false;
      }
      if (rule.specialty) {
        if (!specialties.length || !specialties.includes(rule.specialty)) return false;
      }
      return true;
    });
    // Precedência: procedure > specialty > professional/clinic genérica (já filtrado); maior priority vence.
    const scored = eligible.map((rule) => ({
      rule,
      specificity: (rule.procedureId ? 4 : 0) + (rule.specialty ? 2 : 0) + (rule.professionalId ? 1 : 0),
    }));
    scored.sort((a, b) => b.specificity - a.specificity || b.rule.priority - a.rule.priority);
    const rule = scored[0]?.rule;
    if (!rule) return;

    const referenceMonth = monthStart(input.occurredAt);
    let period = await tx.commissionPeriod.findUnique({
      where: { clinicId_referenceMonth: { clinicId: input.clinicId, referenceMonth } },
    });
    if (!period) {
      period = await tx.commissionPeriod.create({
        data: {
          organizationId: input.organizationId,
          clinicId: input.clinicId,
          referenceMonth,
          status: 'OPEN',
        },
      });
    }
    // P0.3: pagamento NÃO falha se competência fechada — cria ajuste em período OPEN.
    let targetPeriod = period;
    let commissionStatus: 'GENERATED' | 'PENDING_ADJUSTMENT' = 'GENERATED';
    const originalPeriodId = period.id;
    if (period.status === 'CLOSED') {
      const nextMonth = new Date(Date.UTC(
        referenceMonth.getUTCFullYear(),
        referenceMonth.getUTCMonth() + 1,
        1,
      ));
      let openPeriod = await tx.commissionPeriod.findFirst({
        where: { clinicId: input.clinicId, status: 'OPEN' },
        orderBy: { referenceMonth: 'asc' },
      });
      if (!openPeriod) {
        openPeriod = await tx.commissionPeriod.create({
          data: {
            organizationId: input.organizationId,
            clinicId: input.clinicId,
            referenceMonth: nextMonth,
            status: 'OPEN',
          },
        });
      }
      targetPeriod = openPeriod;
      commissionStatus = 'PENDING_ADJUSTMENT';
    }

    const commissionAmount = rule.calculationType === 'FIXED'
      ? rule.value
      : input.amount.mul(rule.value).div(100);

    // P0.2: única fonte de verdade = CommissionEvent (não grava mais CommissionEntry).
    await tx.commissionEvent.upsert({
      where: {
        sourceType_sourceId_ruleId: {
          sourceType: 'PAYMENT',
          sourceId: input.paymentId,
          ruleId: rule.id,
        },
      },
      create: {
        organizationId: input.organizationId,
        clinicId: input.clinicId,
        professionalId: input.professionalId,
        ruleId: rule.id,
        periodId: targetPeriod.id,
        sourceType: 'PAYMENT',
        sourceId: input.paymentId,
        basisAmount: input.amount,
        commissionAmount,
        status: commissionStatus,
        occurredAt: input.occurredAt,
        metadata: json({
          treatmentId: input.treatmentId,
          basis: rule.basis,
          ruleId: rule.id,
          calculationType: rule.calculationType,
          value: rule.value.toString(),
          ...(commissionStatus === 'PENDING_ADJUSTMENT'
            ? { originalPeriodId, originalReferenceMonth: referenceMonth.toISOString() }
            : {}),
        }),
      },
      update: {},
    });

    if (commissionStatus === 'PENDING_ADJUSTMENT') {
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'CommissionPeriod',
          aggregateId: targetPeriod.id,
          eventType: 'commission.pending_adjustment',
          payload: json({
            paymentId: input.paymentId,
            clinicId: input.clinicId,
            originalPeriodId,
            adjustmentPeriodId: targetPeriod.id,
            professionalId: input.professionalId,
          }),
        },
      });
    }
  }


  deliveries(organizationId: string) {
    return prisma.messageDelivery.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  listMessageTemplates(organizationId: string, includeInactive = false) {
    return listMessageTemplates(organizationId, includeInactive);
  }

  createMessageTemplate(organizationId: string, input: Parameters<typeof createMessageTemplate>[1]) {
    return createMessageTemplate(organizationId, input);
  }

  updateMessageTemplate(organizationId: string, id: string, input: Parameters<typeof updateMessageTemplate>[2]) {
    return updateMessageTemplate(organizationId, id, input);
  }

  listMessagingChannels(organizationId: string, includeInactive = false) {
    return listMessagingChannels(organizationId, includeInactive);
  }

  createMessagingChannel(organizationId: string, input: Parameters<typeof createMessagingChannel>[1]) {
    return createMessagingChannel(organizationId, input);
  }

  updateMessagingChannel(organizationId: string, id: string, input: Parameters<typeof updateMessagingChannel>[2]) {
    return updateMessagingChannel(organizationId, id, input);
  }

  sendManualMessage(organizationId: string, actorId: string, input: Parameters<typeof sendManualMessage>[2]) {
    return sendManualMessage(organizationId, actorId, input);
  }

  async reports(organizationId: string, clinicId?: string, fromValue?: string, toValue?: string) {
    const period = z.object({
      from: z.string().date().optional(),
      to: z.string().date().optional(),
    }).refine((value) => !value.from || !value.to || value.from <= value.to, 'Período inválido.')
      .parse({ from: fromValue, to: toValue });
    const from = period.from ? new Date(`${period.from}T00:00:00.000Z`) : new Date(Date.now() - 30 * 86_400_000);
    const to = period.to ? new Date(`${period.to}T23:59:59.999Z`) : new Date();
    const dateRange = { gte: from, lte: to };
    const clinicWhere = clinicId ? { clinicId } : {};
    const [
      appointmentRows, financial, commissionRows, communication, newPatients, activePatients,
      inactivePatients, pendingReturns, treatments, payments,
    ] = await Promise.all([
      prisma.appointment.findMany({
        where: { organizationId, ...clinicWhere, startAt: dateRange },
        select: { status: true, startAt: true, endAt: true, professional: { select: { id: true, name: true } } },
      }),
      prisma.receivable.groupBy({
        by: ['status'], where: { organizationId, ...clinicWhere, dueDate: dateRange },
        _sum: { netAmount: true }, _count: true,
      }),
      prisma.commissionEvent.findMany({
        where: { organizationId, ...clinicWhere, occurredAt: dateRange },
        select: { status: true, basisAmount: true, commissionAmount: true, professionalId: true },
      }),
      prisma.messageDelivery.groupBy({
        by: ['status'], where: { organizationId, createdAt: dateRange }, _count: true,
      }),
      prisma.patient.count({ where: { organizationId, createdAt: dateRange } }),
      prisma.patient.count({ where: { organizationId, status: 'ACTIVE', clinics: clinicId ? { some: { clinicId } } : undefined } }),
      prisma.patient.count({ where: { organizationId, status: 'INACTIVE', clinics: clinicId ? { some: { clinicId } } : undefined } }),
      prisma.returnAlert.count({ where: { organizationId, ...clinicWhere, status: { in: ['PENDING', 'CONTACTED'] } } }),
      prisma.treatmentPlan.groupBy({
        by: ['status'], where: { organizationId, ...clinicWhere, createdAt: dateRange },
        _sum: { total: true }, _count: true,
      }),
      prisma.payment.findMany({
        where: {
          status: { in: ['CONFIRMED', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
          paidAt: dateRange,
          receivable: { organizationId, ...clinicWhere },
        },
        include: { refunds: true },
      }),
    ]);
    const receivedNet = payments.reduce((sum, payment) => sum.add(netPaidAmount(payment)), money('0'));
    const professionals = await prisma.professional.findMany({
      where: { id: { in: [...new Set(commissionRows.map((item) => item.professionalId))] } },
      select: { id: true, name: true },
    });
    const professionalNames = new Map(professionals.map((item) => [item.id, item.name]));
    const byProfessional = new Map<string, { professionalId: string; professional: string; scheduled: number; completed: number; cancelled: number; minutes: number }>();
    for (const item of appointmentRows) {
      const current = byProfessional.get(item.professional.id) ?? {
        professionalId: item.professional.id, professional: item.professional.name,
        scheduled: 0, completed: 0, cancelled: 0, minutes: 0,
      };
      current.scheduled += 1;
      if (item.status === 'COMPLETED') current.completed += 1;
      if (['CANCELLED', 'NO_SHOW'].includes(item.status)) current.cancelled += 1;
      if (!['CANCELLED', 'NO_SHOW'].includes(item.status)) current.minutes += Math.max(0, (item.endAt.getTime() - item.startAt.getTime()) / 60_000);
      byProfessional.set(item.professional.id, current);
    }
    const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86_400_000));
    const appointmentStatus = Object.entries(appointmentRows.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    }, {})).map(([status, count]) => ({ status, count }));
    const commissions = commissionRows.map((item) => ({
      professionalId: item.professionalId,
      professional: professionalNames.get(item.professionalId) ?? 'Profissional',
      status: item.status,
      baseAmount: item.basisAmount,
      amount: item.commissionAmount,
      percentage: item.basisAmount.isZero()
        ? 0
        : Number(item.commissionAmount.div(item.basisAmount).mul(100).toFixed(2)),
    }));
    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      agenda: {
        byStatus: appointmentStatus,
        byProfessional: [...byProfessional.values()].map((item) => ({
          ...item,
          occupancyRate: Math.min(100, Math.round((item.minutes / (days * 8 * 60)) * 100)),
        })),
      },
      patients: { new: newPatients, active: activePatients, inactive: inactivePatients, pendingReturns },
      financial: {
        byStatus: financial,
        received: receivedNet,
        payments: payments.filter((p) => ['CONFIRMED', 'PARTIALLY_REFUNDED'].includes(p.status)).length,
      },
      treatments,
      commissions,
      communication,
      appointments: appointmentStatus.map((item) => ({ status: item.status, _count: item.count })),
    };
  }

  async suggestPrescription(organizationId: string, input: {
    patientId: string; purpose: string; allergies?: string[]; medications?: string[];
  }) {
    const patient = await prisma.patient.findFirst({ where: { id: input.patientId, organizationId }, select: { id: true } });
    if (!patient) throw new NotFoundException('Paciente não encontrado.');
    return {
      provider: process.env.AI_PROVIDER ?? 'OPENAI',
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      status: process.env.OPENAI_MOCK === 'true' ? 'MOCK' : 'REVIEW_REQUIRED',
      items: [],
      clinicalWarnings: input.allergies?.length ? ['Revisar alergias informadas antes de prescrever.'] : [],
      missingInformation: ['Selecione medicamento e posologia; a sugestão exige revisão do dentista.'],
      privacy: { sentFields: ['purpose', 'ageRange', 'allergies', 'medications'], identifiersSent: false },
    };
  }

  prescriptions(organizationId: string, patientId: string) {
    return prisma.prescription.findMany({
      where: { organizationId, patientId },
      include: { folder: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getPrescription(organizationId: string, id: string) {
    const prescription = await prisma.prescription.findFirst({
      where: { id, organizationId },
      include: { folder: true },
    });
    if (!prescription) throw new NotFoundException('Prescrição não encontrada.');
    return prescription;
  }

  async createPrescription(organizationId: string, actorId: string | undefined, input: {
    clinicId: string; patientId: string; professionalId: string; purpose: string; items: unknown[];
    clinicalWarnings?: unknown[]; ignoredWarnings?: unknown[]; folderId?: string; aiMetadata?: Record<string, unknown>;
  }) {
    let items;
    try {
      items = normalizePrescriptionItems(input.items);
      assertIgnoredWarningsJustified({
        clinicalWarnings: input.clinicalWarnings ?? [],
        ignoredWarnings: input.ignoredWarnings ?? [],
      });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Prescrição inválida.');
    }
    const [clinic, patient, professional] = await Promise.all([
      prisma.clinic.findFirst({ where: { id: input.clinicId, organizationId }, select: { id: true, tradeName: true, legalName: true } }),
      prisma.patient.findFirst({ where: { id: input.patientId, organizationId }, select: { id: true, fullName: true, cpf: true } }),
      prisma.professional.findFirst({
        where: { id: input.professionalId, user: { organizationId } },
        select: { id: true, name: true, croNumber: true, croState: true },
      }),
    ]);
    if (!clinic || !patient || !professional) throw new NotFoundException('Clínica, paciente ou profissional inválido.');

    const folders = await this.ensurePatientFolders(organizationId, input.patientId);
    let folderId = input.folderId;
    if (folderId) {
      const folder = await prisma.patientDocumentFolder.findFirst({
        where: { id: folderId, organizationId, patientId: input.patientId, archivedAt: null },
      });
      if (!folder) throw new NotFoundException('Pasta não encontrada.');
    } else {
      folderId = folders.find((f) => f.name === 'Receitas')?.id;
    }

    const frozenIdentity = buildServerFrozenContent({
      clinicalContent: { purpose: input.purpose.trim(), items },
      patient,
      professional,
      clinic,
      template: { id: 'prescription', name: 'Receituário', type: 'PRESCRIPTION', version: 1 },
    }).identity;

    const created = await prisma.prescription.create({
      data: {
        organizationId,
        clinicId: input.clinicId,
        patientId: input.patientId,
        professionalId: input.professionalId,
        folderId,
        purpose: input.purpose.trim(),
        items: json(items),
        clinicalWarnings: json(input.clinicalWarnings ?? []),
        ignoredWarnings: json(input.ignoredWarnings ?? []),
        frozenIdentity: json(frozenIdentity),
        aiMetadata: input.aiMetadata ? json(input.aiMetadata) : undefined,
        status: 'DRAFT',
        validationCode: randomBytes(12).toString('base64url'),
      },
    });
    await this.audit(actorId, 'prescription.created', 'Prescription', created.id, input.clinicId, { status: 'DRAFT' });
    return created;
  }

  async updatePrescriptionDraft(organizationId: string, actorId: string | undefined, id: string, input: {
    purpose?: string; items?: unknown[]; clinicalWarnings?: unknown[]; ignoredWarnings?: unknown[];
  }) {
    const prescription = await this.getPrescription(organizationId, id);
    if (prescription.status !== 'DRAFT') throw new ConflictException('Somente rascunhos podem ser editados.');
    let items = prescription.items;
    if (input.items) {
      try {
        items = normalizePrescriptionItems(input.items);
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Itens inválidos.');
      }
    }
    try {
      assertIgnoredWarningsJustified({
        clinicalWarnings: input.clinicalWarnings ?? prescription.clinicalWarnings,
        ignoredWarnings: input.ignoredWarnings ?? prescription.ignoredWarnings,
      });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Alertas inválidos.');
    }
    return prisma.prescription.update({
      where: { id },
      data: {
        purpose: input.purpose?.trim(),
        items: json(items),
        clinicalWarnings: input.clinicalWarnings ? json(input.clinicalWarnings) : undefined,
        ignoredWarnings: input.ignoredWarnings ? json(input.ignoredWarnings) : undefined,
      },
    });
  }

  async reviewPrescription(organizationId: string, actorId: string | undefined, id: string) {
    const prescription = await this.getPrescription(organizationId, id);
    if (prescription.status !== 'DRAFT') throw new ConflictException('Somente rascunhos podem ser revisados.');
    const updated = await prisma.prescription.update({
      where: { id },
      data: { status: 'REVIEWED', reviewedAt: new Date(), reviewedById: actorId },
    });
    await this.audit(actorId, 'prescription.reviewed', 'Prescription', id, prescription.clinicId, {});
    return updated;
  }

  async signPrescription(organizationId: string, actorId: string | undefined, id: string) {
    const prescription = await this.getPrescription(organizationId, id);
    if (prescription.status === 'SIGNED' || prescription.status === 'CANCELLED') {
      throw new ConflictException('Prescrição imutável.');
    }
    if (prescription.status !== 'DRAFT' && prescription.status !== 'REVIEWED') {
      throw new ConflictException('Status inválido para assinatura.');
    }
    const [patient, professional, clinic] = await Promise.all([
      prisma.patient.findFirst({ where: { id: prescription.patientId, organizationId }, select: { fullName: true, cpf: true } }),
      prisma.professional.findFirst({
        where: { id: prescription.professionalId },
        select: { name: true, croNumber: true, croState: true },
      }),
      prisma.clinic.findFirst({
        where: { id: prescription.clinicId, organizationId },
        select: { tradeName: true, legalName: true },
      }),
    ]);
    if (!patient || !professional || !clinic) throw new NotFoundException('Dados de identidade indisponíveis.');
    const frozen = buildServerFrozenContent({
      clinicalContent: {
        purpose: prescription.purpose,
        items: prescription.items as unknown[],
        clinicalWarnings: prescription.clinicalWarnings,
        ignoredWarnings: prescription.ignoredWarnings,
      },
      patient,
      professional,
      clinic,
      template: { id: prescription.id, name: 'Receituário', type: 'PRESCRIPTION', version: 1 },
    });
    const contentHash = hashDocumentContent(frozen);
    const updated = await prisma.prescription.update({
      where: { id },
      data: {
        status: 'SIGNED',
        signedAt: new Date(),
        contentHash,
        frozenIdentity: json(frozen.identity),
        reviewedAt: prescription.reviewedAt ?? new Date(),
        reviewedById: prescription.reviewedById ?? actorId,
      },
    });
    await this.audit(actorId, 'prescription.signed', 'Prescription', id, prescription.clinicId, { contentHash });
    return updated;
  }

  async cancelPrescription(organizationId: string, actorId: string | undefined, id: string, reason: string) {
    const prescription = await this.getPrescription(organizationId, id);
    if (prescription.status === 'CANCELLED') throw new ConflictException('Prescrição já cancelada.');
    if (!reason.trim() || reason.trim().length < 3) throw new BadRequestException('Informe o motivo.');
    const updated = await prisma.prescription.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledById: actorId,
        cancelReason: reason.trim(),
      },
    });
    await this.audit(actorId, 'prescription.cancelled', 'Prescription', id, prescription.clinicId, { reason: reason.trim() });
    return updated;
  }

  async prescriptionPdf(organizationId: string, id: string) {
    const prescription = await this.getPrescription(organizationId, id);
    const identity = (prescription.frozenIdentity ?? {}) as Record<string, unknown>;
    const items = Array.isArray(prescription.items) ? prescription.items as Array<Record<string, unknown>> : [];
    const bodyLines = [
      `Finalidade: ${prescription.purpose}`,
      ...items.map((item, index) => {
        const name = String(item.medicationName ?? item.name ?? `Item ${index + 1}`);
        const qty = String(item.quantity ?? '');
        const dosage = String(item.dosage ?? item.instructions ?? '');
        return `${index + 1}. ${name} — ${qty} — ${dosage}`;
      }),
    ];
    const clinic = await prisma.clinic.findFirst({
      where: { id: prescription.clinicId, organizationId },
      select: { tradeName: true, legalName: true },
    });
    const pdf = await buildClinicalDocumentPdf({
      clinicName: clinic?.tradeName ?? clinic?.legalName ?? 'Sonder Clinic',
      title: 'Receituário odontológico',
      patientName: typeof identity.patientName === 'string' ? identity.patientName : undefined,
      patientDocument: typeof identity.patientCpfMasked === 'string' ? `CPF ${identity.patientCpfMasked}` : undefined,
      bodyLines,
      validationCode: prescription.validationCode ?? undefined,
      footerLeft: typeof identity.professionalName === 'string'
        ? `${identity.professionalName}\n${identity.professionalCro ?? ''}`
        : 'Assinatura do profissional',
      footerRight: prescription.status === 'SIGNED' ? 'Assinado digitalmente' : 'Rascunho',
    });
    return {
      filename: `receita-${prescription.id.slice(0, 8)}.pdf`,
      contentType: 'application/pdf',
      content: pdf,
    };
  }

  listPrescriptionProtocols(organizationId: string, professionalId?: string) {
    return prisma.prescriptionProtocol.findMany({
      where: {
        organizationId,
        active: true,
        archivedAt: null,
        ...(professionalId ? { OR: [{ professionalId }, { professionalId: null }] } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async createPrescriptionProtocol(organizationId: string, actorId: string | undefined, input: {
    name: string; purpose: string; items: unknown[]; professionalId?: string;
  }) {
    let items;
    try {
      items = normalizePrescriptionItems(input.items);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Itens inválidos.');
    }
    return prisma.prescriptionProtocol.create({
      data: {
        organizationId,
        professionalId: input.professionalId,
        name: input.name.trim(),
        purpose: input.purpose.trim(),
        items: json(items),
        createdById: actorId,
      },
    });
  }

  async updatePrescriptionProtocol(organizationId: string, id: string, input: {
    name?: string; purpose?: string; items?: unknown[];
  }) {
    const protocol = await prisma.prescriptionProtocol.findFirst({ where: { id, organizationId, archivedAt: null } });
    if (!protocol) throw new NotFoundException('Protocolo não encontrado.');
    let items = protocol.items;
    if (input.items) {
      try {
        items = normalizePrescriptionItems(input.items);
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Itens inválidos.');
      }
    }
    return prisma.prescriptionProtocol.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        purpose: input.purpose?.trim(),
        items: json(items),
      },
    });
  }

  async archivePrescriptionProtocol(organizationId: string, id: string) {
    const protocol = await prisma.prescriptionProtocol.findFirst({ where: { id, organizationId } });
    if (!protocol) throw new NotFoundException('Protocolo não encontrado.');
    return prisma.prescriptionProtocol.update({
      where: { id },
      data: { active: false, archivedAt: new Date() },
    });
  }

  payables(organizationId: string, clinicId?: string) {
    return prisma.payable.findMany({
      where: { organizationId, ...(clinicId ? { clinicId } : {}) },
      include: { payments: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  async createPayable(organizationId: string, input: {
    clinicId: string; description: string; originalAmount: string; dueDate: string;
    supplierName?: string; notes?: string; categoryId?: string; costCenterId?: string;
  }) {
    const clinic = await prisma.clinic.findFirst({ where: { id: input.clinicId, organizationId } });
    if (!clinic) throw new NotFoundException('Clínica não encontrada.');
    if (input.categoryId) {
      const category = await prisma.financeCategory.findFirst({ where: { id: input.categoryId, organizationId, active: true } });
      if (!category) throw new NotFoundException('Categoria financeira não encontrada.');
    }
    if (input.costCenterId) {
      const costCenter = await prisma.costCenter.findFirst({ where: { id: input.costCenterId, organizationId, active: true } });
      if (!costCenter) throw new NotFoundException('Centro de custo não encontrado.');
    }
    return prisma.payable.create({
      data: {
        organizationId,
        clinicId: input.clinicId,
        description: input.description,
        originalAmount: money(input.originalAmount),
        dueDate: new Date(input.dueDate),
        supplierName: input.supplierName,
        notes: input.notes,
        categoryId: input.categoryId,
        costCenterId: input.costCenterId,
      },
    });
  }

  async payPayable(organizationId: string, id: string, input: { amount: string; method: string; notes?: string }) {
    const amount = positiveMoney(input.amount);
    return prisma.$transaction(async (tx) => {
      const payable = await tx.payable.findFirst({ where: { id, organizationId } });
      if (!payable) throw new NotFoundException('Conta a pagar não encontrada.');
      await lockPayableRow(tx, id);
      if (payable.status === 'CANCELLED' || payable.status === 'PAID') {
        throw new ConflictException('Título não aceita pagamento.');
      }
      const remaining = payable.originalAmount.sub(payable.paidAmount);
      if (amount.gt(remaining)) {
        throw new ConflictException(`Pagamento excede o saldo restante (${remaining.toFixed(2)}).`);
      }
      await tx.payablePayment.create({
        data: { payableId: id, amount, method: input.method, notes: input.notes, status: 'CONFIRMED' },
      });
      const paidAmount = payable.paidAmount.add(amount);
      const status = computePayableStatus(payable.originalAmount, paidAmount);
      return tx.payable.update({
        where: { id },
        data: { paidAmount, status },
        include: { payments: true },
      });
    });
  }

  async refundPayablePayment(
    organizationId: string,
    paymentId: string,
    actorId: string,
    input: { amount: string; reason: string },
  ) {
    const amount = positiveMoney(input.amount, 'Valor do estorno');
    if (!input.reason?.trim() || input.reason.trim().length < 5) {
      throw new BadRequestException('Motivo do estorno é obrigatório.');
    }
    return prisma.$transaction(async (tx) => {
      const payment = await tx.payablePayment.findFirst({
        where: { id: paymentId, payable: { organizationId } },
        include: { payable: true },
      });
      if (!payment) throw new NotFoundException('Pagamento de conta a pagar não encontrado.');
      await lockPayableRow(tx, payment.payableId);
      if (!['CONFIRMED', 'PARTIALLY_REFUNDED'].includes(payment.status)) {
        throw new ConflictException('Pagamento não aceita estorno.');
      }
      const available = payment.amount.sub(payment.refundedAmount);
      if (amount.gt(available)) {
        throw new ConflictException(`Estorno supera o saldo do pagamento (${available.toFixed(2)}).`);
      }
      const nextRefunded = payment.refundedAmount.add(amount);
      const paymentStatus = computePaymentRefundStatus(payment.amount, nextRefunded);
      await tx.payablePayment.update({
        where: { id: paymentId },
        data: { refundedAmount: nextRefunded, status: paymentStatus },
      });
      const paidAmount = payment.payable.paidAmount.sub(amount);
      const payableStatus = computePayableStatus(payment.payable.originalAmount, paidAmount);
      const payable = await tx.payable.update({
        where: { id: payment.payableId },
        data: { paidAmount, status: payableStatus },
        include: { payments: true },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'payable_payment.refund',
          entity: 'PayablePayment',
          entityId: paymentId,
          clinicId: payment.payable.clinicId,
          changes: json({
            amount: amount.toString(),
            reason: input.reason.trim(),
            paymentStatus,
            payableStatus,
          }),
          correlationId: randomUUID(),
        },
      });
      return payable;
    });
  }

  async cancelPayable(organizationId: string, id: string, reason: string) {
    const payable = await prisma.payable.findFirst({ where: { id, organizationId } });
    if (!payable) throw new NotFoundException('Conta a pagar não encontrada.');
    if (payable.paidAmount.gt(0)) throw new ConflictException('Título com pagamento deve ser estornado, não cancelado.');
    return prisma.payable.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
    });
  }

  async cashflow(organizationId: string, clinicId: string | undefined, from?: string, to?: string) {
    const periodFrom = from ? new Date(from) : new Date(Date.now() - 30 * 86400_000);
    const periodTo = to ? new Date(to) : new Date();
    const orgFilter = { organizationId, ...(clinicId ? { clinicId } : {}) };
    const [inPayments, outPayments, refundsInPeriod] = await Promise.all([
      prisma.payment.findMany({
        where: {
          status: { in: ['CONFIRMED', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
          paidAt: { gte: periodFrom, lte: periodTo },
          receivable: orgFilter,
        },
        select: { amount: true, method: true, paidAt: true, status: true, refunds: true },
      }),
      prisma.payablePayment.findMany({
        where: {
          status: { in: ['CONFIRMED', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
          paidAt: { gte: periodFrom, lte: periodTo },
          payable: orgFilter,
        },
        select: { amount: true, method: true, paidAt: true, status: true, refundedAmount: true },
      }),
      prisma.refund.findMany({
        where: {
          createdAt: { gte: periodFrom, lte: periodTo },
          payment: { receivable: orgFilter },
        },
        select: {
          amount: true,
          createdAt: true,
          payment: { select: { paidAt: true } },
        },
      }),
    ]);

    const paymentNetRows = inPayments.map((row) => ({
      amount: netPaidAmount(row),
      method: row.method,
      paidAt: row.paidAt,
    }));
    const payableNetRows = outPayments.map((row) => ({
      amount: netPayablePaid(row),
      method: row.method,
      paidAt: row.paidAt,
    }));

    // Estornos de pagamentos feitos fora do período reduzem o caixa no dia do estorno.
    const priorRefunds = refundsInPeriod.filter((refund) => {
      const paidAt = refund.payment.paidAt;
      return !paidAt || paidAt < periodFrom || paidAt > periodTo;
    });
    const priorRefundTotal = priorRefunds.reduce((sum, row) => sum + Number(row.amount), 0);
    const inflow = Math.max(
      0,
      paymentNetRows.reduce((sum, row) => sum + Number(row.amount), 0) - priorRefundTotal,
    );
    const outflow = payableNetRows.reduce((sum, row) => sum + Number(row.amount), 0);

    const byMethod = (rows: Array<{ amount: Prisma.Decimal | number; method: string }>) => {
      const map = new Map<string, number>();
      for (const row of rows) {
        const key = row.method || 'OUTRO';
        map.set(key, (map.get(key) ?? 0) + Number(row.amount));
      }
      return [...map.entries()]
        .map(([method, amount]) => ({ method, amount }))
        .sort((a, b) => b.amount - a.amount);
    };
    const dayKey = (value: Date) => value.toISOString().slice(0, 10);
    const sumByDay = (rows: Array<{ amount: Prisma.Decimal | number; paidAt: Date | null }>) => {
      const map = new Map<string, number>();
      for (const row of rows) {
        if (!row.paidAt) continue;
        const key = dayKey(row.paidAt);
        map.set(key, (map.get(key) ?? 0) + Number(row.amount));
      }
      return map;
    };
    const refundDayMap = new Map<string, number>();
    for (const refund of priorRefunds) {
      const key = dayKey(refund.createdAt);
      refundDayMap.set(key, (refundDayMap.get(key) ?? 0) + Number(refund.amount));
    }
    const inflowByDay = sumByDay(paymentNetRows);
    const outflowByDay = sumByDay(payableNetRows);
    const series: Array<{ date: string; inflow: number; outflow: number; net: number; balance: number }> = [];
    const cursor = new Date(Date.UTC(
      periodFrom.getUTCFullYear(),
      periodFrom.getUTCMonth(),
      periodFrom.getUTCDate(),
    ));
    const end = new Date(Date.UTC(
      periodTo.getUTCFullYear(),
      periodTo.getUTCMonth(),
      periodTo.getUTCDate(),
    ));
    let balance = 0;
    while (cursor.getTime() <= end.getTime()) {
      const date = cursor.toISOString().slice(0, 10);
      const dayIn = Math.max(0, (inflowByDay.get(date) ?? 0) - (refundDayMap.get(date) ?? 0));
      const dayOut = outflowByDay.get(date) ?? 0;
      const net = dayIn - dayOut;
      balance += net;
      series.push({ date, inflow: dayIn, outflow: dayOut, net, balance });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return {
      from: periodFrom,
      to: periodTo,
      inflow,
      outflow,
      net: inflow - outflow,
      inflowByMethod: byMethod(paymentNetRows),
      outflowByMethod: byMethod(payableNetRows),
      counts: { inflows: inPayments.length, outflows: outPayments.length },
      series,
    };
  }

  financeRecurrences(organizationId: string, clinicId?: string) {
    return prisma.financeRecurrence.findMany({
      where: { organizationId, ...(clinicId ? { clinicId } : {}) },
      orderBy: [{ active: 'desc' }, { nextOccurrence: 'asc' }],
    });
  }

  async createFinanceRecurrence(organizationId: string, input: {
    clinicId: string;
    kind: 'PAYABLE' | 'RECEIVABLE';
    description: string;
    amount: string;
    frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
    interval?: number;
    nextOccurrence: string;
    endsAt?: string;
    patientId?: string;
    supplierName?: string;
    notes?: string;
  }) {
    parseWithZod(financeRecurrenceSchema, input);
    const clinic = await prisma.clinic.findFirst({ where: { id: input.clinicId, organizationId } });
    if (!clinic) throw new NotFoundException('Clínica não encontrada.');
    if (input.kind === 'RECEIVABLE') {
      if (!input.patientId) throw new BadRequestException('Recorrência a receber exige patientId.');
      const patient = await prisma.patient.findFirst({
        where: { id: input.patientId, organizationId, status: { not: 'ARCHIVED' } },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException('Paciente não encontrado.');
    }
    const metadata: Record<string, unknown> = {};
    if (input.patientId) metadata.patientId = input.patientId;
    if (input.supplierName) metadata.supplierName = input.supplierName;
    if (input.notes) metadata.notes = input.notes;
    return prisma.financeRecurrence.create({
      data: {
        organizationId,
        clinicId: input.clinicId,
        kind: input.kind,
        description: input.description.trim(),
        amount: money(input.amount),
        frequency: input.frequency,
        interval: input.interval ?? 1,
        nextOccurrence: new Date(`${input.nextOccurrence}T00:00:00.000Z`),
        endsAt: input.endsAt ? new Date(`${input.endsAt}T00:00:00.000Z`) : null,
        metadata: json(metadata),
      },
    });
  }

  async updateFinanceRecurrence(organizationId: string, id: string, input: {
    description?: string;
    amount?: string;
    frequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
    interval?: number;
    nextOccurrence?: string;
    endsAt?: string | null;
    active?: boolean;
    patientId?: string;
    supplierName?: string;
    notes?: string;
  }) {
    parseWithZod(financeRecurrencePatchSchema, input);
    const existing = await prisma.financeRecurrence.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Recorrência não encontrada.');
    const metadata = { ...(existing.metadata as Record<string, unknown>) };
    if (input.patientId !== undefined) metadata.patientId = input.patientId;
    if (input.supplierName !== undefined) metadata.supplierName = input.supplierName;
    if (input.notes !== undefined) metadata.notes = input.notes;
    if (existing.kind === 'RECEIVABLE') {
      const patientId = typeof metadata.patientId === 'string' ? metadata.patientId : undefined;
      if (!patientId) throw new BadRequestException('Recorrência a receber exige patientId.');
    }
    return prisma.financeRecurrence.update({
      where: { id },
      data: {
        description: input.description?.trim(),
        amount: input.amount ? money(input.amount) : undefined,
        frequency: input.frequency,
        interval: input.interval,
        nextOccurrence: input.nextOccurrence
          ? new Date(`${input.nextOccurrence}T00:00:00.000Z`)
          : undefined,
        endsAt: input.endsAt === null
          ? null
          : input.endsAt
            ? new Date(`${input.endsAt}T00:00:00.000Z`)
            : undefined,
        active: input.active,
        metadata: json(metadata),
      },
    });
  }

  async generateFinanceRecurrence(organizationId: string, id: string) {
    const recurrence = await prisma.financeRecurrence.findFirst({ where: { id, organizationId } });
    if (!recurrence) throw new NotFoundException('Recorrência não encontrada.');
    if (!recurrence.active) throw new ConflictException('Recorrência inativa.');
    const result = await materializeFinanceRecurrence(recurrence);
    if (!result) throw new ConflictException('Recorrência fora da janela (endsAt) ou sem dados para gerar.');
    return result;
  }
}

type RecurrenceRow = {
  id: string;
  organizationId: string;
  clinicId: string;
  kind: string;
  description: string;
  amount: Prisma.Decimal;
  frequency: string;
  interval: number;
  nextOccurrence: Date;
  endsAt: Date | null;
  metadata: unknown;
};

function advanceOccurrence(from: Date, frequency: string, interval: number): Date {
  const next = new Date(from);
  const step = Math.max(1, interval);
  switch (frequency) {
    case 'DAILY':
      next.setUTCDate(next.getUTCDate() + step);
      break;
    case 'WEEKLY':
      next.setUTCDate(next.getUTCDate() + 7 * step);
      break;
    case 'YEARLY':
      next.setUTCFullYear(next.getUTCFullYear() + step);
      break;
    case 'MONTHLY':
    default:
      next.setUTCMonth(next.getUTCMonth() + step);
      break;
  }
  return next;
}

async function materializeFinanceRecurrence(recurrence: RecurrenceRow) {
  const occurrence = new Date(recurrence.nextOccurrence);
  if (recurrence.endsAt && occurrence > recurrence.endsAt) {
    await prisma.financeRecurrence.update({
      where: { id: recurrence.id },
      data: { active: false },
    });
    return null;
  }
  const metadata = (recurrence.metadata ?? {}) as Record<string, unknown>;
  const dueDate = occurrence;
  const description = `${recurrence.description} (${dueDate.toISOString().slice(0, 10)})`;

  return prisma.$transaction(async (tx) => {
    let created: { type: string; id: string };
    if (recurrence.kind === 'PAYABLE') {
      const payable = await tx.payable.create({
        data: {
          organizationId: recurrence.organizationId,
          clinicId: recurrence.clinicId,
          description,
          originalAmount: recurrence.amount,
          dueDate,
          supplierName: typeof metadata.supplierName === 'string' ? metadata.supplierName : undefined,
          notes: typeof metadata.notes === 'string' ? metadata.notes : `Gerado pela recorrência ${recurrence.id}`,
        },
      });
      created = { type: 'PAYABLE', id: payable.id };
    } else if (recurrence.kind === 'RECEIVABLE') {
      const patientId = typeof metadata.patientId === 'string' ? metadata.patientId : null;
      if (!patientId) throw new BadRequestException('Recorrência a receber sem patientId no metadata.');
      const receivable = await tx.receivable.create({
        data: {
          organizationId: recurrence.organizationId,
          clinicId: recurrence.clinicId,
          patientId,
          description,
          originalAmount: recurrence.amount,
          discount: money('0'),
          surcharge: money('0'),
          netAmount: recurrence.amount,
          dueDate,
        },
      });
      created = { type: 'RECEIVABLE', id: receivable.id };
    } else {
      throw new BadRequestException(`Tipo de recorrência inválido: ${recurrence.kind}`);
    }

    const nextOccurrence = advanceOccurrence(occurrence, recurrence.frequency, recurrence.interval);
    const exhausted = Boolean(recurrence.endsAt && nextOccurrence > recurrence.endsAt);
    const updated = await tx.financeRecurrence.update({
      where: { id: recurrence.id },
      data: {
        nextOccurrence,
        active: exhausted ? false : true,
      },
    });
    return { recurrence: updated, generated: created };
  });
}
