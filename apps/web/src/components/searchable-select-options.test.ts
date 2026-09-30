import { describe, expect, it } from 'vitest';
import { filterSelectOptions, measureComboboxPopover, type SelectOption } from './searchable-select-options';

const procedures: SelectOption[] = [
  { value: '1', label: 'Restauração em resina', description: 'REST-001' },
  { value: '2', label: 'Profilaxia', description: 'PREV-001 · 99000001' },
  { value: '3', label: 'Exodontia simples', description: 'CIR-001' },
];

describe('filterSelectOptions', () => {
  it('mostra o catálogo inteiro ao abrir, sem exigir caracteres', () => {
    expect(filterSelectOptions(procedures, '')).toEqual(procedures);
    expect(filterSelectOptions(procedures, '   ')).toEqual(procedures);
  });

  it('busca por parte do nome, ignorando acento e maiúsculas', () => {
    expect(filterSelectOptions(procedures, 'restauracao').map((item) => item.value)).toEqual(['1']);
    expect(filterSelectOptions(procedures, 'PROFIL').map((item) => item.value)).toEqual(['2']);
  });

  it('busca por código interno e por código TUSS', () => {
    expect(filterSelectOptions(procedures, 'cir-001').map((item) => item.value)).toEqual(['3']);
    expect(filterSelectOptions(procedures, '99000001').map((item) => item.value)).toEqual(['2']);
  });

  it('não inventa opção quando nada casa', () => {
    expect(filterSelectOptions(procedures, 'implante zigomático')).toEqual([]);
    expect(filterSelectOptions([], 'limpeza')).toEqual([]);
  });
});

describe('measureComboboxPopover', () => {
  it('abre para baixo quando há espaço no viewport', () => {
    const box = measureComboboxPopover(
      { top: 120, bottom: 160, left: 40, width: 280 },
      { width: 1200, height: 800 },
    );
    expect(box.top).toBe(166);
    expect(box.bottom).toBe('auto');
    expect(box.maxHeight).toBeGreaterThan(140);
  });

  it('abre para cima quando o campo está no fim da tela', () => {
    const box = measureComboboxPopover(
      { top: 720, bottom: 760, left: 40, width: 280 },
      { width: 1200, height: 800 },
    );
    expect(box.top).toBe('auto');
    expect(box.bottom).not.toBe('auto');
    expect(box.maxHeight).toBeGreaterThan(140);
  });
});
