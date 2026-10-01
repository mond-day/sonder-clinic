import { prisma } from '@sonder/database';
import { isNonTreatment, procedureAliasCode } from '../imports/procedure-aliases';
import { normalizeName } from '../imports/import-values';

/**
 * Catálogo odontológico instalado na 1ª listagem de procedimentos,
 * no mesmo modelo de medicamentos e tipos de exame (por organização, idempotente).
 * Sem preço e sem TUSS: o preço de demonstração continua só no seed dos itens que já existiam.
 * Códigos e nomes dos 11 iniciais batem com o seed para não duplicar o que produção já tem.
 */
export type DefaultProcedure = {
  internalCode: string;
  name: string;
  specialty: string;
  defaultDuration: number;
  requiresTooth: boolean;
  requiresFace: boolean;
};

const SEEDED: DefaultProcedure[] = [
  { internalCode: 'AVAL-001', name: 'Consulta odontológica inicial', specialty: 'Clínica geral', defaultDuration: 45, requiresTooth: false, requiresFace: false },
  { internalCode: 'CLAR-001', name: 'Clareamento dental', specialty: 'Estética', defaultDuration: 60, requiresTooth: false, requiresFace: false },
  { internalCode: 'ORTO-001', name: 'Manutenção ortodôntica', specialty: 'Ortodontia', defaultDuration: 30, requiresTooth: false, requiresFace: false },
  { internalCode: 'ORTO-002', name: 'Instalação de aparelho', specialty: 'Ortodontia', defaultDuration: 90, requiresTooth: false, requiresFace: false },
  { internalCode: 'PROT-001', name: 'Coroa cerâmica', specialty: 'Prótese', defaultDuration: 60, requiresTooth: true, requiresFace: false },
  { internalCode: 'IMPL-001', name: 'Implante unitário', specialty: 'Implantodontia', defaultDuration: 90, requiresTooth: true, requiresFace: false },
  { internalCode: 'PREV-001', name: 'Profilaxia', specialty: 'Preventivo', defaultDuration: 45, requiresTooth: false, requiresFace: false },
  { internalCode: 'REST-001', name: 'Restauração em resina', specialty: 'Dentística', defaultDuration: 50, requiresTooth: true, requiresFace: false },
  { internalCode: 'FAC-001', name: 'Faceta em porcelana', specialty: 'Estética', defaultDuration: 90, requiresTooth: true, requiresFace: false },
  { internalCode: 'CIR-001', name: 'Extração dentária', specialty: 'Cirurgia', defaultDuration: 60, requiresTooth: true, requiresFace: false },
  { internalCode: 'AVAL-EST', name: 'Avaliação estética', specialty: 'Estética', defaultDuration: 45, requiresTooth: false, requiresFace: false },
];

