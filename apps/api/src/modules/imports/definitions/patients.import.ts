import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { loadImportedKeys, loadPatientIndex, type PatientIndex } from '../import-lookups';
import { duplicateGroups, parsedRow, PlanBuilder } from '../import-plan';
import type { ImportContext, ImportDefinition, ImportPlan, ParsedRow, SheetRow, WrittenRecord } from '../import-types';
import {
  ageOn,
  cellText,
  dateOnlyUtc,
  formatDay,
  hashKey,
  isValidCpf,
  maskCpf,
  normalizeName,
  normalizePhone,
  normalizeState,
  onlyDigits,
  optionalText,
  parseDate,
  parseDateTime,
  splitList,
  zonedToUtc,
  type DateParts,
} from '../import-values';

export const PATIENT_COLUMNS = {
  id: 'ID',
  code: 'Numero',
  name: 'Nome completo',
  profession: 'Profissão',
  cpf: 'CPF',
  rg: 'RG',
  birthDate: 'Data de nascimento',
  sex: 'Sexo',
  guardianName: 'Responsável nome',
  guardianDocument: 'Responsável documento',
  postalCode: 'CEP',
  street: 'Endereço',
  complement: 'Complemento',
  district: 'Bairro',
  city: 'Cidade',
  state: 'Estado',
  email: 'Email',
  mobile: 'Celular',
  phone: 'Telefone',
  referral: 'Como conheceu',
  createdAt: 'Data de criação',
  categories: 'Categorias',
} as const;

const SEX_MAP: Record<string, 'FEMALE' | 'MALE' | 'OTHER'> = {
  feminino: 'FEMALE',
  f: 'FEMALE',
  masculino: 'MALE',
  m: 'MALE',
  outro: 'OTHER',
};

const text = (max: number) => z.string().max(max, `Texto com mais de ${max} caracteres.`).optional();

const patientRowSchema = z.object({
  externalId: text(60),
  internalCode: text(60),
  fullName: z.string().min(3, 'Nome completo ausente ou muito curto.').max(200, 'Nome com mais de 200 caracteres.'),
  cpf: z.string().refine(isValidCpf, 'CPF inválido.').optional(),
  rg: text(30),
  birthDate: z.custom<DateParts>().optional(),
  sex: z.enum(['FEMALE', 'MALE', 'OTHER']).optional(),
  profession: text(120),
  referralSource: text(120),
  categories: z.array(z.string().min(1).max(60)).max(20, 'Mais de 20 categorias.'),
  primaryPhone: z.string().regex(/^\d{10,11}$/, 'Celular inválido.'),
  secondaryPhone: z.string().regex(/^\d{10,11}$/).optional(),
  email: z.string().email().max(200).optional(),
  postalCode: z.string().regex(/^\d{8}$/).optional(),
  street: text(200),
  complement: text(120),
  district: text(120),
  city: text(120),
  state: z.string().length(2).optional(),
  guardian: z.object({ name: z.string().min(3).max(200), cpf: z.string().refine(isValidCpf).optional() }).optional(),
  createdAt: z.custom<Date>().optional(),
});

export type PatientRow = z.infer<typeof patientRowSchema>;
export type PatientPlanned = PatientRow & { isMinor: boolean };

