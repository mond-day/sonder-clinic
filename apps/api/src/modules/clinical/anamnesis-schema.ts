import { z } from 'zod';

const conditionSchema = z.object({
  questionCode: z.string().min(1),
  operation: z.enum([
    'EQUALS', 'NOT_EQUALS', 'INCLUDES', 'GREATER_THAN', 'LESS_THAN', 'IS_EMPTY', 'IS_NOT_EMPTY',
  ]),
  value: z.unknown().optional(),
});

const conditionGroupSchema: z.ZodType<{
  operator: 'AND' | 'OR';
  conditions: Array<z.infer<typeof conditionSchema>>;
}> = z.object({
  operator: z.enum(['AND', 'OR']),
  conditions: z.array(conditionSchema).min(1),
});

const questionTypeSchema = z.enum([
  'SHORT_TEXT', 'LONG_TEXT', 'YES_NO', 'YES_NO_UNKNOWN', 'YES_NO_DETAILS',
  'SINGLE_CHOICE', 'SINGLE_CHOICE_DETAILS', 'MULTIPLE_CHOICE', 'MULTIPLE_CHOICE_DETAILS',
  'NUMBER', 'NUMBER_UNIT', 'DATE', 'PHONE_CHANNEL', 'SCALE_0_10', 'RISK_LEVEL',
  'REPEATER_MEDICATION', 'ACKNOWLEDGEMENT',
]);

const questionSchema = z.object({
  id: z.string(),
  code: z.string(),
  label: z.string(),
  helpText: z.string().optional(),
  type: questionTypeSchema,
  required: z.boolean(),
  order: z.number().int(),
  options: z.array(z.object({
    value: z.string(),
    label: z.string(),
    color: z.string().optional(),
  })).optional(),
  defaultValue: z.unknown().optional(),
  placeholder: z.string().optional(),
  unit: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  visibleWhen: conditionGroupSchema.optional(),
  details: z.object({
    enabled: z.boolean(),
    label: z.string(),
    type: z.enum(['SHORT_TEXT', 'LONG_TEXT', 'REPEATER_MEDICATION']),
    requiredWhenVisible: z.boolean().optional(),
  }).optional(),
  alertRules: z.array(z.object({
    id: z.string(),
    when: conditionGroupSchema,
    type: z.string(),
    severity: z.enum(['INFO', 'WARNING', 'CRITICAL']),
    messageTemplate: z.string(),
    createPatientAlert: z.boolean(),
    blockFinalization: z.boolean().optional(),
  })).optional(),
});

const sectionSchema = z.object({
  id: z.string(),
  code: z.string(),
  title: z.string(),
  description: z.string().optional(),
  order: z.number().int(),
  visibleWhen: conditionGroupSchema.optional(),
  questions: z.array(questionSchema).min(1),
});

const riskRuleSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  when: conditionGroupSchema,
  contribution: z.number().int().min(0).max(100).default(10),
  level: z.enum(['LOW', 'MODERATE', 'HIGH']).optional(),
  messageTemplate: z.string().optional(),
});

const completionRuleSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  when: conditionGroupSchema.optional(),
  requiredQuestionCodes: z.array(z.string()).default([]),
});

export const anamnesisSchemaSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().min(2),
  audience: z.enum(['ADULT', 'CHILD', 'ELDERLY', 'PREGNANT', 'CUSTOM']),
  sections: z.array(sectionSchema).min(1),
  riskRules: z.array(riskRuleSchema).default([]),
  // Formato legado (ex.: { type: 'REQUIRED_ACKNOWLEDGEMENTS' }) permanece aceito.
  completionRules: z.array(z.union([completionRuleSchema, z.record(z.unknown())])).default([]),
});

export type AnamnesisSchema = z.infer<typeof anamnesisSchemaSchema>;
export type AnamnesisQuestion = z.infer<typeof questionSchema>;
export type ConditionGroup = z.infer<typeof conditionGroupSchema>;
export type RiskRule = z.infer<typeof riskRuleSchema>;

export function parseAnamnesisSchema(value: unknown): AnamnesisSchema {
  return anamnesisSchemaSchema.parse(value);
}

