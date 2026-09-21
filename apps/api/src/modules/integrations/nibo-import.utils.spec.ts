import { describe, expect, it } from 'vitest';
import {
  amountString,
  buildPayableDescription,
  buildPayableNotes,
  buildReceivableDescription,
  decideNiboPatientLink,
  dueDateOnly,
  hasUsableNiboIdentity,
  matchesNiboFilters,
  niboDocumentAsCpf,
  niboPaymentIdempotencyKey,
  niboScheduleStatus,
  niboSettlementAmount,
  normalizeDocument,
  payableFieldsFromNibo,
  readNiboIdList,
  receivableFieldsFromNibo,
  shouldCreateNiboSettlement,
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
    expect(niboDocumentAsCpf('123.456.789-00')).toBe('12345678900');
    expect(niboDocumentAsCpf('12.345.678/0001-90')).toBeNull();
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

  it('filtra por categoria; centro de custo não dropa item sem CC', () => {
    expect(matchesNiboFilters(baseItem(), { categoryIds: ['cat-a'], costCenterIds: [] })).toBe(true);
    expect(matchesNiboFilters(baseItem(), { categoryIds: ['other'], costCenterIds: [] })).toBe(false);
    expect(matchesNiboFilters(baseItem(), { categoryIds: [], costCenterIds: ['cc-1'] })).toBe(true);
    // Sem costCenterId: passa mesmo com filtro de CC (despesas Nibo sem CC).
    expect(matchesNiboFilters(baseItem({ costCenterId: null }), { categoryIds: [], costCenterIds: ['cc-1'] })).toBe(
      true,
    );
    // CC diferente: exclui.
    expect(matchesNiboFilters(baseItem({ costCenterId: 'cc-other' }), { categoryIds: [], costCenterIds: ['cc-1'] })).toBe(
      false,
    );
  });

  it('compara IDs de categoria/centro sem diferenciar maiúsculas', () => {
    expect(
      matchesNiboFilters(baseItem({ categoryId: 'Cat-A' }), { categoryIds: ['cat-a'], costCenterIds: [] }),
    ).toBe(true);
    expect(readNiboIdList({ receivableCategoryIds: ['AbC', 'abc'] }, 'receivableCategoryIds')).toEqual(['abc']);
  });

  it('descrição amigável: contato + descrição', () => {
    expect(buildReceivableDescription(baseItem())).toBe('Ana — Consulta');
    expect(buildPayableDescription(baseItem({ description: 'Aluguel' }))).toBe('Ana — Aluguel');
    expect(buildReceivableDescription(baseItem({ stakeholderName: null }))).toBe('Consulta');
    expect(buildPayableNotes(baseItem())).toContain('scheduleId=sch-1');
  });

  it('mapeia status e settlement para fluxo de caixa', () => {
    expect(niboScheduleStatus(baseItem())).toBe('OPEN');
    expect(niboScheduleStatus(baseItem({ paidValue: 40 }))).toBe('PARTIALLY_PAID');
    expect(niboScheduleStatus(baseItem({ isPaid: true, paidValue: 100 }))).toBe('PAID');
    expect(shouldCreateNiboSettlement(baseItem())).toBe(false);
    expect(shouldCreateNiboSettlement(baseItem({ isPaid: true, paidValue: 100 }))).toBe(true);
    expect(shouldCreateNiboSettlement(baseItem({ paidValue: 40 }))).toBe(true);
    expect(niboSettlementAmount(baseItem({ paidValue: 40, value: 100 }))).toBe('40.00');
    expect(niboPaymentIdempotencyKey('sch-1')).toBe('nibo-schedule:sch-1');
  });

  it('monta campos de create/update a partir do schedule', () => {
    const receivable = receivableFieldsFromNibo(baseItem({ value: 99.5, paidValue: 20 }));
    expect(receivable.netAmount).toBe('99.50');
    expect(receivable.status).toBe('PARTIALLY_PAID');
    expect(receivable.description).toBe('Ana — Consulta');

    const payable = payableFieldsFromNibo(baseItem({ description: 'Aluguel', paidValue: 100, isPaid: true }));
    expect(payable.paidAmount).toBe('100.00');
    expect(payable.status).toBe('PAID');
    expect(payable.description).toBe('Ana — Aluguel');
    expect(payable.notes).toContain('scheduleId=sch-1');
  });

  it('decide vínculo paciente: CPF, criar, fallback', () => {
    const byCpf = new Map([['12345678900', 'pat-cpf']]);
    const byName = new Map([['bruno silva', 'pat-name']]);

    expect(
      decideNiboPatientLink({
        stakeholderName: 'Ana',
        stakeholderDocument: '123.456.789-00',
        patientsByCpf: byCpf,
        patientsByName: byName,
      }),
    ).toEqual({ action: 'use_existing', patientId: 'pat-cpf', via: 'cpf' });

    expect(
      decideNiboPatientLink({
        stakeholderName: 'Bruno Silva',
        stakeholderDocument: null,
        patientsByCpf: byCpf,
        patientsByName: byName,
      }),
    ).toEqual({ action: 'use_existing', patientId: 'pat-name', via: 'name' });

    expect(
      decideNiboPatientLink({
        stakeholderName: 'Carla Nova',
        stakeholderDocument: '987.654.321-00',
        patientsByCpf: byCpf,
        patientsByName: byName,
      }),
    ).toEqual({ action: 'create', fullName: 'Carla Nova', cpf: '98765432100' });

    expect(
      decideNiboPatientLink({
        stakeholderName: '   ',
        stakeholderDocument: null,
        patientsByCpf: byCpf,
        patientsByName: byName,
      }),
    ).toEqual({ action: 'fallback' });

    expect(hasUsableNiboIdentity({ stakeholderName: 'X', stakeholderDocument: null })).toBe(true);
    expect(hasUsableNiboIdentity({ stakeholderName: null, stakeholderDocument: null })).toBe(false);
  });
});
