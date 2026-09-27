import { describe, expect, it } from 'vitest';
import { syntheticCpf } from './import-test-fixtures';
import {
  civilToUtc,
  isValidCpf,
  maskCpf,
  normalizePhone,
  normalizeState,
  optionalText,
  parseDateTime,
  parseMoney,
  parseTime,
  splitList,
  sumMoney,
  withOccurrence,
  zonedToUtc,
} from './import-values';

describe('import-values', () => {
  it('valida CPF pelos dígitos verificadores', () => {
    const cpf = syntheticCpf('123456789');
    expect(isValidCpf(cpf)).toBe(true);
    expect(isValidCpf(`${cpf.slice(0, 10)}${(Number(cpf[10]) + 1) % 10}`)).toBe(false);
    expect(isValidCpf('11111111111')).toBe(false);
    expect(maskCpf(cpf)).toBe(`***.***.*${cpf[8]}-${cpf.slice(9)}`);
  });

  it('normaliza telefones brasileiros e rejeita número sem DDD', () => {
    expect(normalizePhone('(65) 99999-0000')).toBe('65999990000');
    expect(normalizePhone('(65) 3333-0000')).toBe('6533330000');
    expect(normalizePhone('+55 65999990000')).toBe('65999990000');
    expect(normalizePhone('999990000')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });

  it('interpreta valores em reais', () => {
    expect(parseMoney('R$ 1.234,56')).toBe('1234.56');
    expect(parseMoney('350,00')).toBe('350.00');
    expect(parseMoney(89.9)).toBe('89.90');
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney(-10)).toBeNull();
    expect(sumMoney(['0.10', '0.20', '1234.56'])).toBe('1234.86');
  });

  it('interpreta datas de célula e de texto', () => {
    expect(parseDateTime(new Date(Date.UTC(2026, 2, 10)))).toEqual({ year: 2026, month: 3, day: 10, hour: 0, minute: 0 });
    expect(parseDateTime('10/03/2026 14:30')).toEqual({ year: 2026, month: 3, day: 10, hour: 14, minute: 30 });
    expect(parseDateTime('31/02/2026')).toBeNull();
    expect(parseDateTime('-')).toBeNull();
    expect(parseTime('08:05')).toEqual({ hour: 8, minute: 5 });
    expect(parseTime('25:00')).toBeNull();
  });

  it('converte horário de parede do fuso da clínica para UTC', () => {
    expect(zonedToUtc({ year: 2026, month: 3, day: 10, hour: 9, minute: 0 }, 'America/Cuiaba').toISOString())
      .toBe('2026-03-10T13:00:00.000Z');
    expect(zonedToUtc({ year: 2026, month: 3, day: 10, hour: 9, minute: 0 }, 'America/Sao_Paulo').toISOString())
      .toBe('2026-03-10T12:00:00.000Z');
    expect(civilToUtc({ year: 2026, month: 3, day: 10, hour: 0, minute: 0 }, 'America/Cuiaba').toISOString())
      .toBe('2026-03-10T16:00:00.000Z');
  });

  it('trata listas, traço vazio, UF e ocorrências repetidas', () => {
    expect(splitList('Retorno, Avaliação, Retorno, -')).toEqual(['Retorno', 'Avaliação']);
    expect(optionalText('-')).toBeUndefined();
    expect(normalizeState('Mato Grosso')).toBe('MT');
    expect(normalizeState('mt')).toBe('MT');
    expect(normalizeState('Atlântida')).toBeNull();
    expect(withOccurrence(['a', 'b', 'a'])).toEqual(['a#1', 'b#1', 'a#2']);
  });
});
