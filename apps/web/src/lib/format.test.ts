import { describe, expect, it } from 'vitest';
import { ageLabel, currency, initials, maskCpf, presentationLabel, statusTone } from './format';

describe('format helpers', () => {
  it('mascara CPF sem expor dígitos completos', () => {
    expect(maskCpf('12345678901')).toBe('•••.456.***-**');
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
  });

  it('formata moeda em pt-BR', () => {
    expect(currency(1234.5)).toContain('1.234,50');
  });
});
