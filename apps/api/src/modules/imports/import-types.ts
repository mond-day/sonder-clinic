import type { Prisma } from '@sonder/database';

/** Espelha o enum `ImportKind` do schema Prisma. */
export type ImportKind = 'PATIENTS' | 'TREATMENT_PLANS' | 'TREATMENTS' | 'APPOINTMENTS' | 'CASHFLOW';

export type AppointmentStatus =
  | 'SCHEDULED' | 'CONFIRMED' | 'CHECKED_IN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export type CellValue = string | number | boolean | Date | null;

export type SheetRow = { rowNumber: number; cells: Record<string, CellValue> };

export type Db = Prisma.TransactionClient;

export type RowStatus = 'CREATE' | 'SKIP' | 'ERROR';

export type RowReport = { rowNumber: number; status: RowStatus; messages: string[] };

/** Linha lida e validada pelo parser da planilha (sem acesso a banco). */
export type ParsedRow<T> = { rowNumber: number; data?: T; errors: string[]; warnings: string[] };

export type PlannedItem<T> = { rowNumber: number; naturalKey: string; data: T };

export type ImportPlan<T> = {
  rows: RowReport[];
  items: PlannedItem<T>[];
  /** Impedem a gravação do lote inteiro (ex.: unidade não definida). */
  blocking: string[];
  warnings: string[];
  creations: Array<{ label: string; names: string[] }>;
  mappings: Array<{ label: string; from: string; to: string }>;
  sample: Array<Record<string, string>>;
};

export type ImportOptions = { clinicId: string; unitId?: string };

export type ImportContext = {
  organizationId: string;
  clinicId: string;
  actorId: string;
  options: ImportOptions;
  now: Date;
  timezone: string;
};

export type WriteContext = ImportContext & { batchId: string };

export type WrittenRecord = { entity: ImportEntity; entityId: string; naturalKey?: string | null };

export type ImportEntity =
  | 'Patient'
  | 'Guardian'
  | 'TreatmentPlan'
  | 'TreatmentItem'
  | 'TreatmentSession'
  | 'Procedure'
  | 'Appointment'
  | 'AgendaTag'
  | 'ImportedCashEntry';

export type ImportDefinition<TParsed, TPlanned> = {
  kind: ImportKind;
  label: string;
  /** Permissão já usada para criar esse cadastro manualmente. */
  permission: string;
  /** Entidade que carrega a chave natural de cada linha. */
  rowEntity: ImportEntity;
  requiredColumns: readonly string[];
  optionalColumns: readonly string[];
  parseRow(row: SheetRow, ctx: ImportContext): ParsedRow<TParsed>;
  plan(db: Db, ctx: ImportContext, rows: ParsedRow<TParsed>[]): Promise<ImportPlan<TPlanned>>;
  write(tx: Db, ctx: WriteContext, plan: ImportPlan<TPlanned>): Promise<WrittenRecord[]>;
};

export function emptyPlan<T>(): ImportPlan<T> {
  return { rows: [], items: [], blocking: [], warnings: [], creations: [], mappings: [], sample: [] };
}
