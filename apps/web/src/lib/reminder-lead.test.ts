import { describe, expect, it } from 'vitest';
import { reminderLeadLabel, reminderLeadMinutesFromForm, reminderLeadOptions } from './reminder-lead';

describe('antecedência de lembrete', () => {
  it('oferece 2 horas, 1 dia e 2 dias', () => {
    expect(reminderLeadOptions()).toEqual([
      { value: '120', label: '2 horas' },
      { value: '1440', label: '1 dia' },
      { value: '2880', label: '2 dias' },
    ]);
  });

  it('mantém antecedência já gravada fora do preset', () => {
    expect(reminderLeadOptions([90]).map((option) => option.value)).toEqual(['90', '120', '1440', '2880']);
    expect(reminderLeadLabel(90)).toBe('90 min');
  });

  it('lê só minutos positivos do formulário', () => {
    const data = new FormData();
    data.append('reminderLeadMinutes', '120');
    data.append('reminderLeadMinutes', '2880');
    data.append('reminderLeadMinutes', '0');
    data.append('reminderLeadMinutes', 'abc');
    expect(reminderLeadMinutesFromForm(data)).toEqual([120, 2880]);
    expect(reminderLeadMinutesFromForm(new FormData())).toEqual([]);
  });
});
