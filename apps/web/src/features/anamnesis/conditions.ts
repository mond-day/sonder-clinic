export type ConditionOperation =
  | 'EQUALS' | 'NOT_EQUALS' | 'INCLUDES' | 'GREATER_THAN' | 'LESS_THAN' | 'IS_EMPTY' | 'IS_NOT_EMPTY';

export type Condition = {
  questionCode: string;
  operation: ConditionOperation;
  value?: unknown;
};

export type ConditionGroup = {
  operator: 'AND' | 'OR';
  conditions: Condition[];
};

export type AlertRule = {
  id: string;
  when: ConditionGroup;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  messageTemplate: string;
  createPatientAlert: boolean;
  blockFinalization?: boolean;
};

export type RiskRule = {
  id: string;
  label: string;
  when: ConditionGroup;
  contribution: number;
  level?: 'LOW' | 'MODERATE' | 'HIGH';
  messageTemplate?: string;
};

export const CONDITION_OPERATIONS: Array<{ value: ConditionOperation; label: string }> = [
  { value: 'EQUALS', label: 'Igual a' },
  { value: 'NOT_EQUALS', label: 'Diferente de' },
  { value: 'INCLUDES', label: 'Inclui' },
  { value: 'GREATER_THAN', label: 'Maior que' },
  { value: 'LESS_THAN', label: 'Menor que' },
  { value: 'IS_EMPTY', label: 'Vazio' },
  { value: 'IS_NOT_EMPTY', label: 'Preenchido' },
];

function answerValue(answers: Record<string, unknown>, code: string) {
  const answer = answers[code];
  if (typeof answer === 'object' && answer && 'value' in answer) {
    return (answer as { value: unknown }).value;
  }
  return answer;
}

export function evaluateCondition(answers: Record<string, unknown>, condition: Condition): boolean {
  const value = answerValue(answers, condition.questionCode);
  switch (condition.operation) {
    case 'EQUALS': return value === condition.value;
    case 'NOT_EQUALS': return value !== condition.value;
    case 'INCLUDES': return Array.isArray(value) && value.includes(condition.value);
    case 'GREATER_THAN': return Number(value) > Number(condition.value);
    case 'LESS_THAN': return Number(value) < Number(condition.value);
    case 'IS_EMPTY': return value == null || value === '' || (Array.isArray(value) && value.length === 0);
    case 'IS_NOT_EMPTY': return !(value == null || value === '' || (Array.isArray(value) && value.length === 0));
    default: return false;
  }
}

export function isGroupVisible(answers: Record<string, unknown>, group?: ConditionGroup | null): boolean {
  if (!group || !group.conditions?.length) return true;
  const results = group.conditions.map((condition) => evaluateCondition(answers, condition));
  return group.operator === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

export function emptyConditionGroup(): ConditionGroup {
  return {
    operator: 'AND',
    conditions: [{ questionCode: '', operation: 'EQUALS', value: 'yes' }],
  };
}

export function emptyAlertRule(): AlertRule {
  return {
    id: `alert_${Math.random().toString(36).slice(2, 9)}`,
    when: emptyConditionGroup(),
    type: 'CLINICAL',
    severity: 'WARNING',
    messageTemplate: 'Atenção clínica',
    createPatientAlert: true,
    blockFinalization: false,
  };
}

export function emptyRiskRule(): RiskRule {
  return {
    id: `risk_${Math.random().toString(36).slice(2, 9)}`,
    label: 'Contribuição de risco',
    when: emptyConditionGroup(),
    contribution: 10,
    level: 'MODERATE',
    messageTemplate: '',
  };
}
