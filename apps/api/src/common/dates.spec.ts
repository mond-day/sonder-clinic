import { describe, expect, it } from 'vitest';
import { formatBrazilianDate, formatBrazilianDateLong, formatCro, formatCpfFull } from './dates';

describe('dates / identidade documental', () => {
  it('formata YYYY-MM-DD como data brasileira sem fuso', () => {
    expect(formatBrazilianDate('2026-08-14')).toBe('14/08/2026');
    expect(formatBrazilianDateLong('2026-08-14')).toBe('14 de agosto de 2026');
  });

  it('normaliza CRO para CRO-UF número', () => {
    expect(formatCro({ number: '12345', state: 'mt' })).toBe('CRO-MT 12345');
    expect(formatCro('CRO/MT 12345')).toBe('CRO-MT 12345');
    expect(formatCro('CROMT12345')).toBe('CRO-MT 12345');
    expect(formatCro({ number: '99999', state: null })).toBe('CRO 99999');
  });

  it('formata CPF completo', () => {
    expect(formatCpfFull('12345678900')).toBe('123.456.789-00');
  });
});
