import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@sonder/database';
import { describe, expect, it } from 'vitest';
import {
  buildReceivableFinanceView,
  computePaymentRefundStatus,
  computePayableStatus,
  computeReceivableStatus,
  confirmedNetPaid,
  effectiveReceivableStatus,
  money,
  netPaidAmount,
  netPayablePaid,
  outstandingAmount,
  pendingReservedAmount,
  positiveMoney,
  refundedTotal,
} from './operations-finance.utils';

describe('operations-finance.utils (P0 financeiro)', () => {
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

  it('netPaidAmount desconta estornos', () => {
    expect(netPaidAmount({ amount: money('1000'), status: 'CONFIRMED', refunds: [] }).toString()).toBe('1000');
    expect(netPaidAmount({
      amount: money('1000'),
      status: 'PARTIALLY_REFUNDED',
      refunds: [{ amount: money('200') }],
    }).toString()).toBe('800');
    expect(netPaidAmount({
      amount: money('1000'),
      status: 'REFUNDED',
      refunds: [{ amount: money('1000') }],
    }).toString()).toBe('0');
  });

  it('confirmedNetPaid desconta estornos parciais', () => {
    const paid = confirmedNetPaid([
      { amount: money('100'), status: 'CONFIRMED', refunds: [] },
      { amount: money('50'), status: 'PARTIALLY_REFUNDED', refunds: [{ amount: money('20') }] },
      { amount: money('30'), status: 'REFUNDED', refunds: [{ amount: money('30') }] },
    ]);
    expect(paid.toString()).toBe('130');
  });

  it('pendingReservedAmount soma apenas PENDING', () => {
    expect(pendingReservedAmount([
      { amount: money('100'), status: 'PENDING' },
      { amount: money('50'), status: 'CONFIRMED' },
      { amount: money('20'), status: 'FAILED' },
    ]).toString()).toBe('100');
  });

  it('outstandingAmount nunca é negativo', () => {
    expect(outstandingAmount(money('1000'), money('600')).toString()).toBe('400');
    expect(outstandingAmount(money('1000'), money('1000')).toString()).toBe('0');
    expect(outstandingAmount(money('1000'), money('1200')).toString()).toBe('0');
  });

  it('buildReceivableFinanceView cobre pagamento parcial + estorno', () => {
    const view = buildReceivableFinanceView({
      netAmount: money('1000'),
      dueDate: new Date('2099-01-01'),
      status: 'PARTIALLY_PAID',
      payments: [
        {
          amount: money('600'),
          status: 'PARTIALLY_REFUNDED',
          refunds: [{ amount: money('200') }],
        },
        { amount: money('400'), status: 'CONFIRMED', refunds: [] },
      ],
    });
    expect(view.paidAmount).toBe('800.00');
    expect(view.refundedAmount).toBe('200.00');
    expect(view.outstandingAmount).toBe('200.00');
    expect(view.effectiveStatus).toBe('PARTIALLY_PAID');
  });

  it('effectiveReceivableStatus marca OVERDUE dinamicamente', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(effectiveReceivableStatus(money('100'), money('0'), yesterday, 'OPEN')).toBe('OVERDUE');
    expect(effectiveReceivableStatus(money('100'), money('40'), yesterday, 'PARTIALLY_PAID')).toBe('OVERDUE');
    expect(effectiveReceivableStatus(money('100'), money('100'), yesterday, 'PAID')).toBe('PAID');
  });

  it('computeReceivableStatus reflete saldo líquido', () => {
    expect(computeReceivableStatus(money('100'), money('0'))).toBe('OPEN');
    expect(computeReceivableStatus(money('100'), money('40'))).toBe('PARTIALLY_PAID');
    expect(computeReceivableStatus(money('100'), money('100'))).toBe('PAID');
  });

  it('computePaymentRefundStatus usa PARTIALLY_REFUNDED', () => {
    expect(computePaymentRefundStatus(money('100'), money('0'))).toBe('CONFIRMED');
    expect(computePaymentRefundStatus(money('100'), money('25'))).toBe('PARTIALLY_REFUNDED');
    expect(computePaymentRefundStatus(money('100'), money('100'))).toBe('REFUNDED');
  });

  it('computePayableStatus e netPayablePaid', () => {
    expect(computePayableStatus(money('200'), money('0'))).toBe('OPEN');
    expect(computePayableStatus(money('200'), money('50'))).toBe('PARTIALLY_PAID');
    expect(computePayableStatus(money('200'), money('200'))).toBe('PAID');
    expect(netPayablePaid({
      amount: money('1000'),
      status: 'PARTIALLY_REFUNDED',
      refundedAmount: money('250'),
    }).toString()).toBe('750');
  });

  it('refundedTotal usa relação ou campo', () => {
    expect(refundedTotal({ refunds: [{ amount: money('10') }, { amount: money('5') }] }).toString()).toBe('15');
    expect(refundedTotal({ refundedAmount: money('7') }).toString()).toBe('7');
  });
});
