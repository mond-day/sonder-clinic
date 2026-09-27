import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { loadImportedKeys, loadPatientIndex, loadProfessionals, type PatientIndex } from '../import-lookups';
import { parsedRow, PlanBuilder } from '../import-plan';
import type { ImportContext, ImportDefinition, ImportPlan, ParsedRow, SheetRow } from '../import-types';
import {
  cellText,
  formatDay,
  normalizeName,
  normalizePhone,
  optionalText,
  parseDateTime,
  parseMoney,
  zonedToUtc,
} from '../import-values';

export const PLAN_COLUMNS = {
  createdAt: 'Data de Criação',
  code: 'Código',
  patient: 'Paciente',
  mobile: 'Celular',
  description: 'Descrição',
  approvedAt: 'Aprovado em',
  status: 'Status',
  total: 'Valor Total',
} as const;

const STATUS_MAP: Record<string, 'APPROVED' | 'PRESENTED'> = { aprovado: 'APPROVED', pendente: 'PRESENTED' };
const TITLE_MAX = 120;

const planRowSchema = z.object({
  code: z.string().min(1, 'Código do orçamento ausente.').max(60),
  patientName: z.string().min(3, 'Paciente ausente.').max(200),
  phone: z.string().optional(),
  description: z.string().max(5000).optional(),
  status: z.enum(['APPROVED', 'PRESENTED']),
  createdAt: z.date({ required_error: 'Data de criação ausente ou inválida.' }),
  approvedAtLabel: z.string().optional(),
  total: z.string({ required_error: 'Valor total ausente ou inválido.' }),
});

export type PlanRow = z.infer<typeof planRowSchema>;
export type PlanPlanned = PlanRow & { patientId: string; professionalId: string; title: string; notes: string };

export function parsePlanRow(row: SheetRow, ctx: Pick<ImportContext, 'timezone'>): ParsedRow<PlanRow> {
  const cells = row.cells;
  const errors: string[] = [];
  const statusText = cellText(cells[PLAN_COLUMNS.status]);
  const status = STATUS_MAP[normalizeName(statusText)];
  if (!status) errors.push(statusText ? `Status “${statusText}” não reconhecido (use Aprovado ou Pendente).` : 'Status ausente.');
  const created = parseDateTime(cells[PLAN_COLUMNS.createdAt]);
  const approved = parseDateTime(cells[PLAN_COLUMNS.approvedAt]);
  return parsedRow(row.rowNumber, planRowSchema, {
    code: cellText(cells[PLAN_COLUMNS.code]),
    patientName: cellText(cells[PLAN_COLUMNS.patient]),
    phone: normalizePhone(cells[PLAN_COLUMNS.mobile]) ?? undefined,
    description: optionalText(cells[PLAN_COLUMNS.description]),
    status: status ?? 'PRESENTED',
    createdAt: created ? zonedToUtc(created, ctx.timezone) : undefined,
    approvedAtLabel: approved ? formatDay(approved) : undefined,
    total: parseMoney(cells[PLAN_COLUMNS.total]) ?? undefined,
  }, errors, []);
}

function planText(row: PlanRow): { title: string; notes: string } {
  const description = row.description?.trim();
  const title = description
    ? (description.length > TITLE_MAX ? `${description.slice(0, TITLE_MAX - 1)}…` : description)
    : `Orçamento ${row.code}`;
  const notes = [
    `Importado de planilha (orçamento ${row.code}).`,
    row.approvedAtLabel ? `Aprovado em ${row.approvedAtLabel}.` : null,
    description && description.length > TITLE_MAX ? `Descrição completa: ${description}` : null,
  ].filter(Boolean).join('\n');
  return { title, notes };
}

export const planNaturalKey = (row: PlanRow) => `code:${row.code}`;

