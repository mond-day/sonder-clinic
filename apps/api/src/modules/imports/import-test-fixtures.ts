import { PatientIndex, type PatientEntry, type ProfessionalEntry } from './import-lookups';
import type { CellValue, ImportContext, SheetRow } from './import-types';

/** Gera CPF sintético válido a partir de 9 dígitos (apenas para testes). */
export function syntheticCpf(base9: string): string {
  const digits = base9.split('').map(Number);
  for (const length of [9, 10]) {
    const sum = digits.slice(0, length).reduce((total, digit, index) => total + digit * (length + 1 - index), 0);
    const rest = (sum * 10) % 11;
    digits.push(rest === 10 ? 0 : rest);
  }
  return digits.join('');
}

export function sheetRows(rows: Array<Record<string, CellValue>>): SheetRow[] {
  return rows.map((cells, index) => ({ rowNumber: index + 2, cells }));
}

export const testContext: ImportContext = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  clinicId: '00000000-0000-4000-8000-000000000002',
  actorId: '00000000-0000-4000-8000-000000000003',
  options: { clinicId: '00000000-0000-4000-8000-000000000002' },
  now: new Date('2026-09-27T15:00:00.000Z'),
  timezone: 'America/Cuiaba',
};

export function patientIndex(entries: Array<Partial<PatientEntry> & { id: string; fullName: string }>): PatientIndex {
  return new PatientIndex(entries.map((entry) => ({ cpf: null, primaryPhone: null, secondaryPhone: null, ...entry })));
}

export const professionals: ProfessionalEntry[] = [
  { id: 'prof-ana', name: 'Ana Maria Souza', aliases: ['Ana Maria Souza'], linkedToClinic: true },
  { id: 'prof-bruno', name: 'Bruno Lima', aliases: ['Bruno Lima', 'Bruno C. Lima'], linkedToClinic: true },
  { id: 'prof-inativo', name: 'Carla Dias', aliases: ['Carla Dias'], linkedToClinic: false },
];
