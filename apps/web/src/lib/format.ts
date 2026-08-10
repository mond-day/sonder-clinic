'use client';

export type RecordValue = Record<string, unknown>;

export const text = (value: unknown, fallback = '—') =>
  value === null || value === undefined || value === '' ? fallback : String(value);

export const list = (value: unknown): RecordValue[] =>
  Array.isArray(value) ? (value as RecordValue[]) : [];

export const nested = (item: RecordValue, key: string): RecordValue =>
  (item[key] && typeof item[key] === 'object' ? item[key] : {}) as RecordValue;

export const currency = (value: unknown) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0));

export const number = (value: unknown, options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat('pt-BR', options).format(Number(value ?? 0));

export const dateTime = (value: unknown) =>
  value
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(String(value)))
    : '—';

export const dateOnly = (value: unknown) =>
  value
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(String(value)))
    : '—';

export const timeOnly = (value: unknown) =>
  value
    ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(String(value)))
    : '—';

export function initials(name: unknown) {
  return text(name, '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function maskCpf(cpf: unknown) {
  const digits = String(cpf ?? '').replace(/\D/g, '');
  if (digits.length !== 11) return digits ? '•••.***.***-••' : '—';
  return `•••.${digits.slice(3, 6)}.***-**`;
}

export function ageLabel(birthDate: unknown) {
  if (!birthDate) return null;
  const birth = new Date(String(birthDate));
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const month = now.getMonth() - birth.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < birth.getDate())) age -= 1;
  return `${age} anos`;
}

export function hasPermission(permissions: string[] | undefined, ...required: string[]) {
  if (!permissions?.length) return false;
  if (permissions.includes('organization.manage')) return true;
  return required.some((item) => permissions.includes(item));
}

export function statusTone(status: unknown): 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'purple' {
  const value = String(status ?? '').toUpperCase();
  if (['CONFIRMED', 'PAID', 'SIGNED', 'COMPLETED', 'ACTIVE', 'APPROVED', 'DELIVERED'].includes(value)) return 'green';
  if (['SCHEDULED', 'PENDING', 'PLANNED', 'PARTIAL', 'PARTIALLY_APPROVED', 'PARTIALLY_PAID'].includes(value)) return 'amber';
  if (['IN_PROGRESS'].includes(value)) return 'purple';
  if (['OVERDUE', 'CANCELLED', 'FAILED', 'NO_SHOW', 'ARCHIVED', 'BLOCKED'].includes(value)) return 'red';
  if (['ARRIVED', 'WAITING', 'CHECKED_IN', 'DRAFT', 'OPEN'].includes(value)) return 'blue';
  return 'gray';
}

/** Cor do card de evento na agenda — alinhada ao status do agendamento. */
export function appointmentEventTone(status: unknown): 'teal' | 'blue' | 'amber' | 'purple' | 'green' | 'red' | 'gray' {
  const value = String(status ?? '').toUpperCase();
  switch (value) {
    case 'SCHEDULED':
      return 'blue';
    case 'CONFIRMED':
      return 'green';
    case 'CHECKED_IN':
      return 'teal';
    case 'IN_PROGRESS':
      return 'purple';
    case 'COMPLETED':
      return 'gray';
    case 'CANCELLED':
      return 'red';
    case 'NO_SHOW':
      return 'amber';
    default:
      return 'blue';
  }
}

