import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma, prisma } from '@sonder/database';
import { z } from 'zod';
import { parseWithZod } from '../../common/zod-validation';

const money = (value: string) => new Prisma.Decimal(value);
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const json = (value: unknown) => value as Prisma.InputJsonValue;
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

@Injectable()
export class OperationsService {
  procedures(organizationId: string) {
    return prisma.procedure.findMany({ where: { organizationId, active: true }, orderBy: { name: 'asc' } });
  }

  createProcedure(organizationId: string, input: {
    internalCode: string; tussCode?: string; name: string; specialty?: string;
    defaultDuration: number; defaultSessions?: number; requiresTooth?: boolean; requiresFace?: boolean;
  }) {
    return prisma.procedure.create({ data: { organizationId, ...input } });
  }

  treatmentPlans(organizationId: string, patientId?: string, clinicId?: string) {
    return prisma.treatmentPlan.findMany({
      where: { organizationId, patientId, clinicId },
      include: { items: { include: { procedure: true, sessions: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTreatment(organizationId: string, input: {
    clinicId: string; patientId: string; professionalId: string; title: string;
    discount?: string; notes?: string; items: Array<{
      procedureId: string; professionalId: string; toothFdi?: string; face?: string;
      quantity: number; unitPrice: string; plannedSessions?: number; urgent?: boolean;
    }>;
  }) {
    const itemValues = input.items.map((item, index) => {
      const total = money(item.unitPrice).mul(item.quantity);
      return { ...item, unitPrice: money(item.unitPrice), total, sortOrder: index };
    });
    const subtotal = itemValues.reduce((sum, item) => sum.add(item.total), money('0'));
    const discount = money(input.discount ?? '0');
    if (discount.greaterThan(subtotal)) throw new ConflictException('Desconto não pode superar o subtotal.');
    return prisma.treatmentPlan.create({
      data: {
        organizationId,
        clinicId: input.clinicId,
        patientId: input.patientId,
        professionalId: input.professionalId,
        title: input.title,
        notes: input.notes,
        subtotal,
        discount,
        total: subtotal.sub(discount),
        priceSnapshot: { capturedAt: new Date().toISOString() },
        items: { create: itemValues },
      },
      include: { items: true },
    });
  }

  async approveTreatment(organizationId: string, id: string, itemIds: string[]) {
    const plan = await prisma.treatmentPlan.findFirst({ where: { id, organizationId }, include: { items: true } });
    if (!plan) throw new NotFoundException('Plano de tratamento não encontrado.');
    const validIds = new Set(plan.items.map((item) => item.id));
    if (itemIds.some((itemId) => !validIds.has(itemId))) throw new ConflictException('Item não pertence ao plano.');
    return prisma.$transaction(async (tx) => {
      await tx.treatmentItem.updateMany({ where: { id: { in: itemIds }, treatmentPlanId: id }, data: { status: 'APPROVED', approvedAt: new Date() } });
      const status = itemIds.length === plan.items.length ? 'APPROVED' : 'PARTIALLY_APPROVED';
      return tx.treatmentPlan.update({ where: { id }, data: { status }, include: { items: true } });
    });
  }

  addSession(organizationId: string, itemId: string, input: {
    professionalId: string; appointmentId?: string; executionNotes: string; materials?: unknown[];
    complications?: string; patientSignatureHash?: string; professionalSignatureHash?: string;
  }) {
    return prisma.treatmentSession.create({
      data: { treatmentItemId: itemId, ...input, materials: json(input.materials ?? []) },
    });
  }

  documentTemplates(organizationId: string) {
    return prisma.documentTemplate.findMany({ where: { organizationId, active: true }, orderBy: { name: 'asc' } });
  }

  documents(organizationId: string, clinicId?: string) {
    return prisma.generatedDocument.findMany({
      where: { organizationId, clinicId },
      select: {
        id: true,
        patientId: true,
        treatmentId: true,
        templateVersion: true,
        status: true,
        validationCode: true,
        generatedAt: true,
        signatures: { select: { signerName: true, role: true, signedAt: true } },
      },
      orderBy: { generatedAt: 'desc' },
      take: 200,
    });
  }

  createDocumentTemplate(organizationId: string, input: {
    type: string; name: string; structuredContent: Record<string, unknown>;
    allowedVariables: string[]; signatureRules?: Record<string, unknown>;
  }) {
    return prisma.documentTemplate.create({
      data: {
        organizationId,
        type: input.type,
        name: input.name,
        structuredContent: json(input.structuredContent),
        allowedVariables: json(input.allowedVariables),
        signatureRules: json(input.signatureRules ?? {}),
      },
    });
  }

  async generateDocument(organizationId: string, input: {
    clinicId: string; templateId: string; patientId: string; treatmentId?: string;
    frozenContent: Record<string, unknown>;
  }) {
    const template = await prisma.documentTemplate.findFirst({ where: { id: input.templateId, organizationId, active: true } });
    if (!template) throw new NotFoundException('Modelo de documento não encontrado.');
    return prisma.generatedDocument.create({
      data: {
        organizationId,
        clinicId: input.clinicId,
        templateId: template.id,
        templateVersion: template.version,
        patientId: input.patientId,
        treatmentId: input.treatmentId,
        frozenContent: json(input.frozenContent),
        contentHash: hash(input.frozenContent),
        validationCode: randomBytes(18).toString('base64url'),
      },
    });
  }

  async signDocument(organizationId: string, id: string, input: {
    signerId?: string; signerName: string; role: string; method: string;
    ipAddress?: string; userAgent?: string; evidence?: Record<string, unknown>;
  }) {
    const document = await prisma.generatedDocument.findFirst({ where: { id, organizationId } });
    if (!document) throw new NotFoundException('Documento não encontrado.');
    if (document.status === 'SIGNED' || document.status === 'CANCELLED') throw new ConflictException('Documento imutável.');
    return prisma.$transaction(async (tx) => {
      const signature = await tx.documentSignature.create({
        data: {
          generatedDocumentId: id,
          ...input,
          evidence: json(input.evidence ?? {}),
          signedHash: hash({ documentHash: document.contentHash, signer: input.signerName, at: new Date().toISOString() }),
        },
      });
      await tx.generatedDocument.update({ where: { id }, data: { status: 'SIGNED' } });
      return signature;
    });
  }

  publicDocument(validationCode: string) {
    return prisma.generatedDocument.findUnique({
      where: { validationCode },
      select: { id: true, status: true, contentHash: true, generatedAt: true, signatures: { select: { signerName: true, role: true, signedAt: true } } },
    });
  }

  receivables(organizationId: string, clinicId?: string) {
    return prisma.receivable.findMany({
      where: { organizationId, clinicId },
      include: {
        payments: { include: { refunds: true } },
        treatment: { select: { id: true, title: true, status: true, total: true } },
      },
      orderBy: { dueDate: 'asc' },
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
    const receivable = await prisma.receivable.findFirst({ where: { id: receivableId, organizationId }, include: { payments: true } });
    if (!receivable) throw new NotFoundException('Recebível não encontrado.');
    const amount = money(input.amount);
    return prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: { receivableId, amount, method: input.method, provider: input.provider, idempotencyKey: input.idempotencyKey, status: 'CONFIRMED', paidAt: new Date() },
      });
      const paid = receivable.payments.reduce((sum, item) => item.status === 'CONFIRMED' ? sum.add(item.amount) : sum, amount);
      await tx.receivable.update({ where: { id: receivableId }, data: { status: paid.greaterThanOrEqualTo(receivable.netAmount) ? 'PAID' : 'PARTIALLY_PAID' } });
      await tx.outboxEvent.create({ data: { aggregateType: 'Payment', aggregateId: payment.id, eventType: 'payment.confirmed', payload: { paymentId: payment.id, receivableId } } });
      return payment;
    });
  }

  async refund(organizationId: string, paymentId: string, actorId: string, input: { amount: string; reason: string }) {
    const payment = await prisma.payment.findFirst({ where: { id: paymentId, receivable: { organizationId } } });
    if (!payment) throw new NotFoundException('Pagamento não encontrado.');
    const amount = money(input.amount);
    if (amount.greaterThan(payment.amount)) throw new ConflictException('Estorno supera o pagamento.');
    return prisma.$transaction(async (tx) => {
      const refund = await tx.refund.create({ data: { paymentId, amount, reason: input.reason, authorizedById: actorId } });
      await tx.payment.update({ where: { id: paymentId }, data: { status: 'REFUNDED' } });
      await tx.outboxEvent.create({ data: { aggregateType: 'Payment', aggregateId: paymentId, eventType: 'payment.refunded', payload: { paymentId, refundId: refund.id } } });
      return refund;
    });
  }

  commissionRules(organizationId: string) {
    return prisma.commissionRule.findMany({ where: { organizationId, active: true }, orderBy: { priority: 'desc' } });
  }

  createCommissionRule(organizationId: string, input: {
    clinicId?: string; professionalId?: string; procedureId?: string; specialty?: string;
    basis: string; calculationType: string; value: string; validFrom: string; priority?: number;
  }) {
    return prisma.commissionRule.create({ data: { organizationId, ...input, value: money(input.value), validFrom: new Date(`${input.validFrom}T00:00:00Z`) } });
  }

  deliveries(organizationId: string) {
    return prisma.messageDelivery.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 200 });
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
      prisma.commissionEntry.findMany({
        where: { organizationId, ...clinicWhere, competence: dateRange },
        select: { status: true, baseAmount: true, amount: true, professionalId: true },
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
      prisma.payment.aggregate({
        where: { status: 'CONFIRMED', paidAt: dateRange, receivable: { organizationId, ...clinicWhere } },
        _sum: { amount: true }, _count: true,
      }),
    ]);
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
      baseAmount: item.baseAmount,
      amount: item.amount,
      percentage: item.baseAmount.isZero() ? 0 : Number(item.amount.div(item.baseAmount).mul(100).toFixed(2)),
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
      financial: { byStatus: financial, received: payments._sum.amount ?? 0, payments: payments._count },
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
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createPrescription(organizationId: string, input: {
    clinicId: string; patientId: string; professionalId: string; purpose: string; items: unknown[];
  }) {
    const [clinic, patient, professional] = await Promise.all([
      prisma.clinic.findFirst({ where: { id: input.clinicId, organizationId }, select: { id: true } }),
      prisma.patient.findFirst({ where: { id: input.patientId, organizationId }, select: { id: true } }),
      prisma.professional.findFirst({ where: { id: input.professionalId, user: { organizationId } }, select: { id: true } }),
    ]);
    if (!clinic || !patient || !professional) throw new NotFoundException('Clínica, paciente ou profissional inválido.');
    if (!input.items.length) throw new ConflictException('Informe ao menos um item da receita.');
    return prisma.prescription.create({
      data: {
        organizationId,
        clinicId: input.clinicId,
        patientId: input.patientId,
        professionalId: input.professionalId,
        purpose: input.purpose.trim(),
        items: json(input.items),
        status: 'DRAFT',
      },
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
    supplierName?: string; notes?: string;
  }) {
    const clinic = await prisma.clinic.findFirst({ where: { id: input.clinicId, organizationId } });
    if (!clinic) throw new NotFoundException('Clínica não encontrada.');
    return prisma.payable.create({
      data: {
        organizationId,
        clinicId: input.clinicId,
        description: input.description,
        originalAmount: money(input.originalAmount),
        dueDate: new Date(input.dueDate),
        supplierName: input.supplierName,
        notes: input.notes,
      },
    });
  }

  async payPayable(organizationId: string, id: string, input: { amount: string; method: string; notes?: string }) {
    const payable = await prisma.payable.findFirst({ where: { id, organizationId } });
    if (!payable) throw new NotFoundException('Conta a pagar não encontrada.');
    if (payable.status === 'CANCELLED' || payable.status === 'PAID') {
      throw new ConflictException('Título não aceita pagamento.');
    }
    const amount = money(input.amount);
    return prisma.$transaction(async (tx) => {
      await tx.payablePayment.create({
        data: { payableId: id, amount, method: input.method, notes: input.notes },
      });
      const paidAmount = payable.paidAmount.add(amount);
      const status = paidAmount.gte(payable.originalAmount) ? 'PAID' : 'PARTIALLY_PAID';
      return tx.payable.update({
        where: { id },
        data: { paidAmount, status },
        include: { payments: true },
      });
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

  cashflow(organizationId: string, clinicId: string | undefined, from?: string, to?: string) {
    const periodFrom = from ? new Date(from) : new Date(Date.now() - 30 * 86400_000);
    const periodTo = to ? new Date(to) : new Date();
    return Promise.all([
      prisma.payment.aggregate({
        where: {
          status: 'CONFIRMED',
          paidAt: { gte: periodFrom, lte: periodTo },
          receivable: { organizationId, ...(clinicId ? { clinicId } : {}) },
        },
        _sum: { amount: true },
      }),
      prisma.payablePayment.aggregate({
        where: {
          paidAt: { gte: periodFrom, lte: periodTo },
          payable: { organizationId, ...(clinicId ? { clinicId } : {}) },
        },
        _sum: { amount: true },
      }),
    ]).then(([inflow, outflow]) => {
      const inAmount = Number(inflow._sum.amount ?? 0);
      const outAmount = Number(outflow._sum.amount ?? 0);
      return {
        from: periodFrom,
        to: periodTo,
        inflow: inAmount,
        outflow: outAmount,
        net: inAmount - outAmount,
      };
    });
  }
}
