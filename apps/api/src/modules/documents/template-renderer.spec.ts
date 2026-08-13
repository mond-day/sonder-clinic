import { describe, expect, it } from 'vitest';
import { SYSTEM_CONTRACT_BODY } from './contract-template.defaults';
import { getPath, renderStructuredTemplate, renderTemplate, sanitizeTemplateHtml } from './template-renderer';

describe('template-renderer', () => {
  it('resolve caminhos aninhados', () => {
    expect(getPath({ clinic: { tradeName: 'Sonder' } }, 'clinic.tradeName')).toBe('Sonder');
    expect(getPath({ a: { b: null } }, 'a.b')).toBeNull();
  });

  it('interpola variáveis e listas', () => {
    const text = renderTemplate(
      'Clínica {{clinic.tradeName}}\n{{#treatment.items}}- {{procedureName}} {{total}}\n{{/treatment.items}}',
      {
        clinic: { tradeName: 'Center' },
        treatment: {
          items: [
            { procedureName: 'Restauração', total: 'R$ 10,00' },
            { procedureName: 'Canal', total: 'R$ 20,00' },
          ],
        },
      },
    );
    expect(text).toContain('Clínica Center');
    expect(text).toContain('- Restauração R$ 10,00');
    expect(text).toContain('- Canal R$ 20,00');
  });

  it('oculta blocos vazios', () => {
    const text = renderTemplate('A{{#guardian.name}} / {{guardian.name}}{{/guardian.name}}B', {
      guardian: { name: '' },
    });
    expect(text).toBe('AB');
  });

  it('remove script do HTML', () => {
    const html = sanitizeTemplateHtml('<p>ok</p><script>alert(1)</script><img src=x onerror=alert(1) />');
    expect(html).not.toContain('script');
    expect(html).not.toContain('onerror');
    expect(html).toContain('<p>ok</p>');
  });

  it('monta documento estruturado', () => {
    const result = renderStructuredTemplate(
      { title: 'Contrato', body: 'Paciente {{patient.fullName}}', footer: '', signature: '' },
      { patient: { fullName: 'Ana' } },
    );
    expect(result.renderedText).toContain('Ana');
    expect(result.renderedHtml).toContain('Ana');
  });

  it('preenche o modelo de contrato com itens e cláusula de pagamento', () => {
    const text = renderTemplate(SYSTEM_CONTRACT_BODY, {
      clinic: { legalName: 'Sonder LTDA', tradeName: 'Sonder', taxId: '00.000.000/0001-00', address: 'Rua A', phone: '65 0000', email: 'a@b.c' },
      patient: { fullName: 'Ana', cpf: '123.456.789-00', birthDate: '01/01/1990', address: 'Rua B', phone: '65 1111', email: 'ana@x.com' },
      guardian: { name: '', cpf: '', relationship: '' },
      professional: { name: 'Dr. João', cro: 'CRO/MT 1', cpf: '000' },
      treatment: {
        title: 'Plano 1',
        createdAt: '13/08/2026',
        validUntil: '13/09/2026',
        subtotal: 'R$ 200,00',
        discount: 'R$ 0,00',
        total: 'R$ 200,00',
        notes: 'nenhuma',
        items: [{ procedureName: 'Restauração', toothFdi: '16', face: 'O', quantity: '1', plannedSessions: '1', unitPrice: 'R$ 200,00', discount: 'R$ 0,00', total: 'R$ 200,00' }],
      },
      payment: { clause: 'Pagamento à vista via PIX.', totalInWords: 'duzentos reais' },
    });
    expect(text).toContain('Ana');
    expect(text).toContain('Restauração');
    expect(text).toContain('dente 16');
    expect(text).toContain('Pagamento à vista via PIX.');
    expect(text).not.toContain('neste ato representado');
  });
});
