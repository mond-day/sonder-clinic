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

/** Labels pt-BR reutilizáveis no export (CSV/XLSX/PDF) e na UI. */
export const REPORT_COLUMN_LABELS: Record<string, string> = {
  professional: 'Profissional',
  sessions: 'Sessões',
  clinicalProduction: 'Produção clínica',
  averagePerSession: 'Média por sessão',
  procedure: 'Procedimento',
  procedureName: 'Procedimento',
  code: 'Código',
  total: 'Total',
  netReceipt: 'Recebimento líquido',
  share: 'Participação',
  patient: 'Paciente',
  fullName: 'Paciente',
  primaryPhone: 'Telefone',
  createdAt: 'Cadastro',
  status: 'Status',
  description: 'Descrição',
  dueDate: 'Vencimento',
  netAmount: 'Valor',
  paidAmount: 'Recebido',
  outstandingAmount: 'Saldo',
  effectiveStatus: 'Status',
  date: 'Data',
  occurredAt: 'Data',
  type: 'Tipo',
  amount: 'Valor',
  balance: 'Saldo acumulado',
  count: 'Quantidade',
  startAt: 'Início',
  endAt: 'Término',
  category: 'Categoria',
  title: 'Título',
  method: 'Forma de pagamento',
  paidAt: 'Pago em',
  clinicalDate: 'Data clínica',
  toothFdi: 'Elemento',
  generatedAt: 'Gerado em',
  laboratoryName: 'Laboratório',
  laboratory: 'Laboratório',
  daysOverdue: 'Dias em atraso',
  overdueAmount: 'Valor em atraso',
  inflow: 'Entrada',
  outflow: 'Saída',
  net: 'Saldo',
  templateName: 'Modelo',
  templateType: 'Tipo de documento',
};

