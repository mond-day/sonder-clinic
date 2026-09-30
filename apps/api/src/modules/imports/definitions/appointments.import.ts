import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  loadImportedKeys,
  loadNamedCatalog,
  loadPatientIndex,
  loadProfessionals,
  ProfessionalResolver,
  resolveUnit,
  type PatientIndex,
  type Resolution,
} from '../import-lookups';
import { CHAIR_OVERLAP_MESSAGE } from '../../scheduling/appointment-conflict';
import { parsedRow, PlanBuilder } from '../import-plan';
import type { AppointmentStatus, Db, ImportDefinition, ImportPlan, ParsedRow, SheetRow, WrittenRecord } from '../import-types';
import {
  cellText,
  formatDay,
  hashKey,
  isoDay,
  normalizeName,
  normalizePhone,
  optionalText,
  parseDate,
  parseTime,
  splitList,
  withOccurrence,
  zonedToUtc,
  type DateTimeParts,
} from '../import-values';

export const APPOINTMENT_COLUMNS = {
  date: 'Data',
  time: 'Hora',
  patient: 'Paciente',
  phone: 'Telefone',
  professional: 'Profissional',
  duration: 'Duração (min)',
  tags: 'Tags',
  categories: 'Categorias',
  status: 'Status',
  notes: 'Observações',
} as const;

type SheetStatus = 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' | 'SCHEDULED' | 'CONFIRMED' | 'IN_PROGRESS';

const STATUS_MAP: Record<string, SheetStatus> = {
  finalizada: 'COMPLETED',
  'cancelada pelo paciente': 'CANCELLED',
  'cancelada pelo profissional': 'CANCELLED',
  faltou: 'NO_SHOW',
  agendada: 'SCHEDULED',
  confirmada: 'CONFIRMED',
  'em atendimento': 'IN_PROGRESS',
};

const ACTIVE_STATUSES: ReadonlySet<AppointmentStatus> = new Set(['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS']);

const appointmentRowSchema = z.object({
  wall: z.custom<DateTimeParts>((value) => Boolean(value), 'Data ou hora ausente/inválida.'),
  durationMinutes: z.number({ invalid_type_error: 'Duração ausente ou inválida.' }).int().min(5, 'Duração menor que 5 minutos.').max(720, 'Duração maior que 12 horas.'),
  patientName: z.string().min(3, 'Paciente ausente.').max(200),
  phone: z.string().optional(),
  professionalName: z.string().min(3, 'Profissional ausente.').max(200),
  tags: z.array(z.string().min(1).max(60, 'Tag com mais de 60 caracteres.')).max(10, 'Mais de 10 tags.'),
  category: z.string().max(200).optional(),
  sheetStatus: z.enum(['COMPLETED', 'CANCELLED', 'NO_SHOW', 'SCHEDULED', 'CONFIRMED', 'IN_PROGRESS']),
  sheetStatusLabel: z.string(),
  notes: z.string().max(5000).optional(),
});

export type AppointmentRow = z.infer<typeof appointmentRowSchema>;
export type AppointmentPlanned = AppointmentRow & {
  patientId: string;
  professionalId: string;
  /** Preenchido quando a unidade tem uma única cadeira de agenda. */
  chairId?: string;
  startAt: Date;
  endAt: Date;
  status: AppointmentStatus;
  tagKeys: string[];
};

export type ExistingAppointment = {
  /** Nulo em compromissos (sem paciente); ainda ocupam o horário do profissional. */
  patientId: string | null;
  professionalId: string;
  chairId?: string | null;
  startAt: Date;
  endAt: Date;
  status: AppointmentStatus;
};

