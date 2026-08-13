import { isGroupVisible, type ConditionGroup } from './conditions';

export type AnamnesisOption = { value: string; label: string };
export type AnamnesisQuestion = {
  id?: string;
  code: string;
  label: string;
  type: string;
  options?: AnamnesisOption[];
  unit?: string;
  details?: { enabled?: boolean; label?: string };
  visibleWhen?: ConditionGroup | null;
};

export type AnamnesisSection = {
  id?: string;
  title?: string;
  name?: string;
  questions?: AnamnesisQuestion[];
  visibleWhen?: ConditionGroup | null;
};

export type AnamnesisSchema = {
  sections?: AnamnesisSection[];
};

function unwrapAnswer(raw: unknown): { value: unknown; details?: string } {
  if (typeof raw === 'object' && raw && 'value' in raw) {
    const obj = raw as { value: unknown; details?: unknown };
    return {
      value: obj.value,
      details: obj.details == null || obj.details === '' ? undefined : String(obj.details),
    };
  }
  return { value: raw };
}

function optionLabel(question: AnamnesisQuestion, code: unknown): string {
  const key = String(code ?? '');
  const match = (question.options ?? []).find((option) => option.value === key);
  if (match?.label) return match.label;
  if (key === 'true' || key === 'yes') return 'Sim';
  if (key === 'false' || key === 'no') return 'Não';
  if (key === 'unknown') return 'Não sei';
  return key || '—';
}

/** Resposta sem valor útil (não deve aparecer na impressão). */
export function isEmptyAnamnesisAnswer(raw: unknown): boolean {
  const { value } = unwrapAnswer(raw);
  return value == null || value === '' || value === false
    || (Array.isArray(value) && value.length === 0);
}

/** Formata valor de resposta com labels humanas do template (nunca JSON cru). */
export function formatAnamnesisAnswer(question: AnamnesisQuestion, raw: unknown): string {
  const { value, details } = unwrapAnswer(raw);

  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (Array.isArray(value)) {
    if (!value.length) return '—';
    const labels = value.map((item) => optionLabel(question, item));
    const base = labels.join(', ');
    return details ? `${base}\n${details}` : base;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const base = question.unit ? `${value} ${question.unit}` : String(value);
    return details ? `${base}\n${details}` : base;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '—';
    const looksLikeChoice = (question.options?.length ?? 0) > 0
      || ['YES_NO', 'YES_NO_UNKNOWN', 'YES_NO_DETAILS', 'SINGLE_CHOICE', 'SINGLE_CHOICE_DETAILS', 'RISK_LEVEL'].includes(question.type);
    const base = looksLikeChoice ? optionLabel(question, trimmed) : trimmed;
    return details ? `${base}\n${details}` : base;
  }

  return '—';
}

export function visibleAnswerRows(
  schema: AnamnesisSchema | null | undefined,
  answers: Record<string, unknown>,
): Array<{ sectionTitle: string; question: AnamnesisQuestion; formatted: string }> {
  const rows: Array<{ sectionTitle: string; question: AnamnesisQuestion; formatted: string }> = [];
  for (const section of schema?.sections ?? []) {
    if (!isGroupVisible(answers, section.visibleWhen)) continue;
    const sectionTitle = section.title || section.name || 'Seção';
    for (const question of section.questions ?? []) {
      if (!isGroupVisible(answers, question.visibleWhen)) continue;
      rows.push({
        sectionTitle,
        question,
        formatted: formatAnamnesisAnswer(question, answers[question.code]),
      });
    }
  }
  return rows;
}
