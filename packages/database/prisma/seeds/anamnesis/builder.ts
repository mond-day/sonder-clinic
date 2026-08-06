export type Audience = 'ADULT' | 'CHILD' | 'ELDERLY' | 'PREGNANT';
export type QuestionType =
  | 'SHORT_TEXT' | 'LONG_TEXT' | 'YES_NO' | 'YES_NO_UNKNOWN' | 'YES_NO_DETAILS'
  | 'SINGLE_CHOICE' | 'SINGLE_CHOICE_DETAILS' | 'MULTIPLE_CHOICE' | 'MULTIPLE_CHOICE_DETAILS'
  | 'NUMBER' | 'NUMBER_UNIT' | 'DATE' | 'PHONE_CHANNEL' | 'SCALE_0_10' | 'RISK_LEVEL'
  | 'REPEATER_MEDICATION' | 'ACKNOWLEDGEMENT';

export type SeedQuestion = {
  code: string;
  label: string;
  type: QuestionType;
  required?: boolean;
  helpText?: string;
  options?: Array<{ value: string; label: string }>;
  unit?: string;
  alertSeverity?: 'INFO' | 'WARNING' | 'CRITICAL';
  alertMessage?: string;
  createPatientAlert?: boolean;
  detailsLabel?: string;
};

export type SeedSection = {
  code: string;
  title: string;
  description?: string;
  questions: SeedQuestion[];
};

const yesNo = [
  { value: 'yes', label: 'Sim' },
  { value: 'no', label: 'Não' },
];
const yesNoUnknown = [...yesNo, { value: 'unknown', label: 'Não sabe' }];
const risk = [
  { value: 'low', label: 'Baixo' },
  { value: 'moderate', label: 'Moderado' },
  { value: 'high', label: 'Alto' },
];

export function buildSchema(input: {
  title: string;
  audience: Audience;
  sections: SeedSection[];
}) {
  const sections = input.sections.map((section, sectionIndex) => ({
    id: `sec_${section.code.toLowerCase()}`,
    code: section.code,
    title: section.title,
    description: section.description,
    order: sectionIndex + 1,
    questions: section.questions.map((q, questionIndex) => {
      const baseOptions =
        q.options ??
        (q.type === 'YES_NO' || q.type === 'YES_NO_DETAILS'
          ? yesNo
          : q.type === 'YES_NO_UNKNOWN'
            ? yesNoUnknown
            : q.type === 'RISK_LEVEL'
              ? risk
              : undefined);
      return {
        id: `q_${q.code.toLowerCase()}`,
        code: q.code,
        label: q.label,
        helpText: q.helpText,
        type: q.type,
        required: q.required ?? false,
        order: questionIndex + 1,
        options: baseOptions,
        unit: q.unit,
        details: q.type.includes('DETAILS') || q.type === 'YES_NO_DETAILS'
          ? {
              enabled: true,
              label: q.detailsLabel ?? 'Detalhes',
              type: 'LONG_TEXT' as const,
              requiredWhenVisible: false,
            }
          : undefined,
        alertRules: q.alertMessage
          ? [{
              id: `al_${q.code.toLowerCase()}`,
              when: {
                operator: 'OR' as const,
                conditions: [
                  { questionCode: q.code, operation: 'EQUALS' as const, value: 'yes' },
                  { questionCode: q.code, operation: 'EQUALS' as const, value: 'high' },
                ],
              },
              type: q.code,
              severity: q.alertSeverity ?? 'WARNING',
              messageTemplate: q.alertMessage,
              createPatientAlert: q.createPatientAlert ?? true,
            }]
          : undefined,
      };
    }),
  }));

  return {
    schemaVersion: 1 as const,
    title: input.title,
    audience: input.audience,
    sections,
    riskRules: [],
    completionRules: [{ type: 'REQUIRED_ACKNOWLEDGEMENTS' }],
  };
}

export function countQuestions(schema: { sections: Array<{ questions: unknown[] }> }) {
  return schema.sections.reduce((acc, section) => acc + section.questions.length, 0);
}
