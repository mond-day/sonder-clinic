import { describe, expect, it } from 'vitest';
import { isNonTreatment, procedureAliasCode } from '../imports/procedure-aliases';
import { DEFAULT_PROCEDURES, missingDefaultProcedures } from './default-procedures';

const SEEDED_CODES = ['AVAL-001', 'CLAR-001', 'ORTO-001', 'ORTO-002', 'PROT-001', 'IMPL-001', 'PREV-001', 'REST-001', 'FAC-001', 'CIR-001', 'AVAL-EST'];
const ALIAS_NAMES = [
  'Profilaxia + Polimento Coronário - Limpeza',
  'Exodontia Simples de Permanente',
  'Clareamento em Consultório',
];

describe('carga padrão de procedimentos', () => {
  it('não duplica código nem nome e deixa de fora o que não é procedimento', () => {
    const codes = DEFAULT_PROCEDURES.map((item) => item.internalCode);
    const names = DEFAULT_PROCEDURES.map((item) => item.name);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain('Aporte de Capital');
    for (const name of names) {
      expect(isNonTreatment(name)).toBe(false);
      expect(procedureAliasCode(name)).toBeUndefined();
    }
    for (const alias of ALIAS_NAMES) expect(names).not.toContain(alias);
    expect(DEFAULT_PROCEDURES.every((item) => !('tussCode' in item) && !('price' in item))).toBe(true);
  });

  it('mantém variantes separadas e os canônicos do seed uma vez', () => {
    const byName = new Map(DEFAULT_PROCEDURES.map((item) => [item.name, item.internalCode]));
    expect(byName.get('Clareamento dental')).toBe('CLAR-001');
    expect(byName.get('Clareamento Dentário Caseiro')).toBe('CLAR-002');
    expect(byName.get('Profilaxia')).toBe('PREV-001');
    expect(byName.get('Extração dentária')).toBe('CIR-001');
    expect(byName.get('Restauração em Resina Fotopolimerizável 1 face')).toBe('REST-004');
    expect(byName.get('Restauração em Resina Fotopolimerizável 4 faces')).toBe('REST-007');
    expect(byName.get('Restauração em Ionômero de Vidro - 1 face')).not.toBe(byName.get('Restauração em Ionômero de Vidro - 2 faces'));
    expect(byName.get('Exodontia siso inferior erupcionado')).not.toBe(byName.get('Exodontia siso inferior semi-incluso'));
    expect(byName.get('Faceta em Resina Fotopolimerizável')).not.toBe(byName.get('Faceta em porcelana'));
  });

  it('é idempotente e não cria segundo clareamento, profilaxia ou extração', () => {
    const first = missingDefaultProcedures([]);
    expect(missingDefaultProcedures(first)).toEqual([]);

    const seeded = DEFAULT_PROCEDURES.filter((item) => SEEDED_CODES.includes(item.internalCode));
    const missing = missingDefaultProcedures(seeded);
    const missingCodes = missing.map((item) => item.internalCode);
    const missingNames = missing.map((item) => item.name);
    for (const code of SEEDED_CODES) expect(missingCodes).not.toContain(code);
    for (const name of [...ALIAS_NAMES, 'Aporte de Capital', 'Clareamento dental', 'Profilaxia', 'Extração dentária']) {
      expect(missingNames).not.toContain(name);
    }
    expect(missing.some((item) => item.name === 'Clareamento Dentário Caseiro')).toBe(true);
    expect(missing).toHaveLength(DEFAULT_PROCEDURES.length - seeded.length);

    const aliased = missingDefaultProcedures(ALIAS_NAMES.map((name, index) => ({
      internalCode: `IMP-${index}`,
      name,
    })));
    const aliasedCodes = aliased.map((item) => item.internalCode);
    const aliasedNames = aliased.map((item) => item.name);
    for (const code of ['CLAR-001', 'PREV-001', 'CIR-001']) expect(aliasedCodes).not.toContain(code);
    for (const name of ALIAS_NAMES) expect(aliasedNames).not.toContain(name);
  });
});
