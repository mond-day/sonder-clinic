export type ImportSlug = 'patients' | 'treatment-plans' | 'treatments' | 'appointments' | 'cashflow';

export type ImportRowIssue = { rowNumber: number; status: 'CREATE' | 'SKIP' | 'ERROR'; messages: string[] };

export type ImportPreview = {
  kind: ImportSlug;
  label: string;
  fileName: string;
  totalRows: number;
  counts: { create: number; skip: number; error: number };
  blocking: string[];
  warnings: string[];
  creations: Array<{ label: string; names: string[] }>;
  mappings: Array<{ label: string; from: string; to: string }>;
  ignoredColumns: string[];
  issues: ImportRowIssue[];
  issuesTruncated: number;
  sample: Array<Record<string, string>>;
  canCommit: boolean;
};

export type ImportCommitResult = {
  batchId: string;
  kind: ImportSlug;
  counts: { create: number; skip: number; error: number };
  written: Record<string, number>;
};

export type ImportBatch = {
  id: string;
  kind: ImportSlug;
  status: 'COMMITTED' | 'REVERTED';
  fileName: string;
  summary: { totalRows?: number; create?: number; written?: Record<string, number> };
  createdAt: string;
  revertedAt: string | null;
};

export const IMPORT_KINDS: Record<ImportSlug, { label: string; title: string; permission: string; hint: string }> = {
  patients: {
    label: 'Pacientes',
    title: 'Importar pacientes',
    permission: 'patient.create',
    hint: 'Pacientes já cadastrados (mesmo CPF ou mesmo nome) são mantidos como estão. Linhas sem celular com DDD ficam de fora.',
  },
  'treatment-plans': {
    label: 'Orçamentos',
    title: 'Importar orçamentos',
    permission: 'treatment.create',
    hint: 'Cada orçamento vira um plano de tratamento (Aprovado ou Apresentado). Importe os pacientes antes.',
  },
  treatments: {
    label: 'Tratamentos',
    title: 'Importar tratamentos',
    permission: 'treatment.create',
    hint: 'Os itens são agrupados em um plano “Tratamentos importados” por paciente e profissional. Finalizados entram como concluídos.',
  },
  appointments: {
    label: 'Consultas',
    title: 'Importar consultas',
    permission: 'appointment.create',
    hint: 'Consultas passadas marcadas como Agendada ou Confirmada entram como concluídas. Nenhum lembrete ou evento do Google é enviado.',
  },
  cashflow: {
    label: 'Fluxo de caixa',
    title: 'Importar fluxo de caixa',
    permission: 'financial.create',
    hint: 'Somente consulta: não cria recebíveis, pagamentos nem contas a pagar e não sincroniza com o Nibo.',
  },
};

export const ENTITY_LABELS: Record<string, string> = {
  Patient: 'Pacientes',
  Guardian: 'Responsáveis',
  TreatmentPlan: 'Planos de tratamento',
  TreatmentItem: 'Itens de tratamento',
  TreatmentSession: 'Execuções registradas',
  Procedure: 'Procedimentos criados',
  Appointment: 'Consultas',
  AgendaTag: 'Etiquetas criadas',
  ImportedCashEntry: 'Lançamentos de caixa (consulta)',
};

export function writtenSummary(written: Record<string, number> | undefined): string {
  if (!written) return '';
  return Object.entries(written)
    .map(([entity, count]) => `${count} ${(ENTITY_LABELS[entity] ?? entity).toLowerCase()}`)
    .join(' · ');
}

/** Datas "somente dia" chegam como meia-noite UTC; formatar pela string evita voltar um dia no fuso local. */
export function isoDayLabel(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '—';
}