export function parseAppointmentRow(row: SheetRow): ParsedRow<AppointmentRow> {
  const cells = row.cells;
  const errors: string[] = [];
  const statusLabel = cellText(cells[APPOINTMENT_COLUMNS.status]);
  const status = STATUS_MAP[normalizeName(statusLabel)];
  if (!status) errors.push(statusLabel ? `Status “${statusLabel}” não reconhecido.` : 'Status ausente.');
  const day = parseDate(cells[APPOINTMENT_COLUMNS.date]);
  const time = parseTime(cells[APPOINTMENT_COLUMNS.time]);
  const durationCell = cells[APPOINTMENT_COLUMNS.duration];
  const duration = typeof durationCell === 'number' ? durationCell : Number(cellText(durationCell).replace(',', '.'));
  const categories = splitList(cells[APPOINTMENT_COLUMNS.categories]);
  return parsedRow(row.rowNumber, appointmentRowSchema, {
    wall: day && time ? { ...day, ...time } : undefined,
    durationMinutes: Number.isFinite(duration) && cellText(durationCell) ? Math.round(duration) : undefined,
    patientName: cellText(cells[APPOINTMENT_COLUMNS.patient]),
    phone: normalizePhone(cells[APPOINTMENT_COLUMNS.phone]) ?? undefined,
    professionalName: cellText(cells[APPOINTMENT_COLUMNS.professional]),
    tags: splitList(cells[APPOINTMENT_COLUMNS.tags]),
    category: categories.length ? categories.join(', ') : undefined,
    sheetStatus: status ?? 'SCHEDULED',
    sheetStatusLabel: statusLabel,
    notes: optionalText(cells[APPOINTMENT_COLUMNS.notes]),
  }, errors, []);
}

/** Consultas passadas que ficaram "Agendada/Confirmada/Em atendimento" entram como concluídas (decisão do produto). */
export function resolveAppointmentStatus(sheetStatus: SheetStatus, endAt: Date, now: Date): { status: AppointmentStatus; warning?: string } {
  const past = endAt.getTime() <= now.getTime();
  if (past && (sheetStatus === 'SCHEDULED' || sheetStatus === 'CONFIRMED' || sheetStatus === 'IN_PROGRESS')) {
    return { status: 'COMPLETED', warning: 'Consulta passada sem baixa na planilha: gravada como concluída.' };
  }
  if (!past && sheetStatus === 'IN_PROGRESS') return { status: 'CONFIRMED', warning: '“Em atendimento” no futuro: gravada como confirmada.' };
  return { status: sheetStatus };
}

export function appointmentNaturalKeys(rows: AppointmentRow[]): string[] {
  return withOccurrence(rows.map((row) => `appt:${hashKey([
    normalizeName(row.patientName),
    isoDay(row.wall),
    `${row.wall.hour}:${row.wall.minute}`,
    normalizeName(row.professionalName),
  ])}`));
}

const overlaps = (a: { startAt: Date; endAt: Date }, b: { startAt: Date; endAt: Date }) =>
  a.startAt < b.endAt && b.startAt < a.endAt;

