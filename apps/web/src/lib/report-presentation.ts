export type ReportFilterKey = 'period' | 'clinic' | 'professional' | 'status' | 'patient' | 'procedure';

export type ReportColumnType = 'text' | 'integer' | 'currency' | 'percent' | 'date' | 'status';

export type ReportColumnDefinition = {
  key: string;
  label: string;
  type: ReportColumnType;
  align?: 'left' | 'center' | 'right';
};

export type ReportPresentation = {
  description: string;
  filters: ReportFilterKey[];
  columns: ReportColumnDefinition[];
  summaries?: Array<{
    key: string;
    label: string;
    type: 'currency' | 'integer' | 'percent';
    /** Derive from rows when API meta is absent */
    aggregate?: 'sum' | 'count' | 'avg';
    sourceKey?: string;
  }>;
  chart?: {
    enabled: boolean;
    labelKey: string;
    valueKey: string;
  };
};

const ALWAYS_HIDDEN = new Set([
  'id',
  'organizationId',
  'clinicId',
  'patientId',
  'professionalId',
  'procedureId',
  'treatmentId',
  'treatmentPlanId',
  'receivableId',
  'paymentId',
  'actorId',
  'userId',
  'correlationId',
  'idempotencyKey',
  'sourceResponseId',
  'supersededById',
  'version',
]);

export function isTechnicalIdKey(key: string) {
  if (ALWAYS_HIDDEN.has(key)) return true;
  return key.endsWith('Id');
}

