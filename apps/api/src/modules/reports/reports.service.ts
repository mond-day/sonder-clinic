import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@sonder/database';
import ExcelJS from 'exceljs';
import { buildReportPdf } from '../../common/pdf';
import {
  buildReceivableFinanceView,
  confirmedNetPaid,
  money,
  netPaidAmount,
  netPayablePaid,
  refundedTotal,
} from '../operations/operations-finance.utils';

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
  if (from && Number.isNaN(Date.parse(from))) throw new BadRequestException('Data inicial inválida.');
  if (to && Number.isNaN(Date.parse(to))) throw new BadRequestException('Data final inválida.');
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 30 * 86400_000);
  if (start > end) throw new BadRequestException('Período inválido: data inicial após a final.');
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

async function toXlsx(rows: Array<Record<string, unknown>>, sheetName: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sonder Clinic';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31) || 'Relatório');
  if (!rows.length) {
    sheet.addRow(['sem_dados']);
  } else {
    const headers = Object.keys(rows[0]!);
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };
    for (const row of rows) {
      sheet.addRow(headers.map((header) => {
        const value = row[header];
        if (value == null) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return value as ExcelJS.CellValue;
      }));
    }
    sheet.columns.forEach((column) => {
      let max = 10;
      column.eachCell?.({ includeEmpty: true }, (cell) => {
        max = Math.max(max, String(cell.value ?? '').length);
      });
      column.width = Math.min(max + 2, 48);
    });
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

@Injectable()
export class ReportsService {
  catalog() {
    return REPORT_CATALOG;
  }

  async run(organizationId: string, reportId: string, query: {
    clinicId?: string; from?: string; to?: string; format?: 'json' | 'csv' | 'xlsx' | 'pdf';
  }) {
    if (!REPORT_CATALOG.some((item) => item.id === reportId)) {
      throw new NotFoundException('Relatório não encontrado.');
    }
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
          include: { payments: { include: { refunds: true } } },
        });
        const patients = await prisma.patient.findMany({
          where: { id: { in: [...new Set(data.map((item) => item.patientId))] } },
          select: { id: true, fullName: true },
        });
        const patientMap = new Map(patients.map((item) => [item.id, item.fullName]));
        rows = data.map((item) => {
          const finance = buildReceivableFinanceView(item);
          return {
            id: item.id,
            description: item.description,
            netAmount: Number(item.netAmount),
            paidAmount: Number(finance.paidAmount),
            refundedAmount: Number(finance.refundedAmount),
            outstandingAmount: Number(finance.outstandingAmount),
            amount: Number(finance.outstandingAmount),
            dueDate: item.dueDate.toISOString().slice(0, 10),
            status: finance.effectiveStatus,
            patient: patientMap.get(item.patientId) ?? item.patientId,
          };
        });
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
          include: {
            payments: {
              where: { status: { in: ['CONFIRMED', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
              include: { refunds: true },
            },
          },
        });
        const patients = await prisma.patient.findMany({
          where: { id: { in: [...new Set(data.map((item) => item.patientId))] } },
          select: { id: true, fullName: true },
        });
        const patientMap = new Map(patients.map((item) => [item.id, item.fullName]));
        rows = data
          .map((item) => {
            const finance = buildReceivableFinanceView(item);
            return {
              id: item.id,
              patient: patientMap.get(item.patientId) ?? item.patientId,
              description: item.description,
              balance: Number(finance.outstandingAmount),
              paidAmount: Number(finance.paidAmount),
              outstandingAmount: Number(finance.outstandingAmount),
              dueDate: item.dueDate.toISOString().slice(0, 10),
              status: finance.effectiveStatus,
            };
          })
          .filter((item) => item.outstandingAmount > 0);
        break;
      }
      case 'revenues': {
        const data = await prisma.payment.findMany({
          where: {
            status: { in: ['CONFIRMED', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
            paidAt: { gte: period.from, lte: period.to },
            receivable: { organizationId, ...clinicFilter },
          },
          select: {
            id: true, amount: true, method: true, paidAt: true, status: true,
            refunds: true,
            receivable: { select: { description: true, patientId: true } },
          },
        });
        const patients = await prisma.patient.findMany({
          where: { id: { in: [...new Set(data.map((item) => item.receivable.patientId))] } },
          select: { id: true, fullName: true },
        });
        const patientMap = new Map(patients.map((item) => [item.id, item.fullName]));
        rows = data.map((item) => {
          const refunded = Number(refundedTotal(item));
          const net = Number(netPaidAmount(item));
          return {
            id: item.id,
            originalAmount: Number(item.amount),
            refundedAmount: refunded,
            amount: net,
            netAmount: net,
            status: item.status,
            method: item.method,
            paidAt: item.paidAt?.toISOString() ?? null,
            description: item.receivable.description,
            patient: patientMap.get(item.receivable.patientId) ?? item.receivable.patientId,
          };
        });
        break;
      }
      case 'expenses': {
        const expenses = await prisma.expense.findMany({
          where: { organizationId, ...clinicFilter, dueDate: { gte: period.from, lte: period.to } },
        });
        const payables = await prisma.payable.findMany({
          where: { organizationId, ...clinicFilter, dueDate: { gte: period.from, lte: period.to } },
          include: { payments: true },
        });
        rows = [
          ...expenses.map((item) => ({
            source: 'expense',
            description: item.description,
            amount: Number(item.amount),
            dueDate: item.dueDate.toISOString().slice(0, 10),
            paidAt: item.paidAt?.toISOString() ?? null,
          })),
          ...payables.map((item) => {
            const paidNet = item.payments.reduce(
              (sum, payment) => sum.add(netPayablePaid(payment)),
              money('0'),
            );
            return {
              source: 'payable',
              description: item.description,
              amount: Number(item.originalAmount),
              paidAmount: Number(paidNet),
              outstandingAmount: Math.max(0, Number(item.originalAmount) - Number(paidNet)),
              dueDate: item.dueDate.toISOString().slice(0, 10),
              status: item.status,
            };
          }),
        ];
        break;
      }
      case 'cashflow': {
        const payments = await prisma.payment.findMany({
          where: {
            status: { in: ['CONFIRMED', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
            paidAt: { gte: period.from, lte: period.to },
            receivable: { organizationId, ...clinicFilter },
          },
          include: { refunds: true },
        });
        const payablePayments = await prisma.payablePayment.findMany({
          where: {
            status: { in: ['CONFIRMED', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
            paidAt: { gte: period.from, lte: period.to },
            payable: { organizationId, ...clinicFilter },
          },
        });
        const inflow = Number(confirmedNetPaid(payments));
        const outflow = Number(
          payablePayments.reduce((sum, payment) => sum.add(netPayablePaid(payment)), money('0')),
        );
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
        throw new NotFoundException('Relatório não encontrado.');
    }

    const format = query.format ?? 'json';
    if (format === 'csv') {
      return {
        format: 'csv',
        filename: `${reportId}-${period.from.toISOString().slice(0, 10)}.csv`,
        contentType: 'text/csv; charset=utf-8',
        content: toCsv(rows),
        meta,
      };
    }
    if (format === 'xlsx') {
      const content = await toXlsx(rows, reportId);
      return {
        format: 'xlsx',
        filename: `${reportId}-${period.from.toISOString().slice(0, 10)}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        content,
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