export function planAppointments(
  rows: ParsedRow<AppointmentRow>[],
  input: {
    unit: Resolution<{ id: string; timezone: string }>;
    patients: PatientIndex;
    professionals: ProfessionalResolver;
    tags: Map<string, { id: string; name: string }>;
    alreadyImported: Set<string>;
    existing: ExistingAppointment[];
    /** Cadeira única da unidade. Sem ela, linhas importadas não ocupam cadeira. */
    chairId?: string;
    now: Date;
  },
): ImportPlan<AppointmentPlanned> {
  const builder = new PlanBuilder<AppointmentPlanned>(rows);
  if (!input.unit.ok) {
    builder.blocking(input.unit.error);
    return builder.build();
  }
  const timezone = input.unit.value.timezone;
  const valid = PlanBuilder.valid(rows);
  const keys = appointmentNaturalKeys(valid.map((row) => row.data));
  const activeByProfessional = new Map<string, Array<{ startAt: Date; endAt: Date; rowNumber?: number }>>();
  const activeByChair = new Map<string, Array<{ startAt: Date; endAt: Date; rowNumber?: number }>>();
  for (const appointment of input.existing) {
    if (!ACTIVE_STATUSES.has(appointment.status)) continue;
    activeByProfessional.set(appointment.professionalId, [...(activeByProfessional.get(appointment.professionalId) ?? []), appointment]);
    if (input.chairId && appointment.chairId === input.chairId) {
      activeByChair.set(input.chairId, [...(activeByChair.get(input.chairId) ?? []), appointment]);
    }
  }
  const newTags = new Map<string, string>();
  let futureActive = 0;

  valid.forEach(({ rowNumber, data, warnings }, index) => {
    const key = keys[index]!;
    if (input.alreadyImported.has(key)) {
      builder.skip(rowNumber, 'Já importada em lote anterior.');
      return;
    }
    const patient = input.patients.resolve({ name: data.patientName, phone: data.phone });
    const professional = input.professionals.resolve(data.professionalName);
    if (!patient.ok || !professional.ok) {
      builder.error(rowNumber, [patient, professional].flatMap((result) => (result.ok ? [] : [result.error])).join(' '), warnings);
      return;
    }
    const startAt = zonedToUtc(data.wall, timezone);
    const endAt = new Date(startAt.getTime() + data.durationMinutes * 60_000);
    const duplicate = input.existing.some((item) =>
      item.patientId === patient.value.id
      && item.professionalId === professional.value.id
      && item.startAt.getTime() === startAt.getTime());
    if (duplicate) {
      builder.skip(rowNumber, 'Consulta já existe na agenda (mesmo paciente, profissional e horário).');
      return;
    }
    const resolved = resolveAppointmentStatus(data.sheetStatus, endAt, input.now);
    const rowWarnings = resolved.warning ? [...warnings, resolved.warning] : warnings;
    if (ACTIVE_STATUSES.has(resolved.status)) {
      const busy = activeByProfessional.get(professional.value.id) ?? [];
      const clash = busy.find((item) => overlaps(item, { startAt, endAt }));
      if (clash) {
        builder.error(rowNumber, clash.rowNumber
          ? `Conflito de horário com a linha ${clash.rowNumber} (mesmo profissional).`
          : 'Conflito de horário com consulta ou compromisso já existente na agenda (mesmo profissional).', rowWarnings);
        return;
      }
      if (input.chairId) {
        const busyChair = activeByChair.get(input.chairId) ?? [];
        const chairClash = busyChair.find((item) => overlaps(item, { startAt, endAt }));
        if (chairClash) {
          builder.error(rowNumber, chairClash.rowNumber
            ? `${CHAIR_OVERLAP_MESSAGE} (linha ${chairClash.rowNumber}).`
            : CHAIR_OVERLAP_MESSAGE, rowWarnings);
          return;
        }
        activeByChair.set(input.chairId, [...busyChair, { startAt, endAt, rowNumber }]);
      }
      activeByProfessional.set(professional.value.id, [...busy, { startAt, endAt, rowNumber }]);
      futureActive += 1;
    }
    const tagKeys = data.tags.map((tag) => {
      const tagKey = normalizeName(tag);
      if (!input.tags.has(tagKey) && !newTags.has(tagKey)) newTags.set(tagKey, tag);
      return tagKey;
    });
    builder.create(rowNumber, key, {
      ...data,
      patientId: patient.value.id,
      professionalId: professional.value.id,
      chairId: input.chairId,
      startAt,
      endAt,
      status: resolved.status,
      tagKeys: [...new Set(tagKeys)],
    }, rowWarnings);
  });

  if (futureActive) {
    builder.warning(`${futureActive} consulta(s) futura(s) serão gravadas sem lembrete de WhatsApp e sem evento no Google Agenda.`);
  }
  builder.creation('Etiquetas de agenda que serão criadas', [...newTags.values()]);
  builder.mappings(input.professionals.mappings());
  builder.sample((item, rowNumber) => ({
    Linha: String(rowNumber),
    Data: `${formatDay(item.wall)} ${String(item.wall.hour).padStart(2, '0')}:${String(item.wall.minute).padStart(2, '0')}`,
    Paciente: item.patientName,
    Profissional: item.professionalName,
    'Status planilha': item.sheetStatusLabel,
    'Status gravado': item.status,
  }));
  return builder.build();
}

async function soleSchedulingChairId(db: Db, unitId: string): Promise<string | undefined> {
  const chairs = await db.chair.findMany({
    where: { unitId, status: 'ACTIVE', isSchedulingEnabled: true },
    select: { id: true },
    take: 2,
  });
  return chairs.length === 1 ? chairs[0]!.id : undefined;
}

async function loadExistingAppointments(db: Db, organizationId: string, rows: AppointmentRow[], timezone: string) {
  if (!rows.length) return [];
  const starts = rows.map((row) => zonedToUtc(row.wall, timezone).getTime());
  const from = new Date(Math.min(...starts) - 24 * 3_600_000);
  const to = new Date(Math.max(...starts) + 24 * 3_600_000);
  return db.appointment.findMany({
    where: { organizationId, startAt: { lt: to }, endAt: { gt: from } },
    select: { patientId: true, professionalId: true, chairId: true, startAt: true, endAt: true, status: true },
  });
}

