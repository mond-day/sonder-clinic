import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  computePaymentRefundStatus,
  computePayableStatus,
  computeReceivableStatus,
  confirmedNetPaid,
  money,
  positiveMoney,
} from './operations-finance.utils';

describe('operations-finance.utils (P0.4/P0.5)', () => {
  it('positiveMoney rejeita zero e negativos', () => {
    expect(() => positiveMoney('0')).toThrow(BadRequestException);
    expect(() => positiveMoney('0.00')).toThrow(BadRequestException);
    expect(() => positiveMoney('-1')).toThrow(BadRequestException);
    expect(() => positiveMoney('abc')).toThrow(BadRequestException);
  });

  it('positiveMoney aceita valores monetários válidos', () => {
    expect(positiveMoney('10').toString()).toBe('10');
    expect(positiveMoney('10.50').toString()).toBe('10.5');
  });

  it('confirmedNetPaid desconta estornos parciais', () => {
    const paid = confirmedNetPaid([
      { amount: money('100'), status: 'CONFIRMED', refunds: [] },
      { amount: money('50'), status: 'PARTIALLY_REFUNDED', refunds: [{ amount: money('20') }] },
      { amount: money('30'), status: 'REFUNDED', refunds: [{ amount: money('30') }] },
    ]);
    expect(paid.toString()).toBe('130');
  });

  it('computeReceivableStatus reflete saldo líquido', () => {
    expect(computeReceivableStatus(money('100'), money('0')).toString()).toBe('OPEN');
    expect(computeReceivableStatus(money('100'), money('40')).toString()).toBe('PARTIALLY_PAID');
    expect(computeReceivableStatus(money('100'), money('100')).toString()).toBe('PAID');
  });

  it('computePaymentRefundStatus usa PARTIALLY_REFUNDED', () => {
    expect(computePaymentRefundStatus(money('100'), money('0'))).toBe('CONFIRMED');
    expect(computePaymentRefundStatus(money('100'), money('25'))).toBe('PARTIALLY_REFUNDED');
    expect(computePaymentRefundStatus(money('100'), money('100'))).toBe('REFUNDED');
  });

  it('computePayableStatus segue paidAmount', () => {
    expect(computePayableStatus(money('200'), money('0'))).toBe('OPEN');
    expect(computePayableStatus(money('200'), money('50'))).toBe('PARTIALLY_PAID');
    expect(computePayableStatus(money('200'), money('200'))).toBe('PAID');
  });
});
