/** Mesmas opções do editar: 2 horas, 1 dia, 2 dias. */
export const REMINDER_LEAD_PRESETS = [120, 1440, 2880] as const;

export function reminderLeadLabel(minutes: number) {
  if (minutes % 1440 === 0) return `${minutes / 1440} ${minutes === 1440 ? 'dia' : 'dias'}`;
  if (minutes % 60 === 0) return `${minutes / 60} ${minutes === 60 ? 'hora' : 'horas'}`;
  return `${minutes} min`;
}

/** Inclui antecedências já gravadas fora do preset para o editar continuar exibindo o valor. */
export function reminderLeadOptions(current: number[] = []) {
  const values = [...new Set<number>([...REMINDER_LEAD_PRESETS, ...current])].sort((a, b) => a - b);
  return values.map((value) => ({ value: String(value), label: reminderLeadLabel(value) }));
}

/** Lê o MultiSelect `reminderLeadMinutes` do criar e do editar. */
export function reminderLeadMinutesFromForm(data: FormData): number[] {
  return data.getAll('reminderLeadMinutes').map(Number).filter((value) => Number.isFinite(value) && value > 0);
}