export const appointmentsImport: ImportDefinition<AppointmentRow, AppointmentPlanned> = {
  kind: 'APPOINTMENTS',
  label: 'Consultas',
  permission: 'appointment.create',
  rowEntity: 'Appointment',
  requiredColumns: [
    APPOINTMENT_COLUMNS.date,
    APPOINTMENT_COLUMNS.time,
    APPOINTMENT_COLUMNS.patient,
    APPOINTMENT_COLUMNS.professional,
    APPOINTMENT_COLUMNS.duration,
    APPOINTMENT_COLUMNS.status,
  ],
  optionalColumns: Object.values(APPOINTMENT_COLUMNS),
  parseRow: (row) => parseAppointmentRow(row),
  async plan(db, ctx, rows) {
    const validRows = PlanBuilder.valid(rows).map((row) => row.data);
    const unit = await resolveUnit(db, ctx.clinicId, ctx.options.unitId);
    const [patients, professionals, tags, imported, existing] = await Promise.all([
      loadPatientIndex(db, ctx.organizationId),
      loadProfessionals(db, ctx.organizationId, ctx.clinicId),
      loadNamedCatalog(db, 'agendaTag', ctx),
      loadImportedKeys(db, ctx.organizationId, 'Appointment', appointmentNaturalKeys(validRows)),
      unit.ok ? loadExistingAppointments(db, ctx.organizationId, validRows, unit.value.timezone) : Promise.resolve([]),
    ]);
    const chairId = unit.ok ? await soleSchedulingChairId(db, unit.value.id) : undefined;
    return planAppointments(rows, {
      unit,
      patients,
      professionals: new ProfessionalResolver(professionals),
      tags,
      alreadyImported: imported,
      existing,
      chairId,
      now: ctx.now,
    });
  },
  async write(tx, ctx, plan) {
    const unit = await resolveUnit(tx, ctx.clinicId, ctx.options.unitId);
    if (!unit.ok) throw new Error(unit.error);
    const records: WrittenRecord[] = [];
    const catalog = await loadNamedCatalog(tx, 'agendaTag', ctx);
    const tagIds = new Map([...catalog.entries()].map(([key, value]) => [key, value.id]));
    const newTags = new Map<string, string>();
    for (const { data } of plan.items) {
      for (const key of data.tagKeys) {
        if (tagIds.has(key) || newTags.has(key)) continue;
        newTags.set(key, data.tags.find((tag) => normalizeName(tag) === key) ?? key);
      }
    }
    if (newTags.size) {
      const created = [...newTags.entries()].map(([key, name]) => ({ id: randomUUID(), key, name }));
      await tx.agendaTag.createMany({
        data: created.map((tag) => ({ id: tag.id, organizationId: ctx.organizationId, clinicId: ctx.clinicId, name: tag.name })),
      });
      for (const tag of created) tagIds.set(tag.key, tag.id);
      records.push(...created.map((tag) => ({ entity: 'AgendaTag' as const, entityId: tag.id })));
    }

    const appointments = plan.items.map((item) => ({ id: randomUUID(), ...item }));
    await tx.appointment.createMany({
      data: appointments.map(({ id, data }) => ({
        id,
        organizationId: ctx.organizationId,
        clinicId: ctx.clinicId,
        unitId: unit.value.id,
        patientId: data.patientId,
        professionalId: data.professionalId,
        chairId: data.chairId ?? null,
        startAt: data.startAt,
        endAt: data.endAt,
        status: data.status,
        source: 'IMPORT',
        notes: data.notes ?? null,
        category: data.category ?? null,
      })),
    });
    await tx.appointmentStatusEvent.createMany({
      data: appointments.map(({ id, data }) => ({
        appointmentId: id,
        nextStatus: data.status,
        reasonCode: 'IMPORT',
        reasonText: `Status na planilha: ${data.sheetStatusLabel}`,
        nextStartAt: data.startAt,
        actorId: ctx.actorId,
      })),
    });
    const links = appointments.flatMap(({ id, data }) =>
      data.tagKeys.map((key) => ({ appointmentId: id, tagId: tagIds.get(key)! })));
    if (links.length) await tx.appointmentTag.createMany({ data: links, skipDuplicates: true });
    records.push(...appointments.map(({ id, naturalKey }) => ({ entity: 'Appointment' as const, entityId: id, naturalKey })));
    return records;
  },
};