export const REPORT_PRESENTATIONS: Record<string, ReportPresentation> = {
  appointments: {
    description: 'Consultas e compromissos no período, com paciente e profissional.',
    filters: ['period', 'clinic', 'professional', 'status'],
    columns: [
      { key: 'startAt', label: 'Início', type: 'date' },
      { key: 'patient', label: 'Paciente', type: 'text' },
      { key: 'professional', label: 'Profissional', type: 'text' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'category', label: 'Categoria', type: 'status' },
    ],
    summaries: [{ key: 'count', label: 'Agendamentos', type: 'integer', aggregate: 'count' }],
  },
  'no-shows': {
    description: 'Faltas e cancelamentos no período.',
    filters: ['period', 'clinic', 'status'],
    columns: [
      { key: 'startAt', label: 'Data', type: 'date' },
      { key: 'patient', label: 'Paciente', type: 'text' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
    summaries: [{ key: 'count', label: 'Ocorrências', type: 'integer', aggregate: 'count' }],
  },
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
  'treatment-plans': {
    description: 'Planos de tratamento criados no período.',
    filters: ['period', 'clinic', 'status'],
    columns: [
      { key: 'title', label: 'Plano', type: 'text' },
      { key: 'patient', label: 'Paciente', type: 'text' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'total', label: 'Valor', type: 'currency', align: 'right' },
      { key: 'createdAt', label: 'Criado em', type: 'date' },
    ],
    summaries: [
      { key: 'count', label: 'Planos', type: 'integer', aggregate: 'count' },
      { key: 'total', label: 'Valor total', type: 'currency', aggregate: 'sum', sourceKey: 'total' },
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
  delinquency: {
    description: 'Títulos vencidos e valores em atraso.',
    filters: ['period', 'clinic', 'patient'],
    columns: [
      { key: 'patient', label: 'Paciente', type: 'text' },
      { key: 'description', label: 'Descrição', type: 'text' },
      { key: 'dueDate', label: 'Vencimento', type: 'date' },
      { key: 'outstandingAmount', label: 'Saldo', type: 'currency', align: 'right' },
      { key: 'overdueAmount', label: 'Em atraso', type: 'currency', align: 'right' },
      { key: 'daysOverdue', label: 'Dias em atraso', type: 'integer', align: 'right' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
    summaries: [
      { key: 'outstandingAmount', label: 'Em atraso', type: 'currency', aggregate: 'sum', sourceKey: 'outstandingAmount' },
    ],
  },
  revenues: {
    description: 'Receitas confirmadas no período.',
    filters: ['period', 'clinic'],
    columns: [
      { key: 'paidAt', label: 'Data', type: 'date' },
      { key: 'patient', label: 'Paciente', type: 'text' },
      { key: 'method', label: 'Forma', type: 'status' },
      { key: 'amount', label: 'Valor', type: 'currency', align: 'right' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
    summaries: [
      { key: 'amount', label: 'Receitas', type: 'currency', aggregate: 'sum', sourceKey: 'amount' },
    ],
    chart: { enabled: true, labelKey: 'method', valueKey: 'amount' },
  },
  expenses: {
    description: 'Despesas e contas a pagar no período.',
    filters: ['period', 'clinic', 'status'],
    columns: [
      { key: 'dueDate', label: 'Vencimento', type: 'date' },
      { key: 'description', label: 'Descrição', type: 'text' },
      { key: 'amount', label: 'Valor', type: 'currency', align: 'right' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'category', label: 'Categoria', type: 'text' },
    ],
    summaries: [
      { key: 'amount', label: 'Despesas', type: 'currency', aggregate: 'sum', sourceKey: 'amount' },
    ],
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
  laboratories: {
    description: 'Trabalhos laboratoriais e status de entrega.',
    filters: ['period', 'clinic', 'status'],
    columns: [
      { key: 'patient', label: 'Paciente', type: 'text' },
      { key: 'description', label: 'Descrição', type: 'text' },
      { key: 'laboratoryName', label: 'Laboratório', type: 'text' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'dueAt', label: 'Prazo', type: 'date' },
      { key: 'cost', label: 'Custo', type: 'currency', align: 'right' },
    ],
    summaries: [{ key: 'count', label: 'Casos', type: 'integer', aggregate: 'count' }],
  },
  documents: {
    description: 'Documentos gerados no período.',
    filters: ['period', 'clinic', 'status'],
    columns: [
      { key: 'generatedAt', label: 'Gerado em', type: 'date' },
      { key: 'patient', label: 'Paciente', type: 'text' },
      { key: 'templateName', label: 'Modelo', type: 'text' },
      { key: 'templateType', label: 'Tipo', type: 'status' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
    summaries: [{ key: 'count', label: 'Documentos', type: 'integer', aggregate: 'count' }],
  },
  'clinical-entries': {
    description: 'Evoluções clínicas registradas no período.',
    filters: ['period', 'clinic', 'status'],
    columns: [
      { key: 'clinicalDate', label: 'Data clínica', type: 'date' },
      { key: 'type', label: 'Tipo', type: 'status' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'toothFdi', label: 'Elemento', type: 'text' },
    ],
    summaries: [{ key: 'count', label: 'Evoluções', type: 'integer', aggregate: 'count' }],
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
      label: REPORT_COLUMN_LABELS[key] ?? key
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/_/g, ' ')
        .replace(/^\w/, (c) => c.toUpperCase()),
      type: 'text' as const,
      align: 'left' as const,
    }));
}

export function labelExportRows(rows: Array<Record<string, unknown>>, reportId: string) {
  const presentation = presentationFor(reportId);
  const columns = resolveColumns(presentation, rows);
  if (!columns.length) {
    return rows.map((row) => {
      const next: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        if (isTechnicalIdKey(key)) continue;
        next[REPORT_COLUMN_LABELS[key] ?? key] = value;
      }
      return next;
    });
  }
  return rows.map((row) => {
    const next: Record<string, unknown> = {};
    for (const column of columns) {
      next[column.label] = row[column.key];
    }
    return next;
  });
}