const presentationLabels: Record<string, string> = {
  SCHEDULED: 'Agendado', CONFIRMED: 'Confirmado', CHECKED_IN: 'Na clínica',
  IN_PROGRESS: 'Em andamento', COMPLETED: 'Concluído', NO_SHOW: 'Falta',
  OPEN: 'Em aberto', PARTIALLY_PAID: 'Parcialmente pago', PAID: 'Pago', OVERDUE: 'Vencido',
  CANCELLED: 'Cancelado', FORECASTED: 'Previsto', GENERATED: 'Gerado', RELEASED: 'Liberado',
  REVERSED: 'Estornado', BLOCKED: 'Bloqueado', PAYMENT: 'Recebimento',
  PROCEDURE: 'Procedimento', PERCENTAGE: 'Percentual', FIXED: 'Valor fixo',
  PENDING: 'Pendente', SENT: 'Enviado', DELIVERED: 'Entregue', READ: 'Lido', FAILED: 'Falhou',
  ACTIVE: 'Ativo', DISABLED: 'Desativado', ERROR: 'Erro', REVIEW_REQUIRED: 'Revisão obrigatória',
  INACTIVE: 'Inativo', ARCHIVED: 'Arquivado', DRAFT: 'Rascunho', SIGNED: 'Assinado',
  PUBLISHED: 'Publicado', ARCHIVED_TEMPLATE: 'Arquivado',
  CORRECTED: 'Corrigido', PARTIALLY_SIGNED: 'Parcialmente assinado', PRESENTED: 'Apresentado',
  PARTIALLY_APPROVED: 'Parcialmente aprovado', APPROVED: 'Aprovado',
  INBOX: 'Entrada', TODAY: 'Hoje', UPCOMING: 'Próximas', DONE: 'Concluído',
  LOW: 'Baixa', NORMAL: 'Normal', HIGH: 'Alta',
  PATIENT: 'Paciente', FINANCE: 'Financeiro', LAB: 'Laboratório', SCHEDULE: 'Agenda',
  STOCK: 'Estoque', ADMIN: 'Administrativo', REQUESTED: 'Solicitado', IN_LAB: 'No laboratório',
  RETURNED: 'Retornado', INSTALLED: 'Instalado', CONTACTED: 'Contatado', DISMISSED: 'Dispensado',
  WHATSAPP: 'WhatsApp', PHONE: 'Telefone', EMAIL: 'E-mail', IN_PERSON: 'Presencial',
  CLINICAL: 'Clínico', TASK: 'Tarefa', WARNING: 'Atenção', CRITICAL: 'Crítico', INFO: 'Informação',
  PERMANENT: 'Permanente', DECIDUOUS: 'Decídua', EXISTING: 'Existente', PLANNED: 'Planejado',
  OBSERVATION: 'Observação', EVOLUTION: 'Evolução', MODEL: 'Modelo', TEMPLATE: 'Modelo',
  READY: 'Pronto', MISSING_CONFIG: 'Configuração ausente', LIVE: 'Produção', MOCK: 'Simulação',
  CLINIC: 'Clínica', PROFESSIONAL: 'Profissional', ENVIRONMENT: 'Ambiente', TENANT: 'Clínica',
  ADULT: 'Adulto', CHILD: 'Infantil', ELDERLY: 'Idoso', PREGNANT: 'Gestante',
  APPOINTMENTS: 'Agenda', FINANCIAL: 'Financeiro', COMMISSIONS: 'Comissões',
  COMMUNICATION: 'Comunicação', CLOSED: 'Fechado',
  AWAITING_SIGNATURE: 'Aguardando assinatura',
  SUPERSEDED: 'Substituído',
  TITLE: 'Título', HEADER: 'Cabeçalho', BODY: 'Corpo', FOOTER: 'Rodapé', SIGNATURE: 'Assinatura',
  ACCEPTED: 'Aceito', REVOKED: 'Revogado', EXPIRED: 'Expirado',
  PAYABLE: 'Conta a pagar', RECEIVABLE: 'Conta a receber',
  DAILY: 'Diária', WEEKLY: 'Semanal', MONTHLY: 'Mensal', YEARLY: 'Anual',
  PRODUCTION: 'Produção', RECEIPT: 'Recebimento',
  APPOINTMENT_COMPLETED: 'Consulta concluída',
};

export const presentationLabel = (value: unknown) => {
  const key = String(value ?? '').toUpperCase();
  return presentationLabels[key] ?? text(value);
};

export function dayBounds(reference = new Date()) {
  const from = new Date(reference);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to };
}