export function parsePatientRow(row: SheetRow, ctx: Pick<ImportContext, 'timezone'>): ParsedRow<PatientRow> {
  const cells = row.cells;
  const errors: string[] = [];
  const warnings: string[] = [];

  const mobileDigits = onlyDigits(cells[PATIENT_COLUMNS.mobile]);
  const primaryPhone = normalizePhone(cells[PATIENT_COLUMNS.mobile]);
  if (!mobileDigits) errors.push('Celular ausente.');
  else if (!primaryPhone) errors.push(`Celular sem DDD ou inválido (${mobileDigits.length} dígitos).`);

  const cpfDigits = onlyDigits(cells[PATIENT_COLUMNS.cpf]);
  const secondaryPhone = normalizePhone(cells[PATIENT_COLUMNS.phone]) ?? undefined;
  if (onlyDigits(cells[PATIENT_COLUMNS.phone]) && !secondaryPhone) warnings.push('Telefone fixo inválido foi ignorado.');

  const birthRaw = cells[PATIENT_COLUMNS.birthDate];
  const birthDate = parseDate(birthRaw) ?? undefined;
  if (optionalText(birthRaw) && !birthDate) warnings.push('Data de nascimento inválida foi ignorada.');

  const sexText = optionalText(cells[PATIENT_COLUMNS.sex]);
  const sex = sexText ? SEX_MAP[normalizeName(sexText)] : undefined;
  if (sexText && !sex) warnings.push(`Sexo “${sexText}” não reconhecido; ficou em branco.`);

  const emailText = optionalText(cells[PATIENT_COLUMNS.email])?.toLowerCase();
  const email = emailText && z.string().email().max(200).safeParse(emailText).success ? emailText : undefined;
  if (emailText && !email) warnings.push('E-mail inválido foi ignorado.');

  const postalDigits = onlyDigits(cells[PATIENT_COLUMNS.postalCode]);
  const postalCode = postalDigits.length === 8 ? postalDigits : undefined;
  if (postalDigits && !postalCode) warnings.push('CEP inválido foi ignorado.');

  const stateText = optionalText(cells[PATIENT_COLUMNS.state]);
  const state = normalizeState(stateText ?? null) ?? undefined;
  if (stateText && !state) warnings.push('Estado não reconhecido foi ignorado.');

  const guardianName = optionalText(cells[PATIENT_COLUMNS.guardianName]);
  const guardianDigits = onlyDigits(cells[PATIENT_COLUMNS.guardianDocument]);
  const guardianCpf = isValidCpf(guardianDigits) ? guardianDigits : undefined;
  if (guardianName && guardianDigits && !guardianCpf) warnings.push('Documento do responsável não é um CPF válido; foi ignorado.');
  if (guardianName) warnings.push('Responsável cadastrado com o celular do paciente (a planilha não traz telefone do responsável).');

  const createdParts = parseDateTime(cells[PATIENT_COLUMNS.createdAt]);

  return parsedRow(row.rowNumber, patientRowSchema, {
    externalId: optionalText(cells[PATIENT_COLUMNS.id]),
    internalCode: optionalText(cells[PATIENT_COLUMNS.code]),
    fullName: cellText(cells[PATIENT_COLUMNS.name]),
    cpf: cpfDigits || undefined,
    rg: optionalText(cells[PATIENT_COLUMNS.rg]),
    birthDate,
    sex,
    profession: optionalText(cells[PATIENT_COLUMNS.profession]),
    referralSource: optionalText(cells[PATIENT_COLUMNS.referral]),
    categories: splitList(cells[PATIENT_COLUMNS.categories]),
    primaryPhone: primaryPhone ?? '',
    secondaryPhone,
    email,
    postalCode,
    street: optionalText(cells[PATIENT_COLUMNS.street]),
    complement: optionalText(cells[PATIENT_COLUMNS.complement]),
    district: optionalText(cells[PATIENT_COLUMNS.district]),
    city: optionalText(cells[PATIENT_COLUMNS.city]),
    state,
    guardian: guardianName ? { name: guardianName, cpf: guardianCpf } : undefined,
    createdAt: createdParts ? zonedToUtc(createdParts, ctx.timezone) : undefined,
  }, errors, warnings, primaryPhone ? [] : ['primaryPhone']);
}

export function patientNaturalKey(row: PatientRow): string {
  if (row.externalId) return `id:${row.externalId}`;
  if (row.cpf) return `cpf:${hashKey([row.cpf])}`;
  return `name:${hashKey([normalizeName(row.fullName), row.primaryPhone])}`;
}

/** Decide cada linha sem tocar no banco: usado pelo `plan` e pelos testes. */
export function planPatients(
  rows: ParsedRow<PatientRow>[],
  index: PatientIndex,
  alreadyImported: Set<string>,
  now: Date,
): ImportPlan<PatientPlanned> {
  const builder = new PlanBuilder<PatientPlanned>(rows);
  const valid = PlanBuilder.valid(rows);

  for (const group of duplicateGroups(valid, (row) => row.data.cpf)) {
    const lines = group.map((row) => row.rowNumber).join(', ');
    for (const row of group) builder.error(row.rowNumber, `CPF repetido na planilha (linhas ${lines}).`, row.warnings);
  }
  for (const group of duplicateGroups(valid, (row) => (row.data.cpf ? undefined : normalizeName(row.data.fullName)))) {
    const lines = group.map((row) => row.rowNumber).join(', ');
    for (const row of group) builder.error(row.rowNumber, `Nome repetido sem CPF na planilha (linhas ${lines}).`, row.warnings);
  }

  let minorsWithoutGuardian = 0;
  for (const { rowNumber, data, warnings } of valid) {
    if (builder.isDecided(rowNumber)) continue;
    if (alreadyImported.has(patientNaturalKey(data))) {
      builder.skip(rowNumber, 'Já importado em lote anterior.');
      continue;
    }
    if (data.cpf && index.findByCpf(data.cpf)) {
      builder.skip(rowNumber, 'Paciente já cadastrado com o mesmo CPF (cadastro existente não é alterado).');
      continue;
    }
    const sameName = index.findByName(data.fullName);
    if (!data.cpf && sameName.length === 1) {
      builder.skip(rowNumber, 'Paciente já cadastrado com o mesmo nome (cadastro existente não é alterado).');
      continue;
    }
    if (!data.cpf && sameName.length > 1) {
      builder.error(rowNumber, 'O nome corresponde a mais de um paciente já cadastrado; informe o CPF na planilha.', warnings);
      continue;
    }
    if (data.cpf && sameName.some((patient) => !patient.cpf)) {
      builder.skip(rowNumber, 'Já existe paciente com o mesmo nome e sem CPF; revise esse cadastro manualmente.');
      continue;
    }
    const isMinor = data.birthDate ? ageOn(data.birthDate, now) < 18 : false;
    if (isMinor && !data.guardian) minorsWithoutGuardian += 1;
    builder.create(rowNumber, patientNaturalKey(data), { ...data, isMinor }, warnings);
  }

  if (minorsWithoutGuardian) builder.warning(`${minorsWithoutGuardian} paciente(s) menor(es) de idade sem responsável na planilha.`);
  builder.sample((item, rowNumber) => ({
    Linha: String(rowNumber),
    Nome: item.fullName,
    CPF: maskCpf(item.cpf),
    Nascimento: formatDay(item.birthDate),
    Celular: `•••${item.primaryPhone.slice(-4)}`,
    Responsável: item.guardian ? 'Sim' : 'Não',
  }));
  return builder.build();
}

