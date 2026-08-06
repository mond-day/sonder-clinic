import { describe, expect, it } from 'vitest';
import {
  calculateAlertsAndRisk,
  parseAnamnesisSchema,
  validateAnswers,
  type AnamnesisSchema,
} from './anamnesis-schema';

const miniSchema: AnamnesisSchema = {
  schemaVersion: 1,
  title: 'Mini',
  audience: 'ADULT',
  sections: [{
    id: 's1',
    code: 'S1',
    title: 'Geral',
    order: 1,
    questions: [
      {
        id: 'q1',
        code: 'A_RX_04',
        label: 'Alergia?',
        type: 'YES_NO_DETAILS',
        required: true,
        order: 1,
        options: [{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }],
        alertRules: [{
          id: 'al1',
          when: { operator: 'OR', conditions: [{ questionCode: 'A_RX_04', operation: 'EQUALS', value: 'yes' }] },
          type: 'A_RX_04',
          severity: 'CRITICAL',
          messageTemplate: 'Alergia',
          createPatientAlert: true,
        }],
      },
      {
        id: 'q2',
        code: 'A_SIG_01',
        label: 'Aceite',
        type: 'ACKNOWLEDGEMENT',
        required: true,
        order: 2,
      },
    ],
  }],
  riskRules: [],
  completionRules: [],
};

describe('anamnesis schema engine', () => {
  it('parseia schema válido', () => {
    expect(parseAnamnesisSchema(miniSchema).title).toBe('Mini');
  });

  it('valida respostas e calcula alerta', () => {
    const answers = {
      A_RX_04: { value: 'yes', details: 'Penicilina' },
      A_SIG_01: true,
    };
    const { errors } = validateAnswers(miniSchema, answers);
    expect(errors).toEqual([]);
    const { alerts, riskAssessment } = calculateAlertsAndRisk(miniSchema, answers);
    expect(alerts.some((alert) => alert.type === 'A_RX_04')).toBe(true);
    expect(riskAssessment.criticalCount).toBeGreaterThan(0);
  });
});
