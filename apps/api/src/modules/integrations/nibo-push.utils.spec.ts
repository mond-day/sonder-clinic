import { describe, expect, it } from 'vitest';
import {
  buildCreditSchedulePayload,
  buildDebitSchedulePayload,
  extractNiboScheduleId,
  extractNiboStakeholderId,
  firstConfiguredId,
  niboReference,
  readNiboAccountId,
  toNiboAmount,
  toNiboDate,
} from './nibo-push.utils';

describe('nibo-push.utils', () => {
  it('firstConfiguredId ignora vazios', () => {
    expect(firstConfiguredId(['', '  ', 'abc'])).toBe('abc');
    expect(firstConfiguredId([])).toBeNull();
  });

  it('toNiboDate e toNiboAmount normalizam', () => {
    expect(toNiboDate('2026-09-17T12:00:00.000Z')).toBe('2026-09-17');
    expect(toNiboDate(new Date('2026-01-02T00:00:00.000Z'))).toBe('2026-01-02');
    expect(toNiboAmount('10.555')).toBe(10.56);
    expect(toNiboAmount(-1)).toBe(0);
  });

  it('extract ids de respostas Nibo', () => {
    expect(extractNiboScheduleId('"abc-123"')).toBe('abc-123');
    expect(extractNiboScheduleId({ scheduleId: 's1' })).toBe('s1');
    expect(extractNiboStakeholderId({ id: 'c1' })).toBe('c1');
  });

  it('lê accountId da configuration', () => {
    expect(readNiboAccountId({ accountId: 'acc-1' })).toBe('acc-1');
    expect(readNiboAccountId({ defaultAccountId: 'acc-2' })).toBe('acc-2');
    expect(readNiboAccountId({})).toBeNull();
  });

  it('monta payloads credit/debit', () => {
    expect(niboReference('Receivable', 'r1')).toBe('sonder:receivable:r1');
    expect(buildCreditSchedulePayload({
      stakeholderId: 'st1',
      description: 'Consulta',
      dueDate: '2026-09-20',
      amount: 150,
      categoryId: 'cat1',
      costCenterId: null,
      reference: 'sonder:receivable:r1',
    })).toMatchObject({
      stakeholderId: 'st1',
      categories: [{ categoryId: 'cat1', value: 150 }],
    });
    expect(buildCreditSchedulePayload({
      stakeholderId: 'st1',
      description: 'Consulta Odontologia',
      dueDate: '2026-09-20',
      amount: 150,
      categoryId: 'cat1',
      costCenterId: 'cc-odontologia',
      reference: 'sonder:receivable:r1',
    })).toMatchObject({
      costCenterValueType: 0,
      costCenters: [{ costCenterId: 'cc-odontologia', value: 150 }],
      categories: [{ categoryId: 'cat1', value: 150 }],
    });
    expect(buildDebitSchedulePayload({
      stakeholderId: 'sup1',
      description: 'Material',
      dueDate: '2026-09-21',
      amount: 80,
      categoryId: 'cat1',
      costCenterId: 'cc1',
      reference: 'sonder:payable:p1',
    }).costCenters).toEqual([{ costCenterId: 'cc1', value: 80 }]);
  });
});
