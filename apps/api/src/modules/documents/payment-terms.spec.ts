import { describe, expect, it } from 'vitest';
import {
  addCalendarMonthsUtc,
  amountInWords,
  buildPaymentTerms,
  resolvePaymentProfile,
  splitInstallmentAmounts,
} from './payment-terms';

describe('payment-terms', () => {
  it('classifica à vista, cartão e parcelado clínica', () => {
    expect(resolvePaymentProfile({ paymentMethod: 'PIX', installments: 1 })).toBe('CASH');
    expect(resolvePaymentProfile({ paymentMethod: 'CREDIT_CARD', installments: 1 })).toBe('CARD');
    expect(resolvePaymentProfile({ paymentMethod: 'CREDIT_CARD', installments: 6 })).toBe('CARD');
    expect(resolvePaymentProfile({ paymentMethod: 'CLINIC_INSTALLMENT', installments: 4 })).toBe('INSTALLMENT');
    expect(resolvePaymentProfile({ paymentMethod: 'PIX', installments: 3 })).toBe('INSTALLMENT');
  });

  it('escreve valor por extenso', () => {
    expect(amountInWords(1500)).toContain('reais');
    expect(amountInWords('10.50')).toContain('centavos');
  });

  it('gera cláusula à vista em PIX', () => {
    const terms = buildPaymentTerms({
      paymentMethod: 'PIX',
      total: '1200.00',
      dueDate: '2026-08-20',
    });
    expect(terms.profile).toBe('CASH');
    expect(terms.clause).toMatch(/à vista/i);
    expect(terms.clause).toMatch(/PIX/i);
    expect(terms.totalFormatted).toContain('1.200,00');
  });

  it('gera cláusula de cartão parcelado', () => {
    const terms = buildPaymentTerms({
      paymentMethod: 'CREDIT_CARD',
      installments: 6,
      total: '1200',
      dueDate: '2026-09-01',
    });
    expect(terms.profile).toBe('CARD');
    expect(terms.clause).toMatch(/cartão de crédito/i);
    expect(terms.clause).toMatch(/6 parcelas/);
  });

  it('gera cláusula de parcelamento na clínica', () => {
    const terms = buildPaymentTerms({
      paymentMethod: 'CLINIC_INSTALLMENT',
      installments: 4,
      total: 800,
      dueDate: '2026-08-15',
    });
    expect(terms.profile).toBe('INSTALLMENT');
    expect(terms.clause).toMatch(/parcelada/i);
    expect(terms.installments).toBe(4);
  });

  it('divide parcelas com resto na última', () => {
    expect(splitInstallmentAmounts('100.00', 3)).toEqual(['33.33', '33.33', '33.34']);
    expect(splitInstallmentAmounts(800, 4)).toEqual(['200.00', '200.00', '200.00', '200.00']);
  });

  it('avança vencimentos mensais em UTC', () => {
    const first = new Date('2026-01-31T00:00:00Z');
    expect(addCalendarMonthsUtc(first, 1).toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(addCalendarMonthsUtc(first, 2).toISOString().slice(0, 10)).toBe('2026-03-31');
  });
});
