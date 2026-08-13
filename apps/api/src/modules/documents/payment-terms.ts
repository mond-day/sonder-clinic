export const TREATMENT_PAYMENT_METHODS = [
  'PIX',
  'CREDIT_CARD',
  'DEBIT_CARD',
  'CASH',
  'TRANSFER',
  'CLINIC_INSTALLMENT',
  'OTHER',
] as const;

export type TreatmentPaymentMethod = (typeof TREATMENT_PAYMENT_METHODS)[number];
export type PaymentProfile = 'CASH' | 'CARD' | 'INSTALLMENT';

const METHOD_LABELS: Record<TreatmentPaymentMethod, string> = {
  PIX: 'PIX',
  CREDIT_CARD: 'cartão de crédito',
  DEBIT_CARD: 'cartão de débito',
  CASH: 'dinheiro',
  TRANSFER: 'transferência bancária',
  CLINIC_INSTALLMENT: 'parcelamento direto com a clínica',
  OTHER: 'outra forma combinada entre as partes',
};

export function isTreatmentPaymentMethod(value: string): value is TreatmentPaymentMethod {
  return (TREATMENT_PAYMENT_METHODS as readonly string[]).includes(value);
}

/** Soma meses em UTC preservando o dia (ou o último dia do mês, se não existir). */
export function addCalendarMonthsUtc(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

/** Divide o total em N parcelas iguais em reais; o resto de centavos vai para a última. */
export function splitInstallmentAmounts(total: string | number, count: number): string[] {
  const n = Math.min(24, Math.max(1, Math.floor(count)));
  const cents = Math.round((typeof total === 'number' ? total : Number(total)) * 100);
  const safe = Number.isFinite(cents) ? cents : 0;
  const base = Math.floor(safe / n);
  const remainder = safe - base * n;
  return Array.from({ length: n }, (_, index) => (
    ((base + (index === n - 1 ? remainder : 0)) / 100).toFixed(2)
  ));
}

export function resolvePaymentProfile(input: {
  paymentMethod: string;
  installments?: number;
}): PaymentProfile {
  const installments = Math.max(1, Math.floor(input.installments ?? 1));
  if (input.paymentMethod === 'CLINIC_INSTALLMENT' || (installments > 1 && input.paymentMethod !== 'CREDIT_CARD')) {
    return 'INSTALLMENT';
  }
  if (input.paymentMethod === 'CREDIT_CARD') return 'CARD';
  return 'CASH';
}

export function formatBRL(value: string | number): string {
  const amount = typeof value === 'number' ? value : Number(value);
  const safe = Number.isFinite(amount) ? amount : 0;
  return safe.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const UNITS = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const TEENS = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const HUNDREDS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function chunkToWords(value: number): string {
  if (value === 0) return '';
  if (value === 100) return 'cem';
  const hundreds = Math.floor(value / 100);
  const remainder = value % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(HUNDREDS[hundreds] ?? '');
  if (remainder >= 10 && remainder < 20) {
    parts.push(TEENS[remainder - 10] ?? '');
  } else {
    const tens = Math.floor(remainder / 10);
    const units = remainder % 10;
    if (tens) parts.push(TENS[tens] ?? '');
    if (units) parts.push(UNITS[units] ?? '');
  }
  return parts.filter(Boolean).join(' e ');
}

export function amountInWords(value: string | number): string {
  const amount = typeof value === 'number' ? value : Number(value);
  const safe = Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
  const reais = Math.floor(safe);
  const cents = Math.round((safe - reais) * 100);
  const million = Math.floor(reais / 1_000_000);
  const thousand = Math.floor((reais % 1_000_000) / 1000);
  const rest = reais % 1000;
  const parts: string[] = [];
  if (million) parts.push(`${chunkToWords(million)} ${million === 1 ? 'milhão' : 'milhões'}`);
  if (thousand) parts.push(thousand === 1 ? 'mil' : `${chunkToWords(thousand)} mil`);
  if (rest) parts.push(chunkToWords(rest));
  const reaisText = reais === 0
    ? 'zero reais'
    : `${parts.join(' e ') || 'zero'} ${reais === 1 ? 'real' : 'reais'}`;
  if (!cents) return reaisText;
  const centsText = `${chunkToWords(cents)} ${cents === 1 ? 'centavo' : 'centavos'}`;
  return `${reaisText} e ${centsText}`;
}

export function buildPaymentTerms(input: {
  paymentMethod: string;
  installments?: number;
  total: string | number;
  dueDate?: Date | string | null;
}): {
  profile: PaymentProfile;
  method: string;
  methodLabel: string;
  installments: number;
  installmentAmount: string;
  totalFormatted: string;
  totalInWords: string;
  dueDateLabel: string;
  summary: string;
  clause: string;
} {
  const method = isTreatmentPaymentMethod(input.paymentMethod) ? input.paymentMethod : 'OTHER';
  const installments = Math.min(24, Math.max(1, Math.floor(input.installments ?? 1)));
  const profile = resolvePaymentProfile({ paymentMethod: method, installments });
  const totalNumber = typeof input.total === 'number' ? input.total : Number(input.total);
  const totalFormatted = formatBRL(totalNumber);
  const totalInWords = amountInWords(totalNumber);
  const installmentValue = installments > 1 ? totalNumber / installments : totalNumber;
  const installmentAmount = formatBRL(installmentValue);
  const due = input.dueDate ? new Date(input.dueDate) : null;
  const dueDateLabel = due && !Number.isNaN(due.getTime())
    ? due.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
    : 'a combinar';
  const methodLabel = METHOD_LABELS[method];

  let clause: string;
  let summary: string;
  if (profile === 'INSTALLMENT') {
    summary = `${installments} parcelas de ${installmentAmount} (${methodLabel})`;
    clause = [
      `O valor total de ${totalFormatted} (${totalInWords}) será pago de forma parcelada, em ${installments} parcelas iguais de ${installmentAmount}, mediante ${methodLabel}.`,
      `A primeira parcela vence em ${dueDateLabel}, e as demais no mesmo dia dos meses subsequentes, salvo acordo escrito em contrário.`,
      'O atraso sujeitará o CONTRATANTE a multa de 2% (dois por cento) e juros de 1% (um por cento) ao mês, nos limites da legislação aplicável.',
      'A clínica não emitirá novas parcelas financeiras automaticamente neste momento: o cronograma acima registra o acordo; a cobrança operacional segue o financeiro da clínica.',
    ].join(' ');
  } else if (profile === 'CARD' && installments > 1) {
    summary = `${installments}x de ${installmentAmount} no cartão de crédito`;
    clause = [
      `O valor total de ${totalFormatted} (${totalInWords}) será pago no cartão de crédito, em ${installments} parcelas de ${installmentAmount}.`,
      `O lançamento observará as regras da operadora, com primeiro vencimento previsto para ${dueDateLabel}.`,
      'Eventuais tarifas da operadora, quando houver, serão informadas previamente ao CONTRATANTE.',
      'Procedimentos não constantes deste contrato somente serão executados mediante novo acordo e cobrança à parte.',
    ].join(' ');
  } else if (profile === 'CARD') {
    summary = `À vista no cartão de crédito (${totalFormatted})`;
    clause = [
      `O valor total de ${totalFormatted} (${totalInWords}) será pago à vista, no cartão de crédito, com vencimento em ${dueDateLabel}.`,
      'Eventuais tarifas da operadora, quando houver, serão informadas previamente ao CONTRATANTE.',
      'A execução dos procedimentos previstos neste contrato condiciona-se à quitação combinada, salvo acordo escrito em contrário.',
    ].join(' ');
  } else {
    summary = `À vista via ${methodLabel} (${totalFormatted})`;
    clause = [
      `O valor total de ${totalFormatted} (${totalInWords}) será pago à vista, por meio de ${methodLabel}, com vencimento em ${dueDateLabel}.`,
      'A execução dos procedimentos previstos neste contrato condiciona-se à quitação combinada, salvo acordo escrito em contrário.',
      'Qualquer procedimento adicional será cobrado em documento próprio, mediante autorização prévia do CONTRATANTE.',
    ].join(' ');
  }

  return {
    profile,
    method,
    methodLabel,
    installments,
    installmentAmount,
    totalFormatted,
    totalInWords,
    dueDateLabel,
    summary,
    clause,
  };
}
