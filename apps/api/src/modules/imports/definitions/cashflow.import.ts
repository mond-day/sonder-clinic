import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { loadImportedKeys, loadPatientIndex, type PatientIndex } from '../import-lookups';
import { parsedRow, PlanBuilder } from '../import-plan';
import type { ImportDefinition, ImportPlan, ParsedRow, SheetRow } from '../import-types';
import {
  cellText,
  dateOnlyUtc,
  formatDay,
  hashKey,
  isoDay,
  isValidCpf,
  normalizeName,
  normalizePhone,
  onlyDigits,
  optionalText,
  parseDate,
  parseMoney,
  withOccurrence,
  type DateParts,
} from '../import-values';

export const CASHFLOW_COLUMNS = {
  type: 'Tipo',
  name: 'Nome',
  mobile: 'Celular',
  description: 'Descrição',
  category: 'Categoria',
  dueDate: 'Data de Vencimento',
  paidAt: 'Data de Pagamento',
  amount: 'Valor',
  netAmount: 'Valor Líquido',
  paid: 'Pago?',
  method: 'Forma de Pagamento',
  professional: 'Profissional',
  budget: 'Orçamento',
  cpf: 'CPF',
  notes: 'Observações',
} as const;

const TYPE_MAP: Record<string, 'INFLOW' | 'OUTFLOW'> = { receita: 'INFLOW', despesa: 'OUTFLOW' };
const PAID_MAP: Record<string, boolean> = { pago: true, 'nao pago': false };

const text = (max: number) => z.string().max(max).optional();

const cashRowSchema = z.object({
  kind: z.enum(['INFLOW', 'OUTFLOW']),
  name: z.string().min(2, 'Nome ausente.').max(200),
  phone: z.string().optional(),
  cpf: z.string().optional(),
  description: text(500),
  category: text(120),
  dueDate: z.custom<DateParts>().optional(),
  paidAt: z.custom<DateParts>().optional(),
  amount: z.string({ required_error: 'Valor ausente ou inválido.' }),
  netAmount: z.string().optional(),
  paid: z.boolean(),
  paymentMethod: text(60),
  professionalName: text(200),
  budgetCode: text(60),
  notes: text(2000),
}).refine((row) => row.dueDate || row.paidAt, 'Sem data de vencimento nem de pagamento.');

export type CashRow = z.infer<typeof cashRowSchema>;
export type CashPlanned = CashRow & { patientId: string | null };

export function parseCashRow(row: SheetRow): ParsedRow<CashRow> {
  const cells = row.cells;
  const errors: string[] = [];
  const warnings: string[] = [];
  const typeText = cellText(cells[CASHFLOW_COLUMNS.type]);
  const kind = TYPE_MAP[normalizeName(typeText)];
  if (!kind) errors.push(typeText ? `Tipo “${typeText}” não reconhecido (use Receita ou Despesa).` : 'Tipo ausente.');
  const paidText = cellText(cells[CASHFLOW_COLUMNS.paid]);
  const paid = PAID_MAP[normalizeName(paidText)];
  if (paid === undefined) errors.push(paidText ? `“Pago?” com valor “${paidText}” não reconhecido.` : '“Pago?” ausente.');
  const paidAt = parseDate(cells[CASHFLOW_COLUMNS.paidAt]) ?? undefined;
  if (paid && !paidAt) warnings.push('Marcado como pago sem data de pagamento: será filtrado pela data de vencimento.');
  const cpf = onlyDigits(cells[CASHFLOW_COLUMNS.cpf]);
  const netText = optionalText(cells[CASHFLOW_COLUMNS.netAmount]);
  const netAmount = netText ? parseMoney(cells[CASHFLOW_COLUMNS.netAmount]) ?? undefined : undefined;
  if (netText && !netAmount) warnings.push('Valor líquido inválido foi ignorado.');
  return parsedRow(row.rowNumber, cashRowSchema, {
    kind: kind ?? 'OUTFLOW',
    name: cellText(cells[CASHFLOW_COLUMNS.name]),
    phone: normalizePhone(cells[CASHFLOW_COLUMNS.mobile]) ?? undefined,
    cpf: isValidCpf(cpf) ? cpf : undefined,
    description: optionalText(cells[CASHFLOW_COLUMNS.description]),
    category: optionalText(cells[CASHFLOW_COLUMNS.category]),
    dueDate: parseDate(cells[CASHFLOW_COLUMNS.dueDate]) ?? undefined,
    paidAt,
    amount: parseMoney(cells[CASHFLOW_COLUMNS.amount]) ?? undefined,
    netAmount,
    paid: paid ?? false,
    paymentMethod: optionalText(cells[CASHFLOW_COLUMNS.method]),
    professionalName: optionalText(cells[CASHFLOW_COLUMNS.professional]),
    budgetCode: optionalText(cells[CASHFLOW_COLUMNS.budget]),
    notes: optionalText(cells[CASHFLOW_COLUMNS.notes]),
  }, errors, warnings);
}

