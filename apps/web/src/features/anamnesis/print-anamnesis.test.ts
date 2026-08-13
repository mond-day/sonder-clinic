import { describe, expect, it } from 'vitest';
import { buildAnamnesisPrintHtml } from './print-anamnesis';

describe('buildAnamnesisPrintHtml', () => {
  it('omite perguntas sem resposta e usa o layout clínico', () => {
    const html = buildAnamnesisPrintHtml({
      title: 'Anamnese teste',
      templateSubtitle: 'Anamnese teste · versão 1',
      patientName: 'Maria',
      birthDateLabel: '18/03/1994',
      professionalName: 'Dr. Lima',
      clinicName: 'Clínica Norte',
      statusLabel: 'Assinado',
      riskLabel: 'Risco baixo',
      riskTone: 'green',
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
    expect(html).toContain('Documento clínico');
    expect(html).toContain('Anamnese');
    expect(html).toContain('Emitido em');
    expect(html).toContain('size:A4 portrait');
    expect(html).not.toContain('class="row"');
  });
});