export const patientsImport: ImportDefinition<PatientRow, PatientPlanned> = {
  kind: 'PATIENTS',
  label: 'Pacientes',
  permission: 'patient.create',
  rowEntity: 'Patient',
  requiredColumns: [PATIENT_COLUMNS.name, PATIENT_COLUMNS.mobile, PATIENT_COLUMNS.cpf],
  optionalColumns: Object.values(PATIENT_COLUMNS),
  parseRow: parsePatientRow,
  async plan(db, ctx, rows) {
    const keys = PlanBuilder.valid(rows).map((row) => patientNaturalKey(row.data));
    const [index, imported] = await Promise.all([
      loadPatientIndex(db, ctx.organizationId, true),
      loadImportedKeys(db, ctx.organizationId, 'Patient', keys),
    ]);
    return planPatients(rows, index, imported, ctx.now);
  },
  async write(tx, ctx, plan) {
    const records: WrittenRecord[] = [];
    const patients = plan.items.map((item) => ({ id: randomUUID(), naturalKey: item.naturalKey, data: item.data }));
    await tx.patient.createMany({
      data: patients.map(({ id, data }) => ({
        id,
        organizationId: ctx.organizationId,
        fullName: data.fullName,
        cpf: data.cpf ?? null,
        birthDate: data.birthDate ? dateOnlyUtc(data.birthDate) : null,
        email: data.email ?? null,
        primaryPhone: data.primaryPhone,
        secondaryPhone: data.secondaryPhone ?? null,
        isMinor: data.isMinor,
        postalCode: data.postalCode ?? null,
        street: data.street ?? null,
        complement: data.complement ?? null,
        district: data.district ?? null,
        city: data.city ?? null,
        state: data.state ?? null,
        sex: data.sex ?? null,
        profession: data.profession ?? null,
        rg: data.rg ?? null,
        referralSource: data.referralSource ?? null,
        categories: data.categories,
        ...(data.createdAt ? { createdAt: data.createdAt } : {}),
      })),
    });
    await tx.patientClinic.createMany({
      data: patients.map(({ id, data }) => ({ patientId: id, clinicId: ctx.clinicId, internalCode: data.internalCode ?? null })),
    });
    records.push(...patients.map(({ id, naturalKey }) => ({ entity: 'Patient' as const, entityId: id, naturalKey })));

    const guardians = patients.flatMap(({ id, data }) =>
      data.guardian ? [{ guardianId: randomUUID(), patientId: id, guardian: data.guardian, phone: data.primaryPhone }] : []);
    if (guardians.length) {
      await tx.guardian.createMany({
        data: guardians.map((item) => ({
          id: item.guardianId,
          name: item.guardian.name,
          cpf: item.guardian.cpf ?? null,
          phone: item.phone,
          relationship: 'Responsável',
        })),
      });
      await tx.patientGuardian.createMany({
        data: guardians.map((item) => ({
          patientId: item.patientId,
          guardianId: item.guardianId,
          isLegalGuardian: true,
          canSign: true,
          isPrimary: true,
        })),
      });
      records.push(...guardians.map((item) => ({ entity: 'Guardian' as const, entityId: item.guardianId })));
    }
    return records;
  },
};