export function planTreatmentPlans(
  rows: ParsedRow<PlanRow>[],
  input: { professionalId: string | null; professionalError?: string; patients: PatientIndex; alreadyImported: Set<string> },
): ImportPlan<PlanPlanned> {
  const builder = new PlanBuilder<PlanPlanned>(rows);
  if (!input.professionalId) builder.blocking(input.professionalError ?? 'Selecione o profissional responsável pelos orçamentos.');
  const seen = new Map<string, number>();
  for (const { rowNumber, data, warnings } of PlanBuilder.valid(rows)) {
    const key = planNaturalKey(data);
    const firstLine = seen.get(key);
    if (firstLine) {
      builder.error(rowNumber, `Código de orçamento repetido na planilha (linha ${firstLine}).`);
      continue;
    }
    seen.set(key, rowNumber);
    if (input.alreadyImported.has(key)) {
      builder.skip(rowNumber, 'Já importado em lote anterior.');
      continue;
    }
    const patient = input.patients.resolve({ name: data.patientName, phone: data.phone });
    if (!patient.ok) {
      builder.error(rowNumber, patient.error, warnings);
      continue;
    }
    builder.create(rowNumber, key, {
      ...data,
      ...planText(data),
      patientId: patient.value.id,
      professionalId: input.professionalId ?? '',
    }, warnings);
  }
  builder.sample((item, rowNumber) => ({
    Linha: String(rowNumber),
    Código: item.code,
    Paciente: item.patientName,
    Título: item.title,
    Status: item.status === 'APPROVED' ? 'Aprovado' : 'Apresentado',
    Total: `R$ ${item.total.replace('.', ',')}`,
  }));
  return builder.build();
}

export const treatmentPlansImport: ImportDefinition<PlanRow, PlanPlanned> = {
  kind: 'TREATMENT_PLANS',
  label: 'Orçamentos',
  permission: 'treatment.create',
  rowEntity: 'TreatmentPlan',
  requiredColumns: [PLAN_COLUMNS.code, PLAN_COLUMNS.patient, PLAN_COLUMNS.status, PLAN_COLUMNS.total, PLAN_COLUMNS.createdAt],
  optionalColumns: Object.values(PLAN_COLUMNS),
  parseRow: parsePlanRow,
  async plan(db, ctx, rows) {
    const keys = PlanBuilder.valid(rows).map((row) => planNaturalKey(row.data));
    const [patients, imported, professionals] = await Promise.all([
      loadPatientIndex(db, ctx.organizationId),
      loadImportedKeys(db, ctx.organizationId, 'TreatmentPlan', keys),
      loadProfessionals(db, ctx.organizationId, ctx.clinicId),
    ]);
    const chosen = professionals.find((item) => item.id === ctx.options.professionalId);
    const professionalError = !ctx.options.professionalId
      ? 'Selecione o profissional responsável pelos orçamentos (a planilha não tem essa coluna).'
      : !chosen?.linkedToClinic ? 'Profissional selecionado não está ativo nesta clínica.' : undefined;
    const plan = planTreatmentPlans(rows, {
      professionalId: professionalError ? null : chosen!.id,
      professionalError,
      patients,
      alreadyImported: imported,
    });
    if (chosen && !professionalError) plan.mappings.push({ label: 'Profissional de todos os orçamentos', from: '—', to: chosen.name });
    return plan;
  },
  async write(tx, ctx, plan) {
    const plans = plan.items.map((item) => ({ id: randomUUID(), ...item }));
    await tx.treatmentPlan.createMany({
      data: plans.map(({ id, data }) => ({
        id,
        organizationId: ctx.organizationId,
        clinicId: ctx.clinicId,
        patientId: data.patientId,
        professionalId: data.professionalId,
        status: data.status,
        title: data.title,
        presentedAt: data.createdAt,
        presentedVersion: 1,
        subtotal: data.total,
        total: data.total,
        notes: data.notes,
        priceSnapshot: { source: 'IMPORT', code: data.code },
        createdAt: data.createdAt,
      })),
    });
    await tx.treatmentPlanEvent.createMany({
      data: plans.map(({ id, data }) => ({
        treatmentPlanId: id,
        type: 'IMPORTED',
        actorId: ctx.actorId,
        payload: { batchId: ctx.batchId, code: data.code, status: data.status },
      })),
    });
    return plans.map(({ id, naturalKey }) => ({ entity: 'TreatmentPlan' as const, entityId: id, naturalKey }));
  },
};
