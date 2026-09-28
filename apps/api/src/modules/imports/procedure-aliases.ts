import { normalizeName } from './import-values';

/**
 * Nomes da planilha de tratamentos que já existem no catálogo com outro nome.
 * O destino é o `internalCode` do procedimento (carga inicial), resolvido dentro da organização.
 * Só entram equivalências do mesmo procedimento: variantes por faces, raízes, dente,
 * arcada, grau de inclusão ou material nunca são unidas a um item genérico.
 */
const PROCEDURE_ALIASES: Record<string, string> = {
  'Profilaxia + Polimento Coronário - Limpeza': 'PREV-001', // Profilaxia
  'Exodontia Simples de Permanente': 'CIR-001', // Extração dentária
  'Clareamento em Consultório': 'CLAR-001', // Clareamento dental (sessão de 60 min em cadeira)
};

/** Lançamentos que aparecem no relatório de tratamentos, mas não são procedimento clínico. */
const NON_TREATMENT_NAMES = ['Aporte de Capital'];

const ALIAS_CODE_BY_KEY = new Map(Object.entries(PROCEDURE_ALIASES).map(([name, code]) => [normalizeName(name), code]));
const NON_TREATMENT_KEYS = new Set(NON_TREATMENT_NAMES.map(normalizeName));

export const PROCEDURE_ALIAS_CODES = [...new Set(ALIAS_CODE_BY_KEY.values())];

export function procedureAliasCode(procedureName: string): string | undefined {
  return ALIAS_CODE_BY_KEY.get(normalizeName(procedureName));
}

export function isNonTreatment(procedureName: string): boolean {
  return NON_TREATMENT_KEYS.has(normalizeName(procedureName));
}
