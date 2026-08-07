import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@sonder/database';

export const money = (value: string) => new Prisma.Decimal(value);

export function positiveMoney(value: string, label = 'Valor'): Prisma.Decimal {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new BadRequestException(`${label} monetário inválido.`);
  }
  const amount = money(value);
  if (amount.lte(0)) throw new BadRequestException(`${label} deve ser maior que zero.`);
  return amount;
}

export function confirmedNetPaid(
  payments: Array<{ amount: Prisma.Decimal; status: string; refunds?: Array<{ amount: Prisma.Decimal }> }>,
): Prisma.Decimal {
  return payments.reduce((sum, item) => {
    if (!['CONFIRMED', 'PARTIALLY_REFUNDED'].includes(item.status)) return sum;
    const refunded = (item.refunds ?? []).reduce((r, refund) => r.add(refund.amount), money('0'));
    return sum.add(item.amount.sub(refunded));
  }, money('0'));
}

export function computeReceivableStatus(
  netAmount: Prisma.Decimal,
  paid: Prisma.Decimal,
): 'OPEN' | 'PARTIALLY_PAID' | 'PAID' {
  if (paid.gte(netAmount)) return 'PAID';
  if (paid.gt(0)) return 'PARTIALLY_PAID';
  return 'OPEN';
}

export function computePaymentRefundStatus(
  paymentAmount: Prisma.Decimal,
  totalRefunded: Prisma.Decimal,
): 'CONFIRMED' | 'PARTIALLY_REFUNDED' | 'REFUNDED' {
  if (totalRefunded.gte(paymentAmount)) return 'REFUNDED';
  if (totalRefunded.gt(0)) return 'PARTIALLY_REFUNDED';
  return 'CONFIRMED';
}

export function computePayableStatus(
  originalAmount: Prisma.Decimal,
  paidAmount: Prisma.Decimal,
): 'OPEN' | 'PARTIALLY_PAID' | 'PAID' {
  if (paidAmount.gte(originalAmount)) return 'PAID';
  if (paidAmount.gt(0)) return 'PARTIALLY_PAID';
  return 'OPEN';
}
