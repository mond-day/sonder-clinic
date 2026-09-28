import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '@sonder/database';
import { z } from 'zod';
import {
  loadImportedKeys,
  loadNamedCatalog,
  loadPatientIndex,
  loadProceduresByCode,
  loadProfessionals,
  ProfessionalResolver,
  type PatientIndex,
} from '../import-lookups';
import { parsedRow, PlanBuilder } from '../import-plan';
import { isNonTreatment, PROCEDURE_ALIAS_CODES, procedureAliasCode } from '../procedure-aliases';
import type { ImportContext, ImportDefinition, ImportPlan, ParsedRow, SheetRow, WrittenRecord } from '../import-types';
import {
  cellText,
  civilToUtc,
  formatDay,
  hashKey,
  isoDay,
  normalizeName,
  normalizePhone,
  optionalText,
  parseDateTime,
  parseMoney,
  sumMoney,
  withOccurrence,
  type DateParts,
} from '../import-values';

export const TREATMENT_COLUMNS = {
  createdAt: 'Criado em',
  patient: 'Paciente',
  phone: 'Telefone',
  procedure: 'Tratamento',
  category: 'Categoria',
  professional: 'Profissional',
  status: 'Status',
  completedAt: 'Finalizado em',
  value: 'Valor',
} as const;

const STATUS_MAP: Record<string, 'COMPLETED' | 'APPROVED'> = { finalizado: 'COMPLETED', 'em aberto': 'APPROVED' };
export const IMPORTED_PLAN_TITLE = 'Tratamentos importados';
const SESSION_NOTE = 'Execução importada de planilha (histórico).';

const treatmentRowSchema = z.object({
  createdAt: z.date({ required_error: 'Data “Criado em” ausente ou inválida.' }),
  createdDay: z.custom<DateParts>(),
  patientName: z.string().min(3, 'Paciente ausente.').max(200),
  phone: z.string().optional(),
  procedureName: z.string().min(2, 'Tratamento ausente.').max(160, 'Nome do tratamento com mais de 160 caracteres.'),
  category: z.string().max(120).optional(),
  professionalName: z.string().min(3, 'Profissional ausente.').max(200),
  status: z.enum(['COMPLETED', 'APPROVED']),
  completedAt: z.date().optional(),
  value: z.string({ required_error: 'Valor ausente ou inválido.' }),
});

export type TreatmentRow = z.infer<typeof treatmentRowSchema>;
export type TreatmentPlanned = TreatmentRow & {
  patientId: string;
  professionalId: string;
  procedureKey: string;
  procedureId?: string;
};

export function parseTreatmentRow(row: SheetRow, ctx: Pick<ImportContext, 'timezone'>): ParsedRow<TreatmentRow> {
  const cells = row.cells;
  const errors: string[] = [];
  const warnings: string[] = [];
  const statusText = cellText(cells[TREATMENT_COLUMNS.status]);
  const status = STATUS_MAP[normalizeName(statusText)];
  if (!status) errors.push(statusText ? `Status “${statusText}” não reconhecido (use Finalizado ou Em aberto).` : 'Status ausente.');
  const created = parseDateTime(cells[TREATMENT_COLUMNS.createdAt]);
  const createdAt = created ? civilToUtc(created, ctx.timezone) : undefined;
  const finished = parseDateTime(cells[TREATMENT_COLUMNS.completedAt]);
  let completedAt = finished ? civilToUtc(finished, ctx.timezone) : undefined;
  if (status === 'COMPLETED' && !completedAt && createdAt) {
    completedAt = createdAt;
    warnings.push('Sem “Finalizado em”: a execução foi registrada na data de criação.');
  }
  return parsedRow(row.rowNumber, treatmentRowSchema, {
    createdAt,
    createdDay: created ? { year: created.year, month: created.month, day: created.day } : undefined,
    patientName: cellText(cells[TREATMENT_COLUMNS.patient]),
    phone: normalizePhone(cells[TREATMENT_COLUMNS.phone]) ?? undefined,
    procedureName: cellText(cells[TREATMENT_COLUMNS.procedure]),
    category: optionalText(cells[TREATMENT_COLUMNS.category]),
    professionalName: cellText(cells[TREATMENT_COLUMNS.professional]),
    status: status ?? 'APPROVED',
    completedAt: status === 'COMPLETED' ? completedAt : undefined,
    value: parseMoney(cells[TREATMENT_COLUMNS.value]) ?? undefined,
  }, errors, warnings);
}

