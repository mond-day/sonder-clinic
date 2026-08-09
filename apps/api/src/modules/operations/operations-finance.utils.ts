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

/** Valor líquido efetivamente pago em um pagamento (amount − estornos válidos). */
export function netPaidAmount(payment: {
  amount: Prisma.Decimal;
  status: string;
  refunds?: Array<{ amount: Prisma.Decimal }>;
  refundedAmount?: Prisma.Decimal;
}): Prisma.Decimal {
  if (!['CONFIRMED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(payment.status)) {
    return money('0');
  }
  const refunded = payment.refunds
    ? payment.refunds.reduce((sum, refund) => sum.add(refund.amount), money('0'))
    : (payment.refundedAmount ?? money('0'));
  const net = payment.amount.sub(refunded);
  return net.gt(0) ? net : money('0');
}

/** Soma dos valores líquidos de pagamentos confirmados / parcialmente estornados. */
export function confirmedNetPaid(
  payments: Array<{
    amount: Prisma.Decimal;
    status: string;
    refunds?: Array<{ amount: Prisma.Decimal }>;
    refundedAmount?: Prisma.Decimal;
  }>,
): Prisma.Decimal {
  return payments.reduce((sum, item) => {
    if (!['CONFIRMED', 'PARTIALLY_REFUNDED'].includes(item.status)) return sum;
    return sum.add(netPaidAmount(item));
  }, money('0'));
}

/** Total estornado em um pagamento (via relação Refund ou campo refundedAmount). */
export function refundedTotal(payment: {
  refunds?: Array<{ amount: Prisma.Decimal }>;
  refundedAmount?: Prisma.Decimal;
}): Prisma.Decimal {
  if (payment.refunds) {
    return payment.refunds.reduce((sum, refund) => sum.add(refund.amount), money('0'));
  }
  return payment.refundedAmount ?? money('0');
}

/** Saldo em aberto: max(0, netAmount − paid líquido). */
export function outstandingAmount(netAmount: Prisma.Decimal, paid: Prisma.Decimal): Prisma.Decimal {
  const remaining = netAmount.sub(paid);
  return remaining.gt(0) ? remaining : money('0');
}

export function computeReceivableStatus(
  netAmount: Prisma.Decimal,
  paid: Prisma.Decimal,
): 'OPEN' | 'PARTIALLY_PAID' | 'PAID' {
  if (paid.gte(netAmount)) return 'PAID';
  if (paid.gt(0)) return 'PARTIALLY_PAID';
  return 'OPEN';
}

/** Status efetivo incluindo OVERDUE dinâmico (sem depender de worker). */
export function effectiveReceivableStatus(
  netAmount: Prisma.Decimal,
  paid: Prisma.Decimal,
  dueDate: Date,
  storedStatus: string,
  today = new Date(),
): string {
  if (storedStatus === 'CANCELLED') return 'CANCELLED';
  const base = computeReceivableStatus(netAmount, paid);
  if (base === 'PAID') return 'PAID';
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const ref = new Date(today);
  ref.setHours(0, 0, 0, 0);
  if (due.getTime() < ref.getTime()) return 'OVERDUE';
  return base;
}

export function isEffectivelyOverdue(
  netAmount: Prisma.Decimal,
  paid: Prisma.Decimal,
  dueDate: Date,
  storedStatus: string,
  today = new Date(),
): boolean {
  return effectiveReceivableStatus(netAmount, paid, dueDate, storedStatus, today) === 'OVERDUE';
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

/** Líquido pago em PayablePayment (amount − refundedAmount). */
export function netPayablePaid(payment: {
  amount: Prisma.Decimal;
  status: string;
  refundedAmount?: Prisma.Decimal;
}): Prisma.Decimal {
  if (!['CONFIRMED', 'PARTIALLY_REFUNDED'].includes(payment.status)) return money('0');
  const refunded = payment.refundedAmount ?? money('0');
  const net = payment.amount.sub(refunded);
  return net.gt(0) ? net : money('0');
}

export type ReceivableFinanceView = {
  paidAmount: string;
  refundedAmount: string;
  outstandingAmount: string;
  effectiveStatus: string;
};

/** View model canônico para títulos a receber (API → front). */
export function buildReceivableFinanceView(receivable: {
  netAmount: Prisma.Decimal;
  dueDate: Date;
  status: string;
  originalAmount?: Prisma.Decimal;
  discount?: Prisma.Decimal;
  surcharge?: Prisma.Decimal;
  payments?: Array<{
    amount: Prisma.Decimal;
    status: string;
    refunds?: Array<{ amount: Prisma.Decimal }>;
  }>;
}): ReceivableFinanceView {
  const payments = receivable.payments ?? [];
  const paid = confirmedNetPaid(payments);
  const refunded = payments.reduce((sum, payment) => sum.add(refundedTotal(payment)), money('0'));
  return {
    paidAmount: paid.toFixed(2),
    refundedAmount: refunded.toFixed(2),
    outstandingAmount: outstandingAmount(receivable.netAmount, paid).toFixed(2),
    effectiveStatus: effectiveReceivableStatus(
      receivable.netAmount,
      paid,
      receivable.dueDate,
      receivable.status,
    ),
  };
}
