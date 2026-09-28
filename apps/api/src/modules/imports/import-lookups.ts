import type { Db, ImportEntity } from './import-types';
import { nameTokens, normalizeName, phoneMatches } from './import-values';

export type PatientEntry = {
  id: string;
  fullName: string;
  cpf: string | null;
  primaryPhone: string | null;
  secondaryPhone: string | null;
};

export type Resolution<T> = { ok: true; value: T } | { ok: false; error: string };

/** Casa paciente por CPF normalizado; sem CPF, por nome normalizado (telefone desempata homônimos). */
export class PatientIndex {
  private readonly byCpf = new Map<string, PatientEntry>();
  private readonly byName = new Map<string, PatientEntry[]>();

  constructor(entries: PatientEntry[]) {
    for (const entry of entries) {
      if (entry.cpf) this.byCpf.set(entry.cpf, entry);
      const key = normalizeName(entry.fullName);
      this.byName.set(key, [...(this.byName.get(key) ?? []), entry]);
    }
  }

  findByCpf(cpf: string): PatientEntry | undefined {
    return this.byCpf.get(cpf);
  }

  findByName(name: string): PatientEntry[] {
    return this.byName.get(normalizeName(name)) ?? [];
  }

  resolve(input: { name: string; cpf?: string | null; phone?: string | null }): Resolution<PatientEntry> {
    if (input.cpf) {
      const byCpf = this.byCpf.get(input.cpf);
      if (byCpf) return { ok: true, value: byCpf };
    }
    const candidates = this.findByName(input.name);
    if (candidates.length === 1) return { ok: true, value: candidates[0]! };
    if (candidates.length === 0) {
      return { ok: false, error: `Paciente “${input.name}” não encontrado. Importe a planilha de pacientes antes.` };
    }
    const byPhone = candidates.filter((entry) =>
      phoneMatches(entry.primaryPhone, input.phone) || phoneMatches(entry.secondaryPhone, input.phone));
    if (byPhone.length === 1) return { ok: true, value: byPhone[0]! };
    return { ok: false, error: `Há ${candidates.length} pacientes chamados “${input.name}”; não foi possível decidir qual.` };
  }
}

/** `includeArchived` é necessário na importação de pacientes: o CPF é único mesmo entre arquivados. */
export async function loadPatientIndex(db: Db, organizationId: string, includeArchived = false): Promise<PatientIndex> {
  const rows = await db.patient.findMany({
    where: { organizationId, ...(includeArchived ? {} : { status: { not: 'ARCHIVED' as const } }) },
    select: { id: true, fullName: true, cpf: true, primaryPhone: true, secondaryPhone: true },
  });
  return new PatientIndex(rows);
}

export type ProfessionalEntry = { id: string; name: string; aliases: string[]; linkedToClinic: boolean };

/**
 * Nome exato (sem acento/caixa) ou, se único, conjunto de palavras contido no outro
 * (ex.: "Ana Souza" ↔ "Ana Maria Souza"). Nunca cria profissional.
 */
export function matchProfessional(name: string, entries: ProfessionalEntry[]): Resolution<ProfessionalEntry> {
  const normalized = normalizeName(name);
  const exact = entries.filter((entry) => entry.aliases.some((alias) => normalizeName(alias) === normalized));
  const tokens = new Set(nameTokens(name));
  const candidates = exact.length
    ? exact
    : entries.filter((entry) => entry.aliases.some((alias) => {
        const aliasTokens = nameTokens(alias);
        if (aliasTokens.length < 2 || tokens.size < 2) return false;
        const aliasSet = new Set(aliasTokens);
        return aliasTokens.every((token) => tokens.has(token)) || [...tokens].every((token) => aliasSet.has(token));
      }));
  if (candidates.length === 0) return { ok: false, error: `Profissional “${name}” não está cadastrado.` };
  if (candidates.length > 1) return { ok: false, error: `Profissional “${name}” corresponde a mais de um cadastro.` };
  const match = candidates[0]!;
  if (!match.linkedToClinic) return { ok: false, error: `Profissional “${match.name}” não tem vínculo ativo com a clínica.` };
  return { ok: true, value: match };
}

