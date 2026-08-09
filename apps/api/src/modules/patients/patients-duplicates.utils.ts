import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { prisma } from '@sonder/database';

export type DuplicateReason =
  | 'SAME_CPF'
  | 'SAME_PASSPORT'
  | 'SAME_PHONE'
  | 'SAME_EMAIL'
  | 'SAME_NAME_BIRTHDATE'
  | 'SIMILAR_NAME_BIRTHDATE'
  | 'SIMILAR_NAME_PHONE';

type PatientRow = {
  id: string;
  fullName: string;
  cpf: string | null;
  passportNumber: string | null;
  email: string | null;
  primaryPhone: string;
  secondaryPhone: string | null;
  birthDate: Date | null;
  clinics: Array<{ clinicId: string; internalCode: string | null }>;
  _count: {
    appointments: number;
  };
};

const REASON_SCORE: Record<DuplicateReason, number> = {
  SAME_CPF: 100,
  SAME_PASSPORT: 100,
  SAME_PHONE: 72,
  SAME_EMAIL: 68,
  SAME_NAME_BIRTHDATE: 78,
  SIMILAR_NAME_BIRTHDATE: 52,
  SIMILAR_NAME_PHONE: 55,
};

function normalizePhone(value?: string | null) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizeEmail(value?: string | null) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function birthKey(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : '';
}

function namesSimilar(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b) return true;
  const tokensA = new Set(a.split(' ').filter((t) => t.length > 1));
  const tokensB = new Set(b.split(' ').filter((t) => t.length > 1));
  if (!tokensA.size || !tokensB.size) return false;
  let overlap = 0;
  for (const token of tokensA) if (tokensB.has(token)) overlap += 1;
  const ratio = overlap / Math.max(tokensA.size, tokensB.size);
  return ratio >= 0.6 || a.includes(b) || b.includes(a);
}

function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function maskCpf(cpf?: string | null) {
  if (!cpf || cpf.length < 11) return null;
  return `***.***.***-${cpf.slice(-2)}`;
}

function phonesOf(row: PatientRow) {
  return [normalizePhone(row.primaryPhone), normalizePhone(row.secondaryPhone)].filter((p) => p.length >= 10);
}

function detectReasons(a: PatientRow, b: PatientRow): DuplicateReason[] {
  const reasons: DuplicateReason[] = [];
  if (a.cpf && b.cpf && a.cpf === b.cpf) reasons.push('SAME_CPF');
  if (a.passportNumber && b.passportNumber && a.passportNumber === b.passportNumber) reasons.push('SAME_PASSPORT');

  const phonesA = phonesOf(a);
  const phonesB = phonesOf(b);
  const samePhone = phonesA.some((p) => phonesB.includes(p));
  if (samePhone) reasons.push('SAME_PHONE');

  const emailA = normalizeEmail(a.email);
  const emailB = normalizeEmail(b.email);
  if (emailA && emailB && emailA === emailB) reasons.push('SAME_EMAIL');

  const nameA = normalizeName(a.fullName);
  const nameB = normalizeName(b.fullName);
  const birthA = birthKey(a.birthDate);
  const birthB = birthKey(b.birthDate);
  const sameBirth = Boolean(birthA && birthB && birthA === birthB);
  const exactName = nameA === nameB;
  const similar = namesSimilar(nameA, nameB);

  if (exactName && sameBirth) reasons.push('SAME_NAME_BIRTHDATE');
  else if (similar && sameBirth) reasons.push('SIMILAR_NAME_BIRTHDATE');

  if (similar && samePhone && !exactName) reasons.push('SIMILAR_NAME_PHONE');

  return [...new Set(reasons)];
}

function scoreReasons(reasons: DuplicateReason[]) {
  if (!reasons.length) return 0;
  return Math.min(100, Math.max(...reasons.map((r) => REASON_SCORE[r])));
}

async function patientStats(organizationId: string, patientIds: string[]) {
  const [treatments, documents, receivables] = await Promise.all([
    prisma.treatmentPlan.groupBy({
      by: ['patientId'],
      where: { organizationId, patientId: { in: patientIds } },
      _count: { _all: true },
    }),
    prisma.generatedDocument.groupBy({
      by: ['patientId'],
      where: { organizationId, patientId: { in: patientIds } },
      _count: { _all: true },
    }),
    prisma.receivable.groupBy({
      by: ['patientId'],
      where: { organizationId, patientId: { in: patientIds } },
      _count: { _all: true },
    }),
  ]);
  const map = new Map<string, { treatmentsCount: number; documentsCount: number; receivablesCount: number }>();
  for (const id of patientIds) {
    map.set(id, { treatmentsCount: 0, documentsCount: 0, receivablesCount: 0 });
  }
  for (const row of treatments) {
    const current = map.get(row.patientId);
    if (current) current.treatmentsCount = row._count._all;
  }
  for (const row of documents) {
    const current = map.get(row.patientId);
    if (current) current.documentsCount = row._count._all;
  }
  for (const row of receivables) {
    const current = map.get(row.patientId);
    if (current) current.receivablesCount = row._count._all;
  }
  return map;
}