export function cashNaturalKeys(rows: CashRow[]): string[] {
  return withOccurrence(rows.map((row) => `cash:${hashKey([
    row.kind,
    normalizeName(row.name),
    normalizeName(row.description ?? ''),
    normalizeName(row.category ?? ''),
    row.amount,
    row.budgetCode,
    row.dueDate ? isoDay(row.dueDate) : '',
    row.paidAt ? isoDay(row.paidAt) : '',
  ])}`));
}

export function planCashflow(
  rows: ParsedRow<CashRow>[],
  input: { patients: PatientIndex; alreadyImported: Set<string> },
): ImportPlan<CashPlanned> {
  const builder = new PlanBuilder<CashPlanned>(rows);
  const valid = PlanBuilder.valid(rows);
  const keys = cashNaturalKeys(valid.map((row) => row.data));
  valid.forEach(({ rowNumber, data, warnings }, index) => {
    const key = keys[index]!;
    if (input.alreadyImported.has(key)) {
      builder.skip(rowNumber, 'Já importado em lote anterior.');
      return;
    }
    let patientId: string | null = null;
    if (data.kind === 'INFLOW') {
      const patient = input.patients.resolve({ name: data.name, cpf: data.cpf, phone: data.phone });
      if (!patient.ok) {
        builder.error(rowNumber, patient.error, warnings);
        return;
      }
      patientId = patient.value.id;
    }
    builder.create(rowNumber, key, { ...data, patientId }, warnings);
  });
  builder.warning('Lançamentos importados são somente consulta: não geram recebíveis, pagamentos, contas a pagar nem sincronização com o Nibo.');
  builder.sample((item, rowNumber) => ({
    Linha: String(rowNumber),
    Tipo: item.kind === 'INFLOW' ? 'Receita' : 'Despesa',
    Nome: item.name,
    Categoria: item.category ?? '—',
    Vencimento: formatDay(item.dueDate),
    Pagamento: formatDay(item.paidAt),
    Valor: `R$ ${item.amount.replace('.', ',')}`,
  }));
  return builder.build();
}

export const cashflowImport: ImportDefinition<CashRow, CashPlanned> = {
  kind: 'CASHFLOW',
  label: 'Fluxo de caixa (histórico)',
  permission: 'financial.create',
  rowEntity: 'ImportedCashEntry',
  requiredColumns: [CASHFLOW_COLUMNS.type, CASHFLOW_COLUMNS.name, CASHFLOW_COLUMNS.amount, CASHFLOW_COLUMNS.paid],
  optionalColumns: Object.values(CASHFLOW_COLUMNS),
  parseRow: (row: SheetRow) => parseCashRow(row),
  async plan(db, ctx, rows) {
    const keys = cashNaturalKeys(PlanBuilder.valid(rows).map((row) => row.data));
    const [patients, imported] = await Promise.all([
      loadPatientIndex(db, ctx.organizationId),
      loadImportedKeys(db, ctx.organizationId, 'ImportedCashEntry', keys),
    ]);
    return planCashflow(rows, { patients, alreadyImported: imported });
  },
  async write(tx, ctx, plan) {
    const entries = plan.items.map((item) => ({ id: randomUUID(), ...item }));
    await tx.importedCashEntry.createMany({
      data: entries.map(({ id, data }) => ({
        id,
        organizationId: ctx.organizationId,
        clinicId: ctx.clinicId,
        batchId: ctx.batchId,
        kind: data.kind,
        patientId: data.patientId,
        counterpartyName: data.name,
        description: data.description ?? null,
        category: data.category ?? null,
        dueDate: data.dueDate ? dateOnlyUtc(data.dueDate) : null,
        paidAt: data.paidAt ? dateOnlyUtc(data.paidAt) : null,
        amount: data.amount,
        netAmount: data.netAmount ?? null,
        paid: data.paid,
        paymentMethod: data.paymentMethod ?? null,
        professionalName: data.professionalName ?? null,
        budgetCode: data.budgetCode ?? null,
        notes: data.notes ?? null,
      })),
    });
    return entries.map(({ id, naturalKey }) => ({ entity: 'ImportedCashEntry' as const, entityId: id, naturalKey }));
  },
};
