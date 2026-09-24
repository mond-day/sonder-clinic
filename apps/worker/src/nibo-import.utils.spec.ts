import { describe, expect, it } from 'vitest';
import {
  buildReceivableDescription,
  decideNiboPatientLink,
  matchesFilters,
  shouldCreateNiboSettlement,
} from './nibo-import.utils';

describe('worker nibo-import.utils', () => {
  it('descrição contato + descrição', () => {
    expect(
      buildReceivableDescription({
        scheduleId: '1',
        description: 'Consulta',
        stakeholderName: 'Ana',
      }),
    ).toBe('Ana — Consulta');
  });

  it('filtro de CC exige match; sem filtro importa todos', () => {
    expect(
      matchesFilters(
        { categoryId: 'cat', costCenterId: null },
        { categoryIds: [], costCenterIds: [] },
      ),
    ).toBe(true);
    expect(
      matchesFilters(
        { categoryId: 'cat', costCenterId: null },
        { categoryIds: [], costCenterIds: ['cc-1'] },
      ),
    ).toBe(false);
    expect(
      matchesFilters(
        { categoryId: 'cat', costCenterId: 'cc-1' },
        { categoryIds: [], costCenterIds: ['cc-1'] },
      ),
    ).toBe(true);
    expect(
      matchesFilters(
        { categoryId: 'cat', costCenterId: 'cc-2' },
        { categoryIds: [], costCenterIds: ['cc-1'] },
      ),
    ).toBe(false);
  });

  it('cria settlement quando pago', () => {
    expect(shouldCreateNiboSettlement({ isPaid: true, value: 10, paidValue: 10 })).toBe(true);
    expect(shouldCreateNiboSettlement({ isPaid: true, value: 10, paidValue: 0 })).toBe(true);
    expect(shouldCreateNiboSettlement({ isPaid: false, value: 10, paidValue: 0 })).toBe(false);
  });

  it('decide paciente por CPF ou cria', () => {
    const decision = decideNiboPatientLink({
      stakeholderName: 'Nova',
      stakeholderDocument: '11144477735',
      patientsByCpf: new Map(),
      patientsByName: new Map(),
    });
    expect(decision).toEqual({ action: 'create', fullName: 'Nova', cpf: '11144477735' });
  });
});
