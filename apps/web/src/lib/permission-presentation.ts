export type PermissionAction = 'view' | 'create' | 'edit' | 'cancel' | 'special';

export type PermissionPresentation = {
  area: string;
  action: PermissionAction;
  label: string;
  specialGroup?: string;
};

/** Metadata de apresentação — códigos continuam sendo enviados ao backend. */
export const PERMISSION_PRESENTATION: Record<string, PermissionPresentation> = {
  'patient.view': { area: 'Pacientes', action: 'view', label: 'Visualizar pacientes' },
  'patient.create': { area: 'Pacientes', action: 'create', label: 'Cadastrar pacientes' },
  'patient.update': { area: 'Pacientes', action: 'edit', label: 'Editar pacientes' },
  'patient.merge': { area: 'Pacientes', action: 'special', label: 'Mesclar duplicados', specialGroup: 'Pacientes' },
  'appointment.view': { area: 'Agenda', action: 'view', label: 'Visualizar agenda' },
  'appointment.create': { area: 'Agenda', action: 'create', label: 'Criar agendamentos' },
  'appointment.update': { area: 'Agenda', action: 'edit', label: 'Editar agendamentos' },
  'appointment.cancel': { area: 'Agenda', action: 'cancel', label: 'Cancelar agendamentos' },
  'appointment.status': { area: 'Agenda', action: 'special', label: 'Alterar status', specialGroup: 'Agenda' },
  'anamnesis.view': { area: 'Anamnese', action: 'view', label: 'Visualizar anamnese' },
  'anamnesis.create': { area: 'Anamnese', action: 'create', label: 'Criar anamnese' },
  'anamnesis.update': { area: 'Anamnese', action: 'edit', label: 'Editar anamnese' },
  'anamnesis.sign': { area: 'Anamnese', action: 'special', label: 'Assinar / modelos', specialGroup: 'Anamnese' },
  'anamnesis.manage_templates': { area: 'Anamnese', action: 'special', label: 'Publicar modelos', specialGroup: 'Anamnese' },
  'treatment.view': { area: 'Tratamentos', action: 'view', label: 'Visualizar tratamentos' },
  'treatment.create': { area: 'Tratamentos', action: 'create', label: 'Criar tratamentos' },
  'treatment.update': { area: 'Tratamentos', action: 'edit', label: 'Editar tratamentos' },
  'treatment.cancel': { area: 'Tratamentos', action: 'cancel', label: 'Cancelar tratamentos' },
  'treatment.approve': { area: 'Tratamentos', action: 'special', label: 'Aprovar / executar', specialGroup: 'Tratamentos' },
  'document.view': { area: 'Documentos', action: 'view', label: 'Visualizar documentos' },
  'document.create': { area: 'Documentos', action: 'create', label: 'Criar documentos' },
  'document.update': { area: 'Documentos', action: 'edit', label: 'Editar documentos' },
  'document.sign': { area: 'Documentos', action: 'special', label: 'Assinar / modelos', specialGroup: 'Documentos' },
  'financial.view': { area: 'Financeiro', action: 'view', label: 'Visualizar financeiro' },
  'financial.create': { area: 'Financeiro', action: 'create', label: 'Cadastrar títulos' },
  'financial.update': { area: 'Financeiro', action: 'edit', label: 'Editar financeiro' },
  'financial.cancel': { area: 'Financeiro', action: 'cancel', label: 'Cancelar lançamentos' },
  'financial.refund': { area: 'Financeiro', action: 'special', label: 'Realizar estornos', specialGroup: 'Financeiro' },
  'commission.manage': { area: 'Financeiro', action: 'special', label: 'Fechar comissão', specialGroup: 'Financeiro' },
  'report.view': { area: 'Relatórios', action: 'view', label: 'Visualizar relatórios' },
  'report.view_clinical': { area: 'Relatórios', action: 'view', label: 'Relatórios clínicos' },
  'report.view_financial': { area: 'Relatórios', action: 'view', label: 'Relatórios financeiros' },
  'report.view_management': { area: 'Relatórios', action: 'view', label: 'Relatórios de gestão' },
  'report.export': { area: 'Relatórios', action: 'special', label: 'Exportar', specialGroup: 'Relatórios' },
  'role.manage': { area: 'Usuários', action: 'special', label: 'Gerenciar perfis', specialGroup: 'Usuários' },
  'user.manage': { area: 'Usuários', action: 'edit', label: 'Gerenciar usuários' },
  'user.view': { area: 'Usuários', action: 'view', label: 'Visualizar usuários' },
  'clinic.view': { area: 'Configurações', action: 'view', label: 'Visualizar configurações' },
  'clinic.manage': { area: 'Configurações', action: 'edit', label: 'Editar configurações' },
  'organization.manage': { area: 'Organização', action: 'special', label: 'Administrar organização', specialGroup: 'Organização' },
};

export function permissionLabel(code: string) {
  return PERMISSION_PRESENTATION[code]?.label ?? humanizeCode(code);
}

export function permissionArea(code: string) {
  return PERMISSION_PRESENTATION[code]?.area ?? humanizeCode(code.split('.')[0] ?? code);
}

function humanizeCode(code: string) {
  return code
    .replace(/\./g, ' · ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const INVITE_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Aguardando aceite',
  ACCEPTED: 'Aceito',
  EXPIRED: 'Expirado',
  REVOKED: 'Revogado',
};

export type PermissionMatrixRow = {
  area: string;
  view?: string;
  create?: string;
  edit?: string;
  cancel?: string;
  specials: Array<{ code: string; label: string }>;
};

export function buildPermissionMatrix(codes: string[]): PermissionMatrixRow[] {
  const areas = new Map<string, PermissionMatrixRow>();
  for (const code of codes) {
    const meta = PERMISSION_PRESENTATION[code];
    const area = meta?.area ?? permissionArea(code);
    const row = areas.get(area) ?? { area, specials: [] };
    if (!meta) {
      row.specials.push({ code, label: permissionLabel(code) });
      areas.set(area, row);
      continue;
    }
    if (meta.action === 'view') row.view = code;
    else if (meta.action === 'create') row.create = code;
    else if (meta.action === 'edit') row.edit = code;
    else if (meta.action === 'cancel') row.cancel = code;
    else row.specials.push({ code, label: meta.label });
    areas.set(area, row);
  }
  return [...areas.values()].sort((a, b) => a.area.localeCompare(b.area, 'pt-BR'));
}
