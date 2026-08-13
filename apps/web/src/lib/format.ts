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

/** Máscara BRL progressiva para inputs (centavos conforme o usuário digita). */
export function maskMoneyInput(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 12);
  if (!digits) return '';
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number(digits) / 100);
}

/** Converte valor mascarado ou numérico da API para o texto do input. */
export function formatMoneyInputFromValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const raw = String(value).trim();
  if (!raw) return '';
  if (/^\d+([.,]\d{1,2})?$/.test(raw)) {
    return maskMoneyInput(String(Math.round(Number(raw.replace(',', '.')) * 100)));
  }
  const digits = raw.replace(/\D/g, '');
  return digits ? maskMoneyInput(digits) : '';
}

/** Valor `1234.56` para envio à API a partir do campo mascarado. */
export function moneyInputToApi(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '0';
  if (/^\d+([.]\d{1,2})?$/.test(raw)) return Number(raw).toFixed(2);
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '0';
  return (Number(digits) / 100).toFixed(2);
}

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

/** Valor local para `<input type="datetime-local">` (evita deslocar horário via toISOString/UTC). */
export function toDatetimeLocalValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Valor local para `<input type="date">`. */
export function toDateInputValue(value: unknown = new Date()) {
  if (value === null || value === undefined || value === '') return '';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Converte `YYYY-MM-DD` para ISO ao meio-dia local, evitando virar o dia anterior em UTC. */
export function dateInputToIso(value: string) {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;
  return `${trimmed}T12:00:00`;
}

export function initials(name: unknown) {
  return text(name, '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

/** CPF completo: xxx.xxx.xxx-xx */
export function formatCpf(cpf: unknown) {
  const digits = String(cpf ?? '').replace(/\D/g, '');
  if (!digits) return '—';
  if (digits.length !== 11) return digits;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/** Máscara progressiva de CPF para inputs (`xxx.xxx.xxx-xx`). */
export function maskCpfInput(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/** Dígitos de CPF para envio à API. */
export function cpfDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '');
}

/** Menor de 18 anos a partir de `YYYY-MM-DD` (ou ISO). */
export function isMinorFromBirthDate(birthDate: unknown, today = new Date()) {
  if (!birthDate) return false;
  const raw = String(birthDate).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return false;
  const birth = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(birth.getTime())) return false;
  const eighteenth = new Date(birth.getFullYear() + 18, birth.getMonth(), birth.getDate());
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return day < eighteenth;
}

/** CPF parcialmente oculto: •••.xxx.***-** */
export function maskCpf(cpf: unknown) {
  const digits = String(cpf ?? '').replace(/\D/g, '');
  if (digits.length !== 11) return digits ? '•••.***.***-••' : '—';
  return `•••.${digits.slice(3, 6)}.***-**`;
}

/**
 * Telefone para exibição:
 * - (xx) xxxx-xxxx
 * - (xx) xxxxx-xxxx
 * - +xx (xx) xxxxx-xxxx quando houver DDI
 */
export function formatPhone(phone: unknown) {
  const raw = String(phone ?? '').trim();
  if (!raw) return '—';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '—';

  let country = '';
  let national = digits;

  if (raw.startsWith('+') || digits.length > 11) {
    if (digits.startsWith('55') && digits.length >= 12) {
      country = '+55';
      national = digits.slice(2);
    } else {
      const nationalLen = digits.length >= 13 ? 11 : 10;
      const countryDigits = digits.slice(0, Math.max(0, digits.length - nationalLen));
      if (countryDigits) {
        country = `+${countryDigits}`;
        national = digits.slice(countryDigits.length);
      }
    }
  }

  let local = national;
  if (national.length === 11) {
    local = `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
  } else if (national.length === 10) {
    local = `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
  } else if (national.length >= 8) {
    return country ? `${country} ${national}` : national;
  } else {
    return raw;
  }

  return country ? `${country} ${local}` : local;
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

/** Dias até o próximo aniversário (0 = hoje). */
export function daysUntilBirthday(birthDate: unknown): number | null {
  if (!birthDate) return null;
  const raw = String(birthDate).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const birth = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(String(birthDate));
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
  if (next < today) next = new Date(today.getFullYear() + 1, birth.getMonth(), birth.getDate());
  return Math.round((next.getTime() - today.getTime()) / 86_400_000);
}

/** Máscara progressiva de telefone BR para inputs (mantém só dígitos úteis). */
export function maskPhoneInput(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 13);
  if (!digits) return '';
  let country = '';
  let national = digits;
  if (digits.startsWith('55') && digits.length > 11) {
    country = '+55 ';
    national = digits.slice(2, 13);
  } else {
    national = digits.slice(0, 11);
  }
  if (national.length <= 2) return `${country}(${national}`;
  if (national.length <= 6) return `${country}(${national.slice(0, 2)}) ${national.slice(2)}`;
  if (national.length <= 10) {
    return `${country}(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
  }
  return `${country}(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
}

/** Dígitos de telefone para envio à API. */
export function phoneDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '');
}

/** Máscara de CEP `00000-000`. */
export function formatPostalCode(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
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
  PATIENT: 'Paciente', GUARDIAN: 'Responsável', PROVIDER: 'Prestador',
  FINANCE: 'Financeiro', LAB: 'Laboratório', SCHEDULE: 'Agenda',
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
  SIGNATURE_REQUESTED: 'Assinatura solicitada',
  SIGNATURE_REQUEST_REVOKED: 'Solicitação de assinatura revogada',
  SIGNATURE_REQUEST_USED: 'Assinatura concluída pelo link',
  DOCUMENT_GENERATED: 'Documento gerado',
  DOCUMENT_CANCELLED: 'Documento cancelado',
  DOCUMENT_ARCHIVED: 'Documento arquivado',
  REMOTE_LINK: 'Link remoto',
  DRAWN: 'Assinatura na tela',
  ELECTRONIC_LOCAL: 'Assinatura eletrônica (presencial)',
  ELECTRONIC_REMOTE: 'Assinatura eletrônica (link)',
  A1: 'Certificado digital',
  MOCK_A1: 'Assinatura de teste',
  CONTRACT: 'Contrato',
  TREATMENT_PLAN: 'Plano de tratamento',
  ODONTOGRAM: 'Odontograma',
  CLINIC_INSTALLMENT: 'Parcelado na clínica',
  CREDIT_CARD: 'Cartão de crédito',
  DEBIT_CARD: 'Cartão de débito',
  CASH: 'Dinheiro',
  TRANSFER: 'Transferência',
  PIX: 'PIX',
  IMAGING: 'Imagem',
  PHOTO: 'Fotografia',
  OTHER: 'Outro',
  OPTIONAL: 'Opcional',
  REQUIRED: 'Obrigatória',
  NOT_APPLICABLE: 'Não se aplica',
  ATTESTATION: 'Atestado',
  CERTIFICATE: 'Atestado',
  PRESCRIPTION: 'Receita',
  EXAM_REQUEST: 'Solicitação de exame',
  DECLARATION: 'Declaração',
  CONSENT: 'Termo de consentimento',
  REFERRAL: 'Encaminhamento',
  CUSTOM: 'Personalizado',
  PROFILE_PHOTO: 'Foto de perfil',
  CLEAN: 'Verificado',
  INFECTED: 'Bloqueado',
  PENDING_SCAN: 'Em verificação',
  QUARANTINED: 'Em quarentena',
};

export const presentationLabel = (value: unknown) => {
  const key = String(value ?? '').toUpperCase();
  return presentationLabels[key] ?? text(value);
};

/** Fallback seguro para eventos exibidos ao usuário. */
export function presentationEventLabel(type: unknown) {
  const key = String(type ?? '').toUpperCase();
  if (!key) return 'Evento do documento';
  return presentationLabels[key] ?? 'Evento do documento';
}

export function dayBounds(reference = new Date()) {
  const from = new Date(reference);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to };
}