export function treatmentNaturalKeys(rows: TreatmentRow[]): string[] {
  return withOccurrence(rows.map((row) => `item:${hashKey([
    normalizeName(row.patientName),
    normalizeName(row.procedureName),
    normalizeName(row.professionalName),
    isoDay(row.createdDay),
    row.value,
  ])}`));
}

export function planTreatments(
  rows: ParsedRow<TreatmentRow>[],
  input: {
    patients: PatientIndex;
    professionals: ProfessionalResolver;
    /** Catálogo por nome normalizado. */
    procedures: Map<string, { id: string; name: string }>;
    /** Destinos da tabela de aliases, por `internalCode`. */
    proceduresByCode: Map<string, { id: string; name: string }>;
    alreadyImported: Set<string>;
  },
): ImportPlan<TreatmentPlanned> {
  const builder = new PlanBuilder<TreatmentPlanned>(rows);
  const valid = PlanBuilder.valid(rows);
  const keys = treatmentNaturalKeys(valid.map((row) => row.data));
  const newProcedures = new Map<string, string>();
  const aliasMappings = new Map<string, { label: string; from: string; to: string }>();

  valid.forEach(({ rowNumber, data, warnings }, index) => {
    const key = keys[index]!;
    if (isNonTreatment(data.procedureName)) {
      builder.skip(rowNumber, `“${data.procedureName}” não é um tratamento odontológico; linha ignorada.`);
      return;
    }
    if (input.alreadyImported.has(key)) {
      builder.skip(rowNumber, 'Já importado em lote anterior.');
      return;
    }
    const patient = input.patients.resolve({ name: data.patientName, phone: data.phone });
    const professional = input.professionals.resolve(data.professionalName);
    const failures = [patient, professional].flatMap((result) => (result.ok ? [] : [result.error]));
    if (!patient.ok || !professional.ok) {
      builder.error(rowNumber, failures.join(' '), warnings);
      return;
    }
    const procedureKey = normalizeName(data.procedureName);
    const aliasCode = procedureAliasCode(data.procedureName);
    const aliased = aliasCode ? input.proceduresByCode.get(aliasCode) : undefined;
    const procedure = input.procedures.get(procedureKey) ?? aliased;
    if (procedure && procedure === aliased && !aliasMappings.has(procedureKey)) {
      aliasMappings.set(procedureKey, { label: 'Tratamento', from: data.procedureName, to: procedure.name });
    }
    if (!procedure && !newProcedures.has(procedureKey)) newProcedures.set(procedureKey, data.procedureName);
    builder.create(rowNumber, key, {
      ...data,
      patientId: patient.value.id,
      professionalId: professional.value.id,
      procedureKey,
      procedureId: procedure?.id,
    }, procedure ? warnings : [...warnings, `Procedimento “${data.procedureName}” será criado no catálogo.`]);
  });

  builder.creation('Procedimentos que serão criados no catálogo', [...newProcedures.values()]);
  builder.mappings(input.professionals.mappings());
  builder.mappings([...aliasMappings.values()]);
  builder.sample((item, rowNumber) => ({
    Linha: String(rowNumber),
    Paciente: item.patientName,
    Tratamento: item.procedureName,
    Profissional: item.professionalName,
    Status: item.status === 'COMPLETED' ? 'Concluído' : 'Aprovado (em aberto)',
    'Criado em': formatDay(item.createdDay),
    Valor: `R$ ${item.value.replace('.', ',')}`,
  }));
  return builder.build();
}

function procedureCode(key: string): string {
  return `IMP-${createHash('sha1').update(key).digest('hex').slice(0, 8).toUpperCase()}`;
}

