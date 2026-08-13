import { describe, expect, it } from 'vitest';
import { formatAnamnesisAnswer, isEmptyAnamnesisAnswer } from './format-answer';

describe('formatAnamnesisAnswer', () => {
  const question = {
    code: 'hypertension',
    label: 'Possui hipertensão?',
    type: 'YES_NO',
    options: [
      { value: 'yes', label: 'Sim' },
      { value: 'no', label: 'Não' },
    ],
  };

  it('traduz boolean e opções', () => {
    expect(formatAnamnesisAnswer(question, true)).toBe('Sim');
    expect(formatAnamnesisAnswer(question, false)).toBe('Não');
    expect(formatAnamnesisAnswer(question, 'yes')).toBe('Sim');
  });

  it('normaliza vazio', () => {
    expect(formatAnamnesisAnswer(question, null)).toBe('—');
    expect(formatAnamnesisAnswer({ ...question, type: 'MULTIPLE_CHOICE' }, [])).toBe('—');
  });

  it('inclui detalhes condicionais', () => {
    expect(formatAnamnesisAnswer(
      { ...question, type: 'YES_NO_DETAILS' },
      { value: 'yes', details: 'Losartana 50 mg' },
    )).toBe('Sim\nLosartana 50 mg');
  });
});

describe('isEmptyAnamnesisAnswer', () => {
  it('detecta vazios', () => {
    expect(isEmptyAnamnesisAnswer(null)).toBe(true);
    expect(isEmptyAnamnesisAnswer('')).toBe(true);
    expect(isEmptyAnamnesisAnswer([])).toBe(true);
    expect(isEmptyAnamnesisAnswer({ value: '' })).toBe(true);
    expect(isEmptyAnamnesisAnswer('yes')).toBe(false);
    expect(isEmptyAnamnesisAnswer(0)).toBe(false);
  });
});
