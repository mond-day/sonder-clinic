import { describe, expect, it } from 'vitest';
import { DEFAULT_TREATMENT_TITLE, treatmentTitleDefault } from './treatment-title';

describe('título padrão do tratamento', () => {
  it('sugere um título editável só na criação e preserva o título salvo na edição', () => {
    expect(DEFAULT_TREATMENT_TITLE.length).toBeGreaterThanOrEqual(3);
    expect(treatmentTitleDefault('create')).toBe('Plano de tratamento');
    expect(treatmentTitleDefault('create', 'Reabilitação do outro paciente')).toBe('Plano de tratamento');
    expect(treatmentTitleDefault('edit', 'Reabilitação estética anterior')).toBe('Reabilitação estética anterior');
    expect(treatmentTitleDefault('edit', '')).toBe('');
    expect(treatmentTitleDefault('edit', null)).toBe('');
  });
});