function serializePatient(
  row: PatientRow,
  stats: { treatmentsCount: number; documentsCount: number; receivablesCount: number },
) {
  return {
    id: row.id,
    fullName: row.fullName,
    cpfMasked: maskCpf(row.cpf),
    primaryPhone: row.primaryPhone,
    email: row.email,
    birthDate: birthKey(row.birthDate) || null,
    internalCode: row.clinics[0]?.internalCode ?? null,
    appointmentsCount: row._count.appointments,
    treatmentsCount: stats.treatmentsCount,
    documentsCount: stats.documentsCount,
    receivablesCount: stats.receivablesCount,
  };
}

export async function listPatientDuplicates(organizationId: string, clinicId?: string) {
  if (clinicId) {
    const clinic = await prisma.clinic.findFirst({ where: { id: clinicId, organizationId } });
    if (!clinic) throw new NotFoundException('Clínica não encontrada.');
  }

  const patients = await prisma.patient.findMany({
    where: {
      organizationId,
      status: { not: 'ARCHIVED' },
      ...(clinicId ? { clinics: { some: { clinicId, status: 'ACTIVE' } } } : {}),
    },
    select: {
      id: true,
      fullName: true,
      cpf: true,
      passportNumber: true,
      email: true,
      primaryPhone: true,
      secondaryPhone: true,
      birthDate: true,
      clinics: { select: { clinicId: true, internalCode: true } },
      _count: { select: { appointments: true } },
    },
    take: 500,
    orderBy: { fullName: 'asc' },
  });

  const dismissals = await prisma.patientDuplicateDismissal.findMany({
    where: { organizationId },
    select: { patientIdLow: true, patientIdHigh: true },
  });
  const dismissed = new Set(dismissals.map((d) => `${d.patientIdLow}:${d.patientIdHigh}`));

  type Pair = { a: PatientRow; b: PatientRow; reasons: DuplicateReason[]; score: number };
  const pairs: Pair[] = [];

  for (let i = 0; i < patients.length; i += 1) {
    for (let j = i + 1; j < patients.length; j += 1) {
      const a = patients[i]!;
      const b = patients[j]!;
      const [low, high] = pairKey(a.id, b.id);
      if (dismissed.has(`${low}:${high}`)) continue;
      const reasons = detectReasons(a, b);
      const score = scoreReasons(reasons);
      if (score < 50) continue;
      pairs.push({ a, b, reasons, score });
    }
  }

  pairs.sort((x, y) => y.score - x.score || x.a.fullName.localeCompare(y.a.fullName));
  const limited = pairs.slice(0, 50);
  const ids = [...new Set(limited.flatMap((p) => [p.a.id, p.b.id]))];
  const stats = await patientStats(organizationId, ids);

  return {
    groups: limited.map((pair) => ({
      score: pair.score,
      reasons: pair.reasons,
      patients: [
        serializePatient(pair.a, stats.get(pair.a.id) ?? { treatmentsCount: 0, documentsCount: 0, receivablesCount: 0 }),
        serializePatient(pair.b, stats.get(pair.b.id) ?? { treatmentsCount: 0, documentsCount: 0, receivablesCount: 0 }),
      ],
    })),
  };
}

