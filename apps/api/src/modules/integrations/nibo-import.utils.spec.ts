import { describe, expect, it } from 'vitest';
import {
  amountString,
  buildPayableNotes,
  buildReceivableDescription,
  dueDateOnly,
  matchesNiboFilters,
  niboScheduleStatus,
  normalizeDocument,
  payableFieldsFromNibo,
  readNiboIdList,
  receivableFieldsFromNibo,
} from './nibo-import.utils';
import type { NiboScheduleItem } from '../../integrations/nibo-schedules';

const baseItem = (overrides: Partial<NiboScheduleItem> = {}): NiboScheduleItem => ({
  scheduleId: 'sch-1',
  description: 'Consulta',
  value: 100,
  paidValue: 0,
  openValue: 100,
  isPaid: false,
  dueDate: '2026-09-01',
  categoryId: 'cat-a',
  categoryName: 'Receitas',
  costCenterId: 'cc-1',
  costCenterName: 'Clínica',
  stakeholderName: 'Ana',
  stakeholderDocument: '123.456.789-00',
  ...overrides,
});

describe('nibo-import.utils', () => {
  it('normaliza documento e data', () => {
    expect(normalizeDocument('123.456.789-00')).toBe('12345678900');
    expect(dueDateOnly('2026-09-15T12:00:00Z')).toBe('2026-09-15');
    expect(amountString(12.5)).toBe('12.50');
  });

  it('lê listas de IDs do configuration', () => {
    expect(readNiboIdList({ receivableCategoryIds: ['a', 'b', 'a'] }, 'receivableCategoryIds')).toEqual([
      'a',
      'b',
    ]);
    expect(readNiboIdList({ receivableCategoryId: 'x' }, 'receivableCategoryIds', 'receivableCategoryId')).toEqual([
      'x',
    ]);
  });

  it('filtra por categoria e centro de custo', () => {
    expect(matchesNiboFilters(baseItem(), { categoryIds: ['cat-a'], costCenterIds: [] })).toBe(true);
    expect(matchesNiboFilters(baseItem(), { categoryIds: ['other'], costCenterIds: [] })).toBe(false);
    expect(matchesNiboFilters(baseItem(), { categoryIds: [], costCenterIds: ['cc-1'] })).toBe(true);
    expect(matchesNiboFilters(baseItem({ costCenterId: null }), { categoryIds: [], costCenterIds: ['cc-1'] })).toBe(
      false,
    );
  });

  it('compara IDs de categoria/centro sem diferenciar maiúsculas', () => {
    expect(
      matchesNiboFilters(baseItem({ categoryId: 'Cat-A' }), { categoryIds: ['cat-a'], costCenterIds: [] }),
    ).toBe(true);
    expect(readNiboIdList({ receivableCategoryIds: ['AbC', 'abc'] }, 'receivableCategoryIds')).toEqual(['abc']);
  });

  it('mapeia status e textos', () => {
    expect(niboScheduleStatus(baseItem())).toBe('OPEN');
    expect(niboScheduleStatus(baseItem({ paidValue: 40 }))).toBe('PARTIALLY_PAID');
    expect(niboScheduleStatus(baseItem({ isPaid: true, paidValue: 100 }))).toBe('PAID');
    expect(buildReceivableDescription(baseItem())).toBe('Consulta — Ana');
    expect(buildPayableNotes(baseItem())).toContain('scheduleId=sch-1');
  });

  it('monta campos de create/update a partir do schedule', () => {
    const receivable = receivableFieldsFromNibo(baseItem({ value: 99.5, paidValue: 20 }));
    expect(receivable.netAmount).toBe('99.50');
    expect(receivable.status).toBe('PARTIALLY_PAID');
    expect(receivable.description).toContain('Ana');

    const payable = payableFieldsFromNibo(baseItem({ description: 'Aluguel', paidValue: 100, isPaid: true }));
    expect(payable.paidAmount).toBe('100.00');
    expect(payable.status).toBe('PAID');
    expect(payable.notes).toContain('scheduleId=sch-1');
  });
});
