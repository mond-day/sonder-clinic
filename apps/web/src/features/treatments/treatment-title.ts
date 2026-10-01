/** Sugestão do modal de criação. O campo continua editável; na edição vale o título salvo. */
export const DEFAULT_TREATMENT_TITLE = 'Plano de tratamento';

export function treatmentTitleDefault(mode: 'create' | 'edit', savedTitle?: string | null): string {
  if (mode === 'edit') return savedTitle ?? '';
  return DEFAULT_TREATMENT_TITLE;
}