export async function dismissPatientDuplicate(
  organizationId: string,
  actorId: string,
  patientIdA: string,
  patientIdB: string,
  reason?: string,
) {
  if (patientIdA === patientIdB) {
    throw new BadRequestException('Informe dois pacientes distintos.');
  }
  const [low, high] = pairKey(patientIdA, patientIdB);
  const [a, b] = await Promise.all([
    prisma.patient.findFirst({ where: { id: low, organizationId }, select: { id: true } }),
    prisma.patient.findFirst({ where: { id: high, organizationId }, select: { id: true } }),
  ]);
  if (!a || !b) throw new NotFoundException('Paciente não encontrado.');

  const dismissal = await prisma.patientDuplicateDismissal.upsert({
    where: {
      organizationId_patientIdLow_patientIdHigh: {
        organizationId,
        patientIdLow: low,
        patientIdHigh: high,
      },
    },
    create: {
      organizationId,
      patientIdLow: low,
      patientIdHigh: high,
      dismissedById: actorId,
      reason: reason?.trim() || null,
    },
    update: {
      dismissedById: actorId,
      reason: reason?.trim() || null,
    },
  });

  await prisma.auditEvent.create({
    data: {
      actorId,
      action: 'patient.duplicate_dismissed',
      entity: 'PatientDuplicateDismissal',
      entityId: dismissal.id,
      changes: { patientIdLow: low, patientIdHigh: high, reason: reason?.trim() || null },
      correlationId: randomUUID(),
    },
  });

  return { ok: true as const, dismissalId: dismissal.id };
}

const COMPARE_FIELDS = [
  'fullName',
  'preferredName',
  'cpf',
  'passportNumber',
  'birthDate',
  'email',
  'primaryPhone',
  'secondaryPhone',
  'isMinor',
] as const;

export async function previewPatientMerge(
  organizationId: string,
  targetPatientId: string,
  sourcePatientId: string,
) {
  if (targetPatientId === sourcePatientId) {
    throw new BadRequestException('Paciente de origem e destino devem ser diferentes.');
  }
  const [target, source] = await Promise.all([
    prisma.patient.findFirst({
      where: { id: targetPatientId, organizationId },
      include: { clinics: true, alerts: { where: { active: true } } },
    }),
    prisma.patient.findFirst({
      where: { id: sourcePatientId, organizationId },
      include: { clinics: true, alerts: { where: { active: true } } },
    }),
  ]);
  if (!target || !source) throw new NotFoundException('Paciente não encontrado.');
  if (source.status === 'ARCHIVED') {
    throw new BadRequestException('Paciente de origem já está arquivado.');
  }

  const [
    appointments,
    treatments,
    documents,
    receivables,
    odontograms,
    tasks,
    labCases,
    media,
    prescriptions,
  ] = await Promise.all([
    prisma.appointment.count({ where: { patientId: sourcePatientId } }),
    prisma.treatmentPlan.count({ where: { organizationId, patientId: sourcePatientId } }),
    prisma.generatedDocument.count({ where: { organizationId, patientId: sourcePatientId } }),
    prisma.receivable.count({ where: { organizationId, patientId: sourcePatientId } }),
    prisma.odontogram.count({ where: { organizationId, patientId: sourcePatientId } }),
    prisma.task.count({ where: { organizationId, patientId: sourcePatientId } }),
    prisma.labCase.count({ where: { organizationId, patientId: sourcePatientId } }),
    prisma.patientMedia.count({ where: { organizationId, patientId: sourcePatientId } }),
    prisma.prescription.count({ where: { organizationId, patientId: sourcePatientId } }),
  ]);

  const fieldConflicts = COMPARE_FIELDS.flatMap((field) => {
    const targetValue = target[field];
    const sourceValue = source[field];
    const normalize = (value: unknown) => {
      if (value instanceof Date) return value.toISOString().slice(0, 10);
      if (value == null || value === '') return null;
      return String(value);
    };
    const tv = normalize(targetValue);
    const sv = normalize(sourceValue);
    if (tv === sv) return [];
    if (sv == null) return [];
    return [{
      field,
      targetValue: tv,
      sourceValue: sv,
      resolution: 'KEEP_TARGET' as const,
    }];
  });

  return {
    target: {
      id: target.id,
      fullName: target.fullName,
      cpfMasked: maskCpf(target.cpf),
      primaryPhone: target.primaryPhone,
      email: target.email,
      birthDate: birthKey(target.birthDate) || null,
      status: target.status,
      alertsCount: target.alerts.length,
    },
    source: {
      id: source.id,
      fullName: source.fullName,
      cpfMasked: maskCpf(source.cpf),
      primaryPhone: source.primaryPhone,
      email: source.email,
      birthDate: birthKey(source.birthDate) || null,
      status: source.status,
      alertsCount: source.alerts.length,
    },
    transferCounts: {
      appointments,
      treatments,
      documents,
      receivables,
      odontograms,
      tasks,
      labCases,
      media,
      prescriptions,
      clinics: source.clinics.length,
    },
    fieldConflicts,
    consequences: [
      'Vínculos clínicos e financeiros da origem serão movidos para o cadastro principal.',
      'O cadastro secundário será arquivado.',
      'Campos divergentes permanecem com os valores do cadastro principal.',
    ],
  };
}
