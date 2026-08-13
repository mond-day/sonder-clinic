import { describe, expect, it } from 'vitest';
import { buildTreatmentPrintHtml } from './print-treatment';

describe('buildTreatmentPrintHtml', () => {
  it('monta plano com procedimentos, sessões e totais', () => {
    const html = buildTreatmentPrintHtml({
      title: 'Plano inicial',
      patientName: 'Ana Paula',
      clinicName: 'Clínica Norte',
      professionalName: 'Dr. Lima',
      statusLabel: 'Apresentado',
      versionLabel: 'versão 2',
      createdAtLabel: '10/08/2026',
      validUntilLabel: '09/09/2026',
      notes: 'Priorizar dente 26.',
      items: [{
        name: 'Restauração em resina',
        tooth: '26',
        face: 'O',
        sessions: '1 / 1',
        total: 'R$ 350,00',
        status: 'Aprovado',
        statusTone: 'teal',
      }],
      subtotal: 'R$ 350,00',
      discount: 'R$ 0,00',
      total: 'R$ 350,00',
      printedAt: new Date('2026-08-13T12:00:00.000Z'),
    });

    expect(html).toContain('Planejamento clínico');
    expect(html).toContain('Plano de Tratamento');
    expect(html).toContain('Plano inicial');
    expect(html).toContain('Ana Paula');
    expect(html).toContain('Restauração em resina');
    expect(html).toContain('26 · O');
    expect(html).toContain('1 / 1');
    expect(html).toContain('Priorizar dente 26.');
    expect(html).toContain('R$ 350,00');
    expect(html).toContain('Ciência do plano');
    expect(html).toContain('thead{display:table-header-group}');
    expect(html).not.toContain('Nenhum procedimento');
    expect(html).not.toContain('>Qtd<');
    expect(html).not.toContain('Unitário');
  });
});
