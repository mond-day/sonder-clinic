import { describe, expect, it } from 'vitest';
import { buildAnamnesisPrintHtml } from './print-anamnesis';

describe('buildAnamnesisPrintHtml', () => {
  it('omite perguntas sem resposta', () => {
    const html = buildAnamnesisPrintHtml({
      title: 'Anamnese teste',
      patientName: 'Maria',
      clinicName: 'Clínica Norte',
      statusLabel: 'Assinado',
      schema: {
        sections: [{
          title: 'Geral',
          questions: [
            { code: 'a', label: 'Pergunta A', type: 'SHORT_TEXT' },
            { code: 'b', label: 'Pergunta B', type: 'SHORT_TEXT' },
          ],
        }],
      },
      answers: { a: 'Resposta preenchida', b: '' },
      printedAt: new Date('2026-08-12T12:00:00.000Z'),
    });

    expect(html).toContain('Pergunta A');
    expect(html).toContain('Resposta preenchida');
    expect(html).not.toContain('Pergunta B');
    expect(html).toContain('Clínica Norte');
    expect(html).toContain('Paciente');
    expect(html).toContain('Maria');
    expect(html).toContain('Anamnese clínica');
    expect(html).toContain('Impresso em');
  });
});
