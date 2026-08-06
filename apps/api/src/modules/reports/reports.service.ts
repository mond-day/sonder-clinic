import { Injectable } from '@nestjs/common';
import { prisma } from '@sonder/database';
import { buildReportPdf } from '../../common/pdf';

export const REPORT_CATALOG = [
  { id: 'appointments', name: 'Agendamentos', domain: 'clinical', permission: 'report.view_clinical' },
  { id: 'no-shows', name: 'Faltas e cancelamentos', domain: 'clinical', permission: 'report.view_clinical' },
  { id: 'new-patients', name: 'Novos pacientes', domain: 'clinical', permission: 'report.view_clinical' },
  { id: 'production-professional', name: 'Produção por profissional', domain: 'clinical', permission: 'report.view_clinical' },
  { id: 'production-procedure', name: 'Produção por procedimento', domain: 'clinical', permission: 'report.view_clinical' },
  { id: 'treatment-plans', name: 'Planos de tratamento', domain: 'clinical', permission: 'report.view_clinical' },
  { id: 'budget-conversion', name: 'Conversão de orçamentos', domain: 'management', permission: 'report.view_management' },
  { id: 'receivables', name: 'Contas a receber', domain: 'financial', permission: 'report.view_financial' },
  { id: 'delinquency', name: 'Inadimplência', domain: 'financial', permission: 'report.view_financial' },
  { id: 'revenues', name: 'Receitas', domain: 'financial', permission: 'report.view_financial' },
  { id: 'expenses', name: 'Despesas', domain: 'financial', permission: 'report.view_financial' },
  { id: 'cashflow', name: 'Fluxo de caixa', domain: 'financial', permission: 'report.view_financial' },
  { id: 'laboratories', name: 'Laboratórios', domain: 'management', permission: 'report.view_management' },
  { id: 'documents', name: 'Documentos', domain: 'clinical', permission: 'report.view_clinical' },
  { id: 'clinical-entries', name: 'Evoluções clínicas', domain: 'clinical', permission: 'report.view_clinical' },
] as const;

type Period = { from: Date; to: Date };

function parsePeriod(from?: string, to?: string): Period {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 30 * 86400_000);
  return { from: start, to: end };
}

function toCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return 'sem_dados\n';
  const headers = Object.keys(rows[0]!);
  const escape = (value: unknown) => {
    const text = value == null ? '' : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
  ].join('\n');
}

@Injectable()
export class ReportsService {
  catalog() {
    return REPORT_CATALOG;
  }

