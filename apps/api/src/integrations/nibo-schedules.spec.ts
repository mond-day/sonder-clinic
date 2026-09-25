import { describe, expect, it } from 'vitest';
import { parseNiboScheduleRow } from './nibo-schedules';

describe('parseNiboScheduleRow', () => {
  it('extrai campos essenciais do schedule credit/debit', () => {
    const parsed = parseNiboScheduleRow({
      scheduleId: 'abc-123',
      description: 'Mensalidade',
      value: 250.5,
      paidValue: 50,
      openValue: 200.5,
      isPaid: false,
      dueDate: '2026-10-01T00:00:00',
      category: { id: 'cat-1', name: 'Receitas clínicas' },
      costCenters: [{ costCenterId: 'cc-9', costCenterDescription: 'Unidade Centro', percent: 100 }],
      stakeholder: { name: 'Maria Silva', cpfCnpj: '529.982.247-25' },
    });
    expect(parsed).toMatchObject({
      scheduleId: 'abc-123',
      description: 'Mensalidade',
      value: 250.5,
      paidValue: 50,
      categoryId: 'cat-1',
      costCenterId: 'cc-9',
      stakeholderName: 'Maria Silva',
      stakeholderDocument: '529.982.247-25',
    });
  });

  it('retorna null sem scheduleId ou dueDate', () => {
    expect(parseNiboScheduleRow({ description: 'x', value: 1 })).toBeNull();
    expect(parseNiboScheduleRow({ scheduleId: 'x', value: 1 })).toBeNull();
  });

  it('lê costCenterId no topo e recorrência por isRecurrent/recurrenceId', () => {
    const withTopCc = parseNiboScheduleRow({
      scheduleId: 'd-1',
      description: 'Aluguel',
      value: 100,
      paidValue: 0,
      dueDate: '2026-10-01',
      costCenterId: 'cc-top',
      costCenterDescription: 'Odontologia',
      isRecurrent: true,
      recurrenceId: 'rec-1',
    });
    expect(withTopCc).toMatchObject({
      costCenterId: 'cc-top',
      costCenterName: 'Odontologia',
      hasRecurrence: true,
      recurrenceId: 'rec-1',
    });
  });
});