export class ProfessionalResolver {
  private readonly cache = new Map<string, { name: string; result: Resolution<ProfessionalEntry> }>();

  constructor(private readonly entries: ProfessionalEntry[]) {}

  resolve(name: string): Resolution<ProfessionalEntry> {
    const key = normalizeName(name);
    const cached = this.cache.get(key);
    if (cached) return cached.result;
    const result = matchProfessional(name, this.entries);
    this.cache.set(key, { name, result });
    return result;
  }

  /** Mapeamentos usados, para o usuário conferir na prévia como cada nome da planilha foi resolvido. */
  mappings(): Array<{ label: string; from: string; to: string }> {
    return [...this.cache.values()].flatMap(({ name, result }) =>
      result.ok ? [{ label: 'Profissional', from: name, to: result.value.name }] : []);
  }
}

export async function loadProfessionals(db: Db, organizationId: string, clinicId: string): Promise<ProfessionalEntry[]> {
  const rows = await db.professional.findMany({
    where: { user: { organizationId }, status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      user: { select: { name: true } },
      clinicLinks: { where: { clinicId, active: true }, select: { id: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    aliases: [...new Set([row.name, row.user.name])],
    linkedToClinic: row.clinicLinks.length > 0,
  }));
}

export async function loadImportedKeys(db: Db, organizationId: string, entity: ImportEntity, keys: string[]): Promise<Set<string>> {
  if (!keys.length) return new Set();
  const rows = await db.importBatchRecord.findMany({
    where: { organizationId, entity, naturalKey: { in: keys } },
    select: { naturalKey: true },
  });
  return new Set(rows.map((row) => row.naturalKey).filter((key): key is string => Boolean(key)));
}

export async function loadNamedCatalog(
  db: Db,
  source: 'procedure' | 'agendaTag',
  scope: { organizationId: string; clinicId: string },
): Promise<Map<string, { id: string; name: string }>> {
  const rows = source === 'procedure'
    ? await db.procedure.findMany({
        where: { organizationId: scope.organizationId },
        select: { id: true, name: true, active: true },
        orderBy: { active: 'desc' },
      })
    : await db.agendaTag.findMany({
        where: { organizationId: scope.organizationId, clinicId: scope.clinicId },
        select: { id: true, name: true, active: true },
        orderBy: { active: 'desc' },
      });
  const map = new Map<string, { id: string; name: string }>();
  for (const row of rows) {
    const key = normalizeName(row.name);
    if (!map.has(key)) map.set(key, { id: row.id, name: row.name });
  }
  return map;
}

export async function loadProceduresByCode(
  db: Db,
  organizationId: string,
  internalCodes: string[],
): Promise<Map<string, { id: string; name: string }>> {
  if (!internalCodes.length) return new Map();
  const rows = await db.procedure.findMany({
    where: { organizationId, internalCode: { in: internalCodes } },
    select: { id: true, name: true, internalCode: true },
  });
  return new Map(rows.map((row) => [row.internalCode, { id: row.id, name: row.name }]));
}

export async function resolveUnit(
  db: Db,
  clinicId: string,
  unitId: string | undefined,
): Promise<Resolution<{ id: string; timezone: string }>> {
  const units = await db.unit.findMany({
    where: { clinicId, status: 'ACTIVE' },
    select: { id: true, timezone: true },
  });
  if (unitId) {
    const unit = units.find((item) => item.id === unitId);
    return unit ? { ok: true, value: unit } : { ok: false, error: 'Unidade inválida ou inativa para a clínica selecionada.' };
  }
  if (units.length === 1) return { ok: true, value: units[0]! };
  if (units.length === 0) return { ok: false, error: 'A clínica não tem unidade ativa. Cadastre uma unidade antes de importar consultas.' };
  return { ok: false, error: 'A clínica tem mais de uma unidade ativa. Selecione a unidade das consultas.' };
}