function evaluateCondition(
  answers: Record<string, unknown>,
  condition: z.infer<typeof conditionSchema>,
): boolean {
  const answer = answers[condition.questionCode];
  const value = typeof answer === 'object' && answer && 'value' in answer
    ? (answer as { value: unknown }).value
    : answer;
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

export function isGroupVisible(
  answers: Record<string, unknown>,
  group?: z.infer<typeof conditionGroupSchema>,
): boolean {
  if (!group) return true;
  const results = group.conditions.map((condition) => evaluateCondition(answers, condition));
  return group.operator === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

export function flattenQuestions(schema: AnamnesisSchema) {
  return schema.sections
    .slice()
    .sort((a, b) => a.order - b.order)
    .flatMap((section) => section.questions.slice().sort((a, b) => a.order - b.order));
}

export function validateAnswers(schema: AnamnesisSchema, answers: Record<string, unknown>) {
  const errors: string[] = [];
  const visibleCodes = new Set<string>();
  for (const section of schema.sections) {
    if (!isGroupVisible(answers, section.visibleWhen)) continue;
    for (const question of section.questions) {
      if (!isGroupVisible(answers, question.visibleWhen)) continue;
      visibleCodes.add(question.code);
      const raw = answers[question.code];
      const value = typeof raw === 'object' && raw && 'value' in raw
        ? (raw as { value: unknown }).value
        : raw;
      const details = typeof raw === 'object' && raw && 'details' in raw
        ? (raw as { details?: unknown }).details
        : undefined;
      if (question.required) {
        const empty = value == null || value === '' || value === false
          || (Array.isArray(value) && value.length === 0);
        if (empty) errors.push(`Pergunta obrigatória: ${question.label}`);
      }
      if (question.type === 'ACKNOWLEDGEMENT' && question.required && value !== true && value !== 'yes') {
        errors.push(`Aceite obrigatório: ${question.label}`);
      }
      if (question.details?.enabled && question.details.requiredWhenVisible) {
        const showDetails = value === 'yes' || value === true
          || (Array.isArray(value) && value.length > 0);
        if (showDetails && (details == null || details === '')) {
          errors.push(`Detalhe obrigatório: ${question.details.label}`);
        }
      }
    }
  }
  const cleaned: Record<string, unknown> = {};
  for (const code of visibleCodes) {
    if (code in answers) cleaned[code] = answers[code];
  }
  return { errors, cleaned };
}

export function calculateAlertsAndRisk(schema: AnamnesisSchema, answers: Record<string, unknown>) {
  const alerts: Array<{
    type: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    message: string;
    createPatientAlert: boolean;
    blockFinalization?: boolean;
  }> = [];
  let critical = 0;
  let warning = 0;
  for (const question of flattenQuestions(schema)) {
    for (const rule of question.alertRules ?? []) {
      if (!isGroupVisible(answers, rule.when)) continue;
      alerts.push({
        type: rule.type,
        severity: rule.severity,
        message: rule.messageTemplate,
        createPatientAlert: rule.createPatientAlert,
        blockFinalization: rule.blockFinalization,
      });
      if (rule.severity === 'CRITICAL') critical += 1;
      if (rule.severity === 'WARNING') warning += 1;
    }
  }
  let riskBonus = 0;
  for (const rule of schema.riskRules ?? []) {
    if (!isGroupVisible(answers, rule.when)) continue;
    riskBonus += rule.contribution;
    if (rule.messageTemplate) {
      alerts.push({
        type: 'RISK_RULE',
        severity: rule.level === 'HIGH' ? 'CRITICAL' : rule.level === 'MODERATE' ? 'WARNING' : 'INFO',
        message: rule.messageTemplate,
        createPatientAlert: rule.level === 'HIGH',
      });
    }
  }
  const score = Math.min(100, critical * 25 + warning * 10 + riskBonus);
  const level = score >= 50 ? 'HIGH' : score >= 20 ? 'MODERATE' : 'LOW';
  return {
    alerts,
    riskAssessment: {
      score,
      level,
      criticalCount: critical,
      warningCount: warning,
      computedAt: new Date().toISOString(),
    },
  };
}
