import type { z } from 'zod';
import { emptyPlan, type ImportPlan, type ParsedRow, type RowReport } from './import-types';

/**
 * Valida a linha já normalizada com o schema Zod da planilha.
 * `errors` vem de checagens que precisam de mensagem específica (ex.: celular sem DDD);
 * `reportedFields` evita repetir, para o mesmo campo, a mensagem genérica do Zod.
 */
export function parsedRow<T>(
  rowNumber: number,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  input: unknown,
  errors: string[],
  warnings: string[],
  reportedFields: string[] = [],
): ParsedRow<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const messages = result.error.issues
      .filter((issue) => !reportedFields.includes(String(issue.path[0])))
      .map((issue) => issue.message);
    return { rowNumber, errors: [...new Set([...errors, ...messages])], warnings };
  }
  return errors.length ? { rowNumber, errors, warnings } : { rowNumber, data: result.data, errors, warnings };
}

export type ValidRow<T> = { rowNumber: number; data: T; warnings: string[] };

export const SAMPLE_SIZE = 8;

/** Acumula a decisão de cada linha; linhas com erro de parse já entram como ERROR. */
export class PlanBuilder<T> {
  private readonly plan = emptyPlan<T>();
  private readonly reports = new Map<number, RowReport>();

  constructor(rows: ParsedRow<unknown>[]) {
    for (const row of rows) {
      if (row.errors.length) {
        this.reports.set(row.rowNumber, { rowNumber: row.rowNumber, status: 'ERROR', messages: [...row.errors, ...row.warnings] });
      }
    }
  }

  static valid<U>(rows: ParsedRow<U>[]): ValidRow<U>[] {
    return rows.flatMap((row) => (row.data && !row.errors.length ? [{ rowNumber: row.rowNumber, data: row.data, warnings: row.warnings }] : []));
  }

  isDecided(rowNumber: number): boolean {
    return this.reports.has(rowNumber);
  }

  error(rowNumber: number, message: string, warnings: string[] = []): void {
    this.reports.set(rowNumber, { rowNumber, status: 'ERROR', messages: [message, ...warnings] });
  }

  skip(rowNumber: number, message: string): void {
    this.reports.set(rowNumber, { rowNumber, status: 'SKIP', messages: [message] });
  }

  create(rowNumber: number, naturalKey: string, data: T, warnings: string[] = []): void {
    this.reports.set(rowNumber, { rowNumber, status: 'CREATE', messages: warnings });
    this.plan.items.push({ rowNumber, naturalKey, data });
  }

  blocking(message: string): void {
    this.plan.blocking.push(message);
  }

  warning(message: string): void {
    this.plan.warnings.push(message);
  }

  creation(label: string, names: string[]): void {
    if (names.length) this.plan.creations.push({ label, names: [...names].sort((a, b) => a.localeCompare(b, 'pt-BR')) });
  }

  mappings(values: ImportPlan<T>['mappings']): void {
    this.plan.mappings.push(...values);
  }

  sample(toRow: (item: T, rowNumber: number) => Record<string, string>): void {
    this.plan.sample = this.plan.items.slice(0, SAMPLE_SIZE).map((item) => toRow(item.data, item.rowNumber));
  }

  build(): ImportPlan<T> {
    if (this.plan.blocking.length) this.plan.items = [];
    this.plan.rows = [...this.reports.values()].sort((a, b) => a.rowNumber - b.rowNumber);
    return this.plan;
  }
}

/** Agrupa linhas por chave e devolve só os grupos com mais de uma linha. */
export function duplicateGroups<T>(rows: ValidRow<T>[], key: (row: ValidRow<T>) => string | undefined): ValidRow<T>[][] {
  const groups = new Map<string, ValidRow<T>[]>();
  for (const row of rows) {
    const value = key(row);
    if (!value) continue;
    groups.set(value, [...(groups.get(value) ?? []), row]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}