/** Duração 60 segue o padrão da importação de tratamentos; o schema exige o campo e não há preço. */
const ADDED: DefaultProcedure[] = [
  { internalCode: 'SEL-001', name: 'Aplicação de Selante de Fóssulas e Fissuras', specialty: 'Preventivo', defaultDuration: 60, requiresTooth: true, requiresFace: false },
  { internalCode: 'CIR-002', name: 'Biópsia de Maxila', specialty: 'Cirurgia', defaultDuration: 60, requiresTooth: false, requiresFace: false },
  { internalCode: 'CLAR-002', name: 'Clareamento Dentário Caseiro', specialty: 'Estética', defaultDuration: 60, requiresTooth: false, requiresFace: false },
  { internalCode: 'PROT-002', name: 'Coroa Provisória com Pino', specialty: 'Prótese', defaultDuration: 60, requiresTooth: true, requiresFace: false },
  { internalCode: 'PROT-003', name: 'Coroa Total Acrílica Prensada', specialty: 'Prótese', defaultDuration: 60, requiresTooth: true, requiresFace: false },
  { internalCode: 'CIR-003', name: 'Exodontia de dentes Decíduos', specialty: 'Cirurgia', defaultDuration: 60, requiresTooth: true, requiresFace: false },
  { internalCode: 'CIR-004', name: 'Exodontia de Dentes Semi-inclusos / impactados', specialty: 'Cirurgia', defaultDuration: 60, requiresTooth: true, requiresFace: false },
  { internalCode: 'CIR-005', name: 'Exodontia de Raiz Residual', specialty: 'Cirurgia', defaultDuration: 60, requiresTooth: true, requiresFace: false },
  { internalCode: 'CIR-006', name: 'Exodontia siso inferior erupcionado', specialty: 'Cirurgia', defaultDuration: 60, requiresTooth: true, requiresFace: false },
  { internalCode: 'CIR-007', name: 'Exodontia siso inferior semi-incluso', specialty: 'Cirurgia', defaultDuration: 60, requiresTooth: true, requiresFace: false },
  { internalCode: 'CIR-008', name: 'Exodontia siso superior erupcionado', specialty: 'Cirurgia', defaultDuration: 60, requiresTooth: true, requiresFace: false },
  { internalCode: 'CIR-009', name: 'Exodontia siso superior incluso', specialty: 'Cirurgia', defaultDuration: 60, requiresTooth: true, requiresFace: false },
  { internalCode: 'CIR-010', name: 'Exodontia siso superior semi-incluso', specialty: 'Cirurgia', defaultDuration: 60, requiresTooth: true, requiresFace: false },
  { internalCode: 'FAC-002', name: 'Faceta em Resina Fotopolimerizável', specialty: 'Estética', defaultDuration: 60, requiresTooth: true, requiresFace: false },
  { internalCode: 'PROT-004', name: 'Placa de mordida miorelaxante', specialty: 'Prótese', defaultDuration: 60, requiresTooth: false, requiresFace: false },
  { internalCode: 'PROT-005', name: 'Prótese Parcial Removível com Grampos Bilateral (PPR)', specialty: 'Prótese', defaultDuration: 60, requiresTooth: false, requiresFace: false },
  { internalCode: 'PROT-006', name: 'Prótese Total Imediata (PT)', specialty: 'Prótese', defaultDuration: 60, requiresTooth: false, requiresFace: false },
  { internalCode: 'PROT-007', name: 'Reembasamento de Prótese Total ou Parcial em Consultório', specialty: 'Prótese', defaultDuration: 60, requiresTooth: false, requiresFace: false },
  { internalCode: 'REST-002', name: 'Restauração em Ionômero de Vidro - 1 face', specialty: 'Dentística', defaultDuration: 60, requiresTooth: true, requiresFace: true },
  { internalCode: 'REST-003', name: 'Restauração em Ionômero de Vidro - 2 faces', specialty: 'Dentística', defaultDuration: 60, requiresTooth: true, requiresFace: true },
  { internalCode: 'REST-004', name: 'Restauração em Resina Fotopolimerizável 1 face', specialty: 'Dentística', defaultDuration: 60, requiresTooth: true, requiresFace: true },
  { internalCode: 'REST-005', name: 'Restauração em Resina Fotopolimerizável 2 faces', specialty: 'Dentística', defaultDuration: 60, requiresTooth: true, requiresFace: true },
  { internalCode: 'REST-006', name: 'Restauração em Resina Fotopolimerizável 3 faces', specialty: 'Dentística', defaultDuration: 60, requiresTooth: true, requiresFace: true },
  { internalCode: 'REST-007', name: 'Restauração em Resina Fotopolimerizável 4 faces', specialty: 'Dentística', defaultDuration: 60, requiresTooth: true, requiresFace: true },
  { internalCode: 'ENDO-001', name: 'Retratamento Endodôntico Birradicular', specialty: 'Endodontia', defaultDuration: 60, requiresTooth: true, requiresFace: false },
  { internalCode: 'ENDO-002', name: 'Retratamento Endodôntico Multirradicular', specialty: 'Endodontia', defaultDuration: 60, requiresTooth: true, requiresFace: false },
  { internalCode: 'ENDO-003', name: 'Retratamento Endodôntico Unirradicular', specialty: 'Endodontia', defaultDuration: 60, requiresTooth: true, requiresFace: false },
  { internalCode: 'ENDO-004', name: 'Tratamento Endodôntico Multirradicular', specialty: 'Endodontia', defaultDuration: 60, requiresTooth: true, requiresFace: false },
];

export const DEFAULT_PROCEDURES: readonly DefaultProcedure[] = [...SEEDED, ...ADDED];

export function missingDefaultProcedures(
  existing: Array<{ internalCode: string; name: string }>,
): DefaultProcedure[] {
  const codes = new Set(existing.map((row) => row.internalCode.trim()));
  const names = new Set(existing.map((row) => normalizeName(row.name)));
  for (const row of existing) {
    const aliasCode = procedureAliasCode(row.name);
    if (aliasCode) codes.add(aliasCode);
  }
  return DEFAULT_PROCEDURES.filter((item) => {
    if (isNonTreatment(item.name) || procedureAliasCode(item.name)) return false;
    if (codes.has(item.internalCode)) return false;
    if (names.has(normalizeName(item.name))) return false;
    return true;
  });
}

/** Primeira listagem da organização. Rodar de novo não duplica código nem nome. */
export async function ensureDefaultProcedures(organizationId: string): Promise<void> {
  const existing = await prisma.procedure.findMany({
    where: { organizationId },
    select: { internalCode: true, name: true },
  });
  const missing = missingDefaultProcedures(existing);
  if (!missing.length) return;
  await prisma.procedure.createMany({
    data: missing.map((item) => ({
      organizationId,
      internalCode: item.internalCode,
      name: item.name,
      specialty: item.specialty,
      defaultDuration: item.defaultDuration,
      requiresTooth: item.requiresTooth,
      requiresFace: item.requiresFace,
      active: true,
    })),
    skipDuplicates: true,
  });
}
