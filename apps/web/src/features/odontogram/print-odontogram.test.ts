import { describe, expect, it } from 'vitest';
import { buildOdontogramPrintHtml } from './print-odontogram';

describe('buildOdontogramPrintHtml', () => {
  it('gera odontograma vetorial em paisagem com achados reais', () => {
    const html = buildOdontogramPrintHtml({
      patientName: 'Marina Ferreira',
      clinicName: 'Clínica Norte',
      professionalName: 'Dra. Camila',
      dentitionType: 'PERMANENT',
      updatedAtLabel: '13/08/2026',
      versionLabel: 'Odontograma #7',
      findings: [{
        toothFdi: '16',
        face: 'O',
        status: 'EXISTING',
        conditionName: 'Restauração existente',
        notes: 'Avaliar sensibilidade.',
      }],
      printedAt: new Date('2026-08-13T12:00:00.000Z'),
    });

    expect(html).toContain('size:A4 landscape');
    expect(html).toContain('Odontograma');
    expect(html).toContain('Marina Ferreira');
    expect(html).toContain('<svg');
    expect(html).toContain('Dente 16');
    expect(html).toContain('Restauração existente');
    expect(html).toContain('Avaliar sensibilidade.');
    expect(html).toContain('Existente');
    expect(html).toContain('Arcada superior');
    expect(html).not.toContain('Atenção');
  });
});
