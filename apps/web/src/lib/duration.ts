/** Duração de consulta em minutos, de 15 em 15. */
export const APPOINTMENT_DURATIONS = Array.from({ length: 16 }, (_, index) => (index + 1) * 15);

export function nearestDurationMinutes(value: number, fallback = 30): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  const snapped = Math.round(value / 15) * 15;
  if (APPOINTMENT_DURATIONS.includes(snapped)) return snapped;
  return APPOINTMENT_DURATIONS.reduce((best, option) => (
    Math.abs(option - value) < Math.abs(best - value) ? option : best
  ), fallback);
}