export const treatmentsImport: ImportDefinition<TreatmentRow, TreatmentPlanned> = {
  kind: 'TREATMENTS',
  label: 'Tratamentos',
  permission: 'treatment.create',
  rowEntity: 'TreatmentItem',
  requiredColumns: [
    TREATMENT_COLUMNS.createdAt,
    TREATMENT_COLUMNS.patient,
    TREATMENT_COLUMNS.procedure,
    TREATMENT_COLUMNS.professional,
    TREATMENT_COLUMNS.status,
    TREATMENT_COLUMNS.value,
  ],
  optionalColumns: Object.values(TREATMENT_COLUMNS),
  parseRow: parseTreatmentRow,
  async plan(db, ctx, rows) {
    const keys = treatmentNaturalKeys(PlanBuilder.valid(rows).map((row) => row.data));
    const [patients, professionals, procedures, proceduresByCode, imported] = await Promise.all([
      loadPatientIndex(db, ctx.organizationId),
      loadProfessionals(db, ctx.organizationId, ctx.clinicId),
      loadNamedCatalog(db, 'procedure', ctx),
      loadProceduresByCode(db, ctx.organizationId, PROCEDURE_ALIAS_CODES),
      loadImportedKeys(db, ctx.organizationId, 'TreatmentItem', keys),
    ]);
    return planTreatments(rows, {
      patients,
      professionals: new ProfessionalResolver(professionals),
      procedures,
      proceduresByCode,
      alreadyImported: imported,
    });
  },
  async write(tx, ctx, plan) {
    const records: WrittenRecord[] = [];
    const procedureIds = new Map<string, string>();
    const toCreate = new Map<string, { name: string; specialty?: string }>();
    for (const { data } of plan.items) {
      if (data.procedureId) procedureIds.set(data.procedureKey, data.procedureId);
      else if (!toCreate.has(data.procedureKey)) toCreate.set(data.procedureKey, { name: data.procedureName, specialty: data.category });
    }
    const createdProcedures = [...toCreate.entries()].map(([key, value]) => ({ id: randomUUID(), key, ...value }));
    if (createdProcedures.length) {
      await tx.procedure.createMany({
        data: createdProcedures.map((item) => ({
          id: item.id,
          organizationId: ctx.organizationId,
          internalCode: procedureCode(item.key),
          name: item.name,
          specialty: item.specialty ?? null,
          defaultDuration: 60,
        })),
      });
      for (const item of createdProcedures) procedureIds.set(item.key, item.id);
      records.push(...createdProcedures.map((item) => ({ entity: 'Procedure' as const, entityId: item.id })));
    }

    const groups = new Map<string, typeof plan.items>();
    for (const item of plan.items) {
      const key = `${item.data.patientId}|${item.data.professionalId}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }

    const plans: Array<Prisma.TreatmentPlanCreateManyInput & { id: string }> = [];
    const items: Prisma.TreatmentItemCreateManyInput[] = [];
    const sessions: Prisma.TreatmentSessionCreateManyInput[] = [];
    for (const group of groups.values()) {
      const planId = randomUUID();
      const first = group[0]!.data;
      const createdAt = new Date(Math.min(...group.map((item) => item.data.createdAt.getTime())));
      const total = sumMoney(group.map((item) => item.data.value));
      plans.push({
        id: planId,
        organizationId: ctx.organizationId,
        clinicId: ctx.clinicId,
        patientId: first.patientId,
        professionalId: first.professionalId,
        status: group.every((item) => item.data.status === 'COMPLETED') ? 'COMPLETED' : 'IN_PROGRESS',
        title: IMPORTED_PLAN_TITLE,
        presentedAt: createdAt,
        presentedVersion: 1,
        subtotal: total,
        total,
        notes: 'Plano criado pela importação de planilha de tratamentos.',
        priceSnapshot: { source: 'IMPORT' },
        createdAt,
      });
      group.forEach((item, index) => {
        const itemId = randomUUID();
        items.push({
          id: itemId,
          treatmentPlanId: planId,
          procedureId: procedureIds.get(item.data.procedureKey)!,
          professionalId: item.data.professionalId,
          unitPrice: item.data.value,
          total: item.data.value,
          sortOrder: index,
          status: item.data.status,
          approvedAt: item.data.createdAt,
        });
        records.push({ entity: 'TreatmentItem', entityId: itemId, naturalKey: item.naturalKey });
        if (item.data.status === 'COMPLETED' && item.data.completedAt) {
          const sessionId = randomUUID();
          sessions.push({
            id: sessionId,
            treatmentItemId: itemId,
            professionalId: item.data.professionalId,
            executionNotes: SESSION_NOTE,
            completedAt: item.data.completedAt,
            idempotencyKey: `import:${item.naturalKey}`,
          });
          records.push({ entity: 'TreatmentSession', entityId: sessionId });
        }
      });
      records.push({ entity: 'TreatmentPlan', entityId: planId });
    }

    await tx.treatmentPlan.createMany({ data: plans });
    await tx.treatmentItem.createMany({ data: items });
    if (sessions.length) await tx.treatmentSession.createMany({ data: sessions });
    await tx.treatmentPlanEvent.createMany({
      data: plans.map((item) => ({
        treatmentPlanId: item.id,
        type: 'IMPORTED',
        actorId: ctx.actorId,
        payload: { batchId: ctx.batchId, source: 'treatments-sheet' },
      })),
    });
    return records;
  },
};
