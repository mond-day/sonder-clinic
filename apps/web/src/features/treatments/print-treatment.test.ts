import { describe, expect, it } from 'vitest';
import { buildTreatmentPrintHtml } from './print-treatment';

describe('buildTreatmentPrintHtml', () => {
  it('monta orçamento com procedimentos e totais', () => {
    const html = buildTreatmentPrintHtml({
      title: 'Plano inicial',
      patientName: 'Ana Paula',
      clinicName: 'Clínica Norte',
      professionalName: 'Dr. Lima',
      statusLabel: 'Apresentado',
      notes: 'Priorizar dente 26.',
      items: [{
        name: 'Restauração em resina',
        tooth: '26',
        face: 'O',
        quantity: 1,
        sessions: '1/1',
        unitPrice: 'R$ 350,00',
        total: 'R$ 350,00',
        status: 'Aprovado',
      }],
      subtotal: 'R$ 350,00',
      discount: 'R$ 0,00',
      total: 'R$ 350,00',
      printedAt: new Date('2026-08-13T12:00:00.000Z'),
    });

    expect(html).toContain('Orçamento e plano de tratamento');
    expect(html).toContain('Plano inicial');
    expect(html).toContain('Ana Paula');
    expect(html).toContain('Restauração em resina');
    expect(html).toContain('26 · O');
    expect(html).toContain('Priorizar dente 26.');
    expect(html).toContain('R$ 350,00');
    expect(html).not.toContain('Nenhum procedimento');
  });
});
