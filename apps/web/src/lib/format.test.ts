import { describe, expect, it } from 'vitest';
import {
  ageLabel,
  cpfDigits,
  currency,
  dateInputToIso,
  dateOnly,
  daysUntilBirthday,
  formatBrazilianDate,
  formatBrazilianDateLong,
  formatCpf,
  formatCro,
  formatPhone,
  formatPostalCode,
  initials,
  isMinorFromBirthDate,
  maskCpf,
  maskCpfInput,
  maskPhoneInput,
  phoneDigits,
  presentationLabel,
  statusTone,
  toDateInputValue,
} from './format';

describe('format helpers', () => {
  it('formata CPF completo', () => {
    expect(formatCpf('12345678901')).toBe('123.456.789-01');
  });

  it('mascara CPF progressivamente no input', () => {
    expect(maskCpfInput('123')).toBe('123');
    expect(maskCpfInput('123456')).toBe('123.456');
    expect(maskCpfInput('12345678901')).toBe('123.456.789-01');
    expect(cpfDigits('123.456.789-01')).toBe('12345678901');
  });

  it('detecta menor de idade pela data de nascimento', () => {
    expect(isMinorFromBirthDate('2015-01-01', new Date(2026, 7, 12))).toBe(true);
    expect(isMinorFromBirthDate('2000-01-01', new Date(2026, 7, 12))).toBe(false);
    expect(isMinorFromBirthDate('2008-08-12', new Date(2026, 7, 12))).toBe(false);
    expect(isMinorFromBirthDate('2008-08-13', new Date(2026, 7, 12))).toBe(true);
  });

  it('mascara CPF sem expor dígitos completos', () => {
    expect(maskCpf('12345678901')).toBe('•••.456.***-**');
  });

  it('formata telefone fixo, móvel e com DDI', () => {
    expect(formatPhone('66999678901')).toBe('(66) 99967-8901');
    expect(formatPhone('6633211234')).toBe('(66) 3321-1234');
    expect(formatPhone('+5566999678901')).toBe('+55 (66) 99967-8901');
    expect(formatPhone('5566999678901')).toBe('+55 (66) 99967-8901');
  });

  it('mascara telefone progressivamente no input', () => {
    expect(maskPhoneInput('6699')).toBe('(66) 99');
    expect(maskPhoneInput('66999678901')).toBe('(66) 99967-8901');
    expect(phoneDigits('(66) 99967-8901')).toBe('66999678901');
  });

  it('formata CEP', () => {
    expect(formatPostalCode('01310100')).toBe('01310-100');
  });

  it('calcula dias até o aniversário', () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(daysUntilBirthday(iso)).toBe(0);
  });

  it('gera iniciais', () => {
    expect(initials('Marina Ferreira')).toBe('MF');
  });

  it('mapeia status para tom acessível', () => {
    expect(statusTone('CONFIRMED')).toBe('green');
    expect(statusTone('OVERDUE')).toBe('red');
  });

  it('calcula idade a partir da data de nascimento', () => {
    expect(ageLabel('1990-01-01')).toMatch(/\d+ anos/);
  });

  it('traduz enums sem alterar seus valores de domínio', () => {
    expect(presentationLabel('NO_SHOW')).toBe('Falta');
    expect(presentationLabel('PARTIALLY_APPROVED')).toBe('Parcialmente aprovado');
    expect(presentationLabel('IN_LAB')).toBe('No laboratório');
    expect(presentationLabel('ATTESTATION')).toBe('Atestado');
    expect(presentationLabel('CERTIFICATE')).toBe('Atestado');
    expect(presentationLabel('PRESCRIPTION')).toBe('Receita');
  });

  it('formata moeda em pt-BR', () => {
    expect(currency(1234.5)).toContain('1.234,50');
  });

  it('converte data local para input e ISO sem virar o dia', () => {
    expect(toDateInputValue(new Date(2026, 7, 13))).toBe('2026-08-13');
    expect(dateInputToIso('2026-08-13')).toBe('2026-08-13T12:00:00');
    expect(dateInputToIso('invalid')).toBeUndefined();
  });

  it('formata datas civis ISO em pt-BR sem deslocar o dia', () => {
    expect(formatBrazilianDate('2026-08-14')).toBe('14/08/2026');
    expect(dateOnly('2026-08-14')).toBe('14/08/2026');
    expect(formatBrazilianDateLong('2026-08-14')).toBe('14 de agosto de 2026');
    expect(formatCro({ number: '12345', state: 'mt' })).toBe('CRO-MT 12345');
  });
});