export const REPORT_PRESENTATIONS: Record<string, ReportPresentation> = {
  'production-professional': {
    description: 'Sessões concluídas e produção clínica realizada por profissional.',
    filters: ['period', 'clinic', 'professional'],
    columns: [
      { key: 'professional', label: 'Profissional', type: 'text' },
      { key: 'sessions', label: 'Sessões', type: 'integer', align: 'right' },
      { key: 'clinicalProduction', label: 'Produção clínica', type: 'currency', align: 'right' },
      { key: 'averagePerSession', label: 'Média por sessão', type: 'currency', align: 'right' },
    ],
    summaries: [
      { key: 'clinicalProduction', label: 'Produção clínica', type: 'currency', aggregate: 'sum', sourceKey: 'clinicalProduction' },
      { key: 'sessions', label: 'Sessões concluídas', type: 'integer', aggregate: 'sum', sourceKey: 'sessions' },
      { key: 'averagePerSession', label: 'Média por sessão', type: 'currency', aggregate: 'avg', sourceKey: 'clinicalProduction' },
    ],
    chart: { enabled: true, labelKey: 'professional', valueKey: 'clinicalProduction' },
  },
  'production-procedure': {
    description: 'Produção clínica a partir das sessões efetivamente realizadas.',
    filters: ['period', 'clinic', 'procedure'],
    columns: [
      { key: 'procedure', label: 'Procedimento', type: 'text' },
      { key: 'procedureName', label: 'Procedimento', type: 'text' },
      { key: 'code', label: 'Código', type: 'text' },
      { key: 'sessions', label: 'Sessões', type: 'integer', align: 'right' },
      { key: 'clinicalProduction', label: 'Produção clínica', type: 'currency', align: 'right' },
      { key: 'total', label: 'Produção clínica', type: 'currency', align: 'right' },
    ],
    summaries: [
      { key: 'clinicalProduction', label: 'Produção clínica', type: 'currency', aggregate: 'sum', sourceKey: 'clinicalProduction' },
      { key: 'procedures', label: 'Procedimentos', type: 'integer', aggregate: 'count' },
      { key: 'sessions', label: 'Sessões', type: 'integer', aggregate: 'sum', sourceKey: 'sessions' },
    ],
    chart: { enabled: true, labelKey: 'procedureName', valueKey: 'clinicalProduction' },
  },
  'receipt-procedure': {
    description: 'Recebimentos líquidos ligados aos procedimentos executados.',
    filters: ['period', 'clinic'],
    columns: [
      { key: 'procedure', label: 'Procedimento', type: 'text' },
      { key: 'procedureName', label: 'Procedimento', type: 'text' },
      { key: 'sessions', label: 'Sessões elegíveis', type: 'integer', align: 'right' },
      { key: 'netReceipt', label: 'Recebimento líquido', type: 'currency', align: 'right' },
      { key: 'total', label: 'Recebimento líquido', type: 'currency', align: 'right' },
      { key: 'share', label: 'Participação', type: 'percent', align: 'right' },
    ],
    summaries: [
      { key: 'netReceipt', label: 'Recebido', type: 'currency', aggregate: 'sum', sourceKey: 'netReceipt' },
      { key: 'procedures', label: 'Procedimentos', type: 'integer', aggregate: 'count' },
    ],
    chart: { enabled: true, labelKey: 'procedureName', valueKey: 'netReceipt' },
  },
  'new-patients': {
    description: 'Pacientes cadastrados e evolução do volume de novos cadastros.',
    filters: ['period', 'clinic'],
    columns: [
      { key: 'patient', label: 'Paciente', type: 'text' },
      { key: 'fullName', label: 'Paciente', type: 'text' },
      { key: 'primaryPhone', label: 'Telefone', type: 'text' },
      { key: 'createdAt', label: 'Cadastro', type: 'date' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
    summaries: [
      { key: 'count', label: 'Novos pacientes', type: 'integer', aggregate: 'count' },
    ],
  },
  receivables: {
    description: 'Títulos, recebimentos e saldos em aberto no período.',
    filters: ['period', 'clinic', 'status', 'patient'],
    columns: [
      { key: 'patient', label: 'Paciente', type: 'text' },
      { key: 'description', label: 'Descrição', type: 'text' },
      { key: 'dueDate', label: 'Vencimento', type: 'date' },
      { key: 'netAmount', label: 'Valor', type: 'currency', align: 'right' },
      { key: 'paidAmount', label: 'Recebido', type: 'currency', align: 'right' },
      { key: 'outstandingAmount', label: 'Saldo', type: 'currency', align: 'right' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'effectiveStatus', label: 'Status', type: 'status' },
    ],
    summaries: [
      { key: 'outstandingAmount', label: 'Em aberto', type: 'currency', aggregate: 'sum', sourceKey: 'outstandingAmount' },
      { key: 'paidAmount', label: 'Recebido', type: 'currency', aggregate: 'sum', sourceKey: 'paidAmount' },
    ],
    chart: { enabled: true, labelKey: 'patient', valueKey: 'outstandingAmount' },
  },
  cashflow: {
    description: 'Entradas, saídas e saldo realizado no período.',
    filters: ['period', 'clinic'],
    columns: [
      { key: 'date', label: 'Data', type: 'date' },
      { key: 'occurredAt', label: 'Data', type: 'date' },
      { key: 'description', label: 'Descrição', type: 'text' },
      { key: 'type', label: 'Tipo', type: 'status' },
      { key: 'amount', label: 'Valor', type: 'currency', align: 'right' },
      { key: 'balance', label: 'Saldo acumulado', type: 'currency', align: 'right' },
    ],
    summaries: [
      { key: 'inflow', label: 'Entradas', type: 'currency', aggregate: 'sum', sourceKey: 'amount' },
      { key: 'outflow', label: 'Saídas', type: 'currency', aggregate: 'sum', sourceKey: 'amount' },
    ],
  },
  'budget-conversion': {
    description: 'Apresentação, aprovação e conversão dos planos de tratamento.',
    filters: ['period', 'clinic'],
    columns: [
      { key: 'status', label: 'Situação', type: 'status' },
      { key: 'count', label: 'Quantidade', type: 'integer', align: 'right' },
      { key: 'total', label: 'Valor total', type: 'currency', align: 'right' },
      { key: 'share', label: 'Participação', type: 'percent', align: 'right' },
    ],
    summaries: [
      { key: 'count', label: 'Apresentados', type: 'integer', aggregate: 'sum', sourceKey: 'count' },
    ],
  },
};

export function presentationFor(reportId: string): ReportPresentation {
  return REPORT_PRESENTATIONS[reportId] ?? {
    description: 'Consulta operacional com dados apresentados em linguagem de negócio.',
    filters: ['period', 'clinic'],
    columns: [],
    summaries: [{ key: 'rows', label: 'Resultados', type: 'integer', aggregate: 'count' }],
  };
}

export function resolveColumns(presentation: ReportPresentation, rows: Array<Record<string, unknown>>) {
  const sample = rows[0] ?? {};
  const defined = presentation.columns.filter((column) => column.key in sample || rows.length === 0);
  if (defined.length) {
    const seen = new Set<string>();
    return defined.filter((column) => {
      if (isTechnicalIdKey(column.key)) return false;
      // Prefer human name over duplicate keys pointing to same label when both exist
      if (seen.has(column.label) && !(column.key in sample)) return false;
      if (column.key in sample) {
        if (seen.has(column.label)) return false;
        seen.add(column.label);
        return true;
      }
      return false;
    });
  }
  return Object.keys(sample)
    .filter((key) => !isTechnicalIdKey(key))
    .map((key) => ({
      key,
      label: key
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/_/g, ' ')
        .replace(/^\w/, (c) => c.toUpperCase()),
      type: 'text' as const,
      align: 'left' as const,
    }));
}