  async run(organizationId: string, reportId: string, query: {
    clinicId?: string; from?: string; to?: string; format?: 'json' | 'csv' | 'xlsx' | 'pdf';
  }) {
    const period = parsePeriod(query.from, query.to);
    const clinicFilter = query.clinicId ? { clinicId: query.clinicId } : {};
    let rows: Array<Record<string, unknown>> = [];
    let meta: Record<string, unknown> = { reportId, period };

    switch (reportId) {
      case 'appointments': {
        const data = await prisma.appointment.findMany({
          where: {
            organizationId,
            ...clinicFilter,
            startAt: { gte: period.from, lte: period.to },
          },
          select: {
            id: true, startAt: true, endAt: true, status: true, category: true, source: true,
            patient: { select: { fullName: true } },
            professional: { select: { name: true } },
          },
          orderBy: { startAt: 'asc' },
        });
        rows = data.map((item) => ({
          id: item.id,
          startAt: item.startAt.toISOString(),
          status: item.status,
          category: item.category,
          patient: item.patient.fullName,
          professional: item.professional.name,
        }));
        break;
      }
      case 'no-shows': {
        const data = await prisma.appointment.findMany({
          where: {
            organizationId,
            ...clinicFilter,
            status: { in: ['NO_SHOW', 'CANCELLED'] },
            startAt: { gte: period.from, lte: period.to },
          },
          select: {
            id: true, startAt: true, status: true,
            patient: { select: { fullName: true } },
            statusEvents: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        });
        rows = data.map((item) => ({
          id: item.id,
          startAt: item.startAt.toISOString(),
          status: item.status,
          patient: item.patient.fullName,
          reason: item.statusEvents[0]?.reasonText ?? null,
        }));
        break;
      }
      case 'new-patients': {
        const data = await prisma.patient.findMany({
          where: { organizationId, createdAt: { gte: period.from, lte: period.to } },
          select: { id: true, fullName: true, primaryPhone: true, createdAt: true, status: true },
          orderBy: { createdAt: 'desc' },
        });
        rows = data.map((item) => ({
          id: item.id,
          name: item.fullName,
          phone: item.primaryPhone,
          createdAt: item.createdAt.toISOString(),
          status: item.status,
        }));
        break;
      }
      case 'production-professional': {
        const data = await prisma.treatmentSession.groupBy({
          by: ['professionalId'],
          where: {
            item: { plan: { organizationId, ...clinicFilter } },
            completedAt: { gte: period.from, lte: period.to },
          },
          _count: { _all: true },
        });
        const pros = await prisma.professional.findMany({
          where: { id: { in: data.map((item) => item.professionalId) } },
          select: { id: true, name: true },
        });
        const map = new Map(pros.map((item) => [item.id, item.name]));
        rows = data.map((item) => ({
          professionalId: item.professionalId,
          professional: map.get(item.professionalId) ?? item.professionalId,
          sessions: item._count._all,
        }));
        break;
      }
      case 'production-procedure': {
        const items = await prisma.treatmentItem.findMany({
          where: {
            plan: { organizationId, ...clinicFilter, updatedAt: { gte: period.from, lte: period.to } },
            status: { in: ['APPROVED', 'IN_PROGRESS', 'COMPLETED'] },
          },
          include: { procedure: { select: { name: true, internalCode: true } } },
        });
        const grouped = new Map<string, { procedure: string; quantity: number; total: number }>();
        for (const item of items) {
          const key = item.procedureId;
          const current = grouped.get(key) ?? {
            procedure: item.procedure.name,
            quantity: 0,
            total: 0,
          };
          current.quantity += item.quantity;
          current.total += Number(item.total);
          grouped.set(key, current);
        }
        rows = [...grouped.entries()].map(([procedureId, value]) => ({ procedureId, ...value }));
        break;
      }
      case 'treatment-plans': {
        const data = await prisma.treatmentPlan.findMany({
          where: {
            organizationId,
            ...clinicFilter,
            createdAt: { gte: period.from, lte: period.to },
          },
          select: {
            id: true, title: true, status: true, total: true, createdAt: true, patientId: true,
          },
        });
        const patients = await prisma.patient.findMany({
          where: { id: { in: data.map((item) => item.patientId) } },
          select: { id: true, fullName: true },
        });
        const patientMap = new Map(patients.map((item) => [item.id, item.fullName]));
        rows = data.map((item) => ({
          id: item.id,
          title: item.title,
          status: item.status,
          total: Number(item.total),
          patient: patientMap.get(item.patientId) ?? item.patientId,
          createdAt: item.createdAt.toISOString(),
        }));
        break;
      }
      case 'budget-conversion': {
        const plans = await prisma.treatmentPlan.groupBy({
          by: ['status'],
          where: { organizationId, ...clinicFilter, createdAt: { gte: period.from, lte: period.to } },
          _count: { _all: true },
          _sum: { total: true },
        });
        rows = plans.map((item) => ({
          status: item.status,
          count: item._count._all,
          total: Number(item._sum.total ?? 0),
        }));
        const presented = plans.filter((p) => ['PRESENTED', 'PARTIALLY_APPROVED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED'].includes(p.status))
          .reduce((acc, p) => acc + p._count._all, 0);
        const approved = plans.filter((p) => ['PARTIALLY_APPROVED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED'].includes(p.status))
          .reduce((acc, p) => acc + p._count._all, 0);
        meta = { ...meta, conversionRate: presented ? approved / presented : 0 };
        break;
      }
      case 'receivables': {
        const data = await prisma.receivable.findMany({
          where: { organizationId, ...clinicFilter, dueDate: { gte: period.from, lte: period.to } },
          select: {
            id: true, description: true, netAmount: true, dueDate: true, status: true, patientId: true,
          },
        });
        const patients = await prisma.patient.findMany({
          where: { id: { in: [...new Set(data.map((item) => item.patientId))] } },
          select: { id: true, fullName: true },
        });
        const patientMap = new Map(patients.map((item) => [item.id, item.fullName]));
        rows = data.map((item) => ({
          id: item.id,
          description: item.description,
          amount: Number(item.netAmount),
          dueDate: item.dueDate.toISOString().slice(0, 10),
          status: item.status,
          patient: patientMap.get(item.patientId) ?? item.patientId,
        }));
        break;
      }
      case 'delinquency': {
        const data = await prisma.receivable.findMany({
          where: {
            organizationId,
            ...clinicFilter,
            status: { in: ['OPEN', 'PARTIALLY_PAID', 'OVERDUE'] },
            dueDate: { lt: new Date() },
          },
          select: {
            id: true, description: true, netAmount: true, dueDate: true, status: true, patientId: true,
            payments: { where: { status: 'CONFIRMED' }, select: { amount: true } },
          },
        });
        const patients = await prisma.patient.findMany({
          where: { id: { in: [...new Set(data.map((item) => item.patientId))] } },
          select: { id: true, fullName: true },
        });
        const patientMap = new Map(patients.map((item) => [item.id, item.fullName]));
        rows = data.map((item) => {
          const paid = item.payments.reduce((acc, payment) => acc + Number(payment.amount), 0);
          return {
            id: item.id,
            patient: patientMap.get(item.patientId) ?? item.patientId,
            description: item.description,
            balance: Number(item.netAmount) - paid,
            dueDate: item.dueDate.toISOString().slice(0, 10),
            status: item.status,
          };
        });
        break;
      }
      case 'revenues': {
        const data = await prisma.payment.findMany({
          where: {
            status: 'CONFIRMED',
            paidAt: { gte: period.from, lte: period.to },
            receivable: { organizationId, ...clinicFilter },
          },
          select: {
            id: true, amount: true, method: true, paidAt: true,
            receivable: { select: { description: true, patientId: true } },
          },
        });
        const patients = await prisma.patient.findMany({
          where: { id: { in: [...new Set(data.map((item) => item.receivable.patientId))] } },
          select: { id: true, fullName: true },
        });
        const patientMap = new Map(patients.map((item) => [item.id, item.fullName]));
        rows = data.map((item) => ({
          id: item.id,
          amount: Number(item.amount),
          method: item.method,
          paidAt: item.paidAt?.toISOString() ?? null,
          description: item.receivable.description,
          patient: patientMap.get(item.receivable.patientId) ?? item.receivable.patientId,
        }));
        break;
      }
      case 'expenses': {
        const expenses = await prisma.expense.findMany({
          where: { organizationId, ...clinicFilter, dueDate: { gte: period.from, lte: period.to } },
        });
        const payables = await prisma.payable.findMany({
          where: { organizationId, ...clinicFilter, dueDate: { gte: period.from, lte: period.to } },
        });
        rows = [
          ...expenses.map((item) => ({
            source: 'expense',
            description: item.description,
            amount: Number(item.amount),
            dueDate: item.dueDate.toISOString().slice(0, 10),
            paidAt: item.paidAt?.toISOString() ?? null,
          })),
          ...payables.map((item) => ({
            source: 'payable',
            description: item.description,
            amount: Number(item.originalAmount),
            dueDate: item.dueDate.toISOString().slice(0, 10),
            status: item.status,
          })),
        ];
        break;
      }
      case 'cashflow': {
        const payments = await prisma.payment.aggregate({
          where: {
            status: 'CONFIRMED',
            paidAt: { gte: period.from, lte: period.to },
            receivable: { organizationId, ...clinicFilter },
          },
          _sum: { amount: true },
        });
        const payablePayments = await prisma.payablePayment.aggregate({
          where: {
            paidAt: { gte: period.from, lte: period.to },
            payable: { organizationId, ...clinicFilter },
          },
          _sum: { amount: true },
        });
        const inflow = Number(payments._sum.amount ?? 0);
        const outflow = Number(payablePayments._sum.amount ?? 0);
        rows = [
          { kind: 'inflow', amount: inflow },
          { kind: 'outflow', amount: outflow },
          { kind: 'net', amount: inflow - outflow },
        ];
        break;
      }
      case 'laboratories': {
        const data = await prisma.labCase.findMany({
          where: {
            organizationId,
            ...clinicFilter,
            createdAt: { gte: period.from, lte: period.to },
          },
          select: {
            code: true, description: true, status: true, detailedStage: true, laboratoryName: true, dueAt: true, patientId: true,
          },
        });
        const patients = await prisma.patient.findMany({
          where: { id: { in: [...new Set(data.map((item) => item.patientId))] } },
          select: { id: true, fullName: true },
        });
        const patientMap = new Map(patients.map((item) => [item.id, item.fullName]));
        rows = data.map((item) => ({
          code: item.code,
          description: item.description,
          status: item.status,
          stage: item.detailedStage,
          laboratory: item.laboratoryName,
          patient: patientMap.get(item.patientId) ?? item.patientId,
          dueAt: item.dueAt?.toISOString() ?? null,
        }));
        break;
      }
      case 'documents': {
        const data = await prisma.generatedDocument.findMany({
          where: {
            organizationId,
            ...clinicFilter,
            generatedAt: { gte: period.from, lte: period.to },
          },
          select: {
            id: true, status: true, generatedAt: true, patientId: true,
            template: { select: { name: true, type: true } },
          },
        });
        const patients = await prisma.patient.findMany({
          where: { id: { in: [...new Set(data.map((item) => item.patientId))] } },
          select: { id: true, fullName: true },
        });
        const patientMap = new Map(patients.map((item) => [item.id, item.fullName]));
        rows = data.map((item) => ({
          id: item.id,
          template: item.template.name,
          type: item.template.type,
          status: item.status,
          patient: patientMap.get(item.patientId) ?? item.patientId,
          createdAt: item.generatedAt.toISOString(),
        }));
        break;
      }
      case 'clinical-entries': {
        const data = await prisma.clinicalEntry.findMany({
          where: {
            record: { organizationId, ...clinicFilter },
            clinicalDate: { gte: period.from, lte: period.to },
          },
          select: {
            id: true, type: true, status: true, clinicalDate: true, toothFdi: true,
            record: { select: { patientId: true } },
          },
        });
        rows = data.map((item) => ({
          id: item.id,
          type: item.type,
          status: item.status,
          clinicalDate: item.clinicalDate.toISOString(),
          toothFdi: item.toothFdi,
          patientId: item.record.patientId,
        }));
        break;
      }
      default:
        rows = [];
    }

    const format = query.format ?? 'json';
    if (format === 'csv' || format === 'xlsx') {
      // XLSX textual compatível (CSV) — sem simular sucesso de biblioteca ausente.
      return {
        format: format === 'xlsx' ? 'csv' : 'csv',
        filename: `${reportId}-${period.from.toISOString().slice(0, 10)}.csv`,
        contentType: 'text/csv; charset=utf-8',
        content: toCsv(rows),
        meta,
      };
    }
    if (format === 'pdf') {
      const catalogItem = REPORT_CATALOG.find((item) => item.id === reportId);
      const pdf = await buildReportPdf({
        title: catalogItem?.name ?? reportId,
        subtitle: 'Sonder Clinic · exportação gráfica',
        meta: [
          ['Relatório', reportId],
          ['Período', `${period.from.toISOString().slice(0, 10)} — ${period.to.toISOString().slice(0, 10)}`],
          ['Registros', String(rows.length)],
        ],
        rows,
        footerNote: 'Gerado automaticamente. Layout tabular A4 para impressão e arquivo.',
      });
      return {
        format: 'pdf',
        filename: `${reportId}.pdf`,
        contentType: 'application/pdf',
        content: pdf,
        meta,
      };
    }
    return { format: 'json', meta, rows, total: rows.length };
  }
}
