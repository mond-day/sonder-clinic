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
  'patient.archive': { area: 'Pacientes', action: 'cancel', label: 'Arquivar pacientes' },
  'patient.merge': { area: 'Pacientes', action: 'special', label: 'Mesclar duplicados', specialGroup: 'Pacientes' },
  'patient.document.manage': { area: 'Pacientes', action: 'special', label: 'Gerenciar documentos do paciente', specialGroup: 'Pacientes' },
  'patient.consent.manage': { area: 'Pacientes', action: 'special', label: 'Gerenciar consentimentos', specialGroup: 'Pacientes' },
  'appointment.view': { area: 'Agenda', action: 'view', label: 'Visualizar agenda' },
  'appointment.create': { area: 'Agenda', action: 'create', label: 'Criar agendamentos' },
  'appointment.update': { area: 'Agenda', action: 'edit', label: 'Editar agendamentos' },
  'appointment.cancel': { area: 'Agenda', action: 'cancel', label: 'Cancelar agendamentos' },
  'appointment.status': { area: 'Agenda', action: 'special', label: 'Alterar status', specialGroup: 'Agenda' },
  'appointment.override_conflict': { area: 'Agenda', action: 'special', label: 'Ignorar conflito de horário', specialGroup: 'Agenda' },
  'anamnesis.view': { area: 'Anamnese', action: 'view', label: 'Visualizar anamnese' },
  'anamnesis.create': { area: 'Anamnese', action: 'create', label: 'Criar anamnese' },
  'anamnesis.update': { area: 'Anamnese', action: 'edit', label: 'Editar anamnese' },
  'anamnesis.manage': { area: 'Anamnese', action: 'edit', label: 'Editar anamnese' },
  'anamnesis.sign': { area: 'Anamnese', action: 'special', label: 'Assinar anamnese', specialGroup: 'Anamnese' },
  'anamnesis.manage_templates': { area: 'Anamnese', action: 'special', label: 'Publicar modelos', specialGroup: 'Anamnese' },
  'anamnesis.template.view': { area: 'Anamnese', action: 'view', label: 'Visualizar modelos' },
  'anamnesis.template.create': { area: 'Anamnese', action: 'create', label: 'Criar modelos' },
  'anamnesis.template.update': { area: 'Anamnese', action: 'edit', label: 'Editar modelos' },
  'anamnesis.template.publish': { area: 'Anamnese', action: 'special', label: 'Publicar modelos', specialGroup: 'Anamnese' },
  'anamnesis.template.archive': { area: 'Anamnese', action: 'cancel', label: 'Arquivar modelos' },
  'anamnesis.response.view': { area: 'Anamnese', action: 'view', label: 'Visualizar respostas' },
  'anamnesis.response.create': { area: 'Anamnese', action: 'create', label: 'Preencher anamnese' },
  'anamnesis.response.sign': { area: 'Anamnese', action: 'special', label: 'Assinar respostas', specialGroup: 'Anamnese' },
  'anamnesis.response.supersede': { area: 'Anamnese', action: 'special', label: 'Substituir versão assinada', specialGroup: 'Anamnese' },
  'medical_record.view': { area: 'Prontuário', action: 'view', label: 'Visualizar prontuário' },
  'medical_record.create': { area: 'Prontuário', action: 'create', label: 'Registrar evolução' },
  'medical_record.correct': { area: 'Prontuário', action: 'special', label: 'Corrigir registros', specialGroup: 'Prontuário' },
  'medical_record.private_note': { area: 'Prontuário', action: 'special', label: 'Notas internas', specialGroup: 'Prontuário' },
  'treatment.view': { area: 'Tratamentos', action: 'view', label: 'Visualizar tratamentos' },
  'treatment.create': { area: 'Tratamentos', action: 'create', label: 'Criar tratamentos' },
  'treatment.update': { area: 'Tratamentos', action: 'edit', label: 'Editar tratamentos' },
  'treatment.cancel': { area: 'Tratamentos', action: 'cancel', label: 'Cancelar tratamentos' },
  'treatment.approve': { area: 'Tratamentos', action: 'special', label: 'Aprovar plano', specialGroup: 'Tratamentos' },
  'treatment.execute': { area: 'Tratamentos', action: 'special', label: 'Executar procedimentos', specialGroup: 'Tratamentos' },
  'treatment.present': { area: 'Tratamentos', action: 'special', label: 'Apresentar plano', specialGroup: 'Tratamentos' },
  'treatment.archive': { area: 'Tratamentos', action: 'special', label: 'Arquivar plano', specialGroup: 'Tratamentos' },
  'treatment.reopen': { area: 'Tratamentos', action: 'special', label: 'Restaurar plano', specialGroup: 'Tratamentos' },
  'treatment.price_override': { area: 'Tratamentos', action: 'special', label: 'Alterar preço', specialGroup: 'Tratamentos' },
  'procedure_table.manage': { area: 'Tratamentos', action: 'special', label: 'Gerenciar tabelas de preço', specialGroup: 'Tratamentos' },
  'document.view': { area: 'Documentos', action: 'view', label: 'Visualizar documentos' },
  'document.create': { area: 'Documentos', action: 'create', label: 'Criar documentos' },
  'document.update': { area: 'Documentos', action: 'edit', label: 'Editar documentos' },
  'document.sign': { area: 'Documentos', action: 'special', label: 'Assinar documentos', specialGroup: 'Documentos' },
  'document.template.manage': { area: 'Documentos', action: 'special', label: 'Gerenciar modelos', specialGroup: 'Documentos' },
  'document.cancel': { area: 'Documentos', action: 'cancel', label: 'Cancelar documentos' },
  'document.archive': { area: 'Documentos', action: 'special', label: 'Arquivar documentos', specialGroup: 'Documentos' },
  'document.folder.manage': { area: 'Documentos', action: 'special', label: 'Gerenciar pastas', specialGroup: 'Documentos' },
  'certificate.manage_own': { area: 'Documentos', action: 'special', label: 'Usar certificado digital', specialGroup: 'Documentos' },
  'certificate.manage_all': { area: 'Documentos', action: 'special', label: 'Administrar certificados', specialGroup: 'Documentos' },
  'financial.view': { area: 'Financeiro', action: 'view', label: 'Visualizar financeiro' },
  'financial.create': { area: 'Financeiro', action: 'create', label: 'Cadastrar títulos' },
  'financial.update': { area: 'Financeiro', action: 'edit', label: 'Editar financeiro' },
  'financial.cancel': { area: 'Financeiro', action: 'cancel', label: 'Cancelar lançamentos' },
  'financial.discount': { area: 'Financeiro', action: 'special', label: 'Aplicar descontos', specialGroup: 'Financeiro' },
  'financial.refund': { area: 'Financeiro', action: 'special', label: 'Realizar estornos', specialGroup: 'Financeiro' },
  'financial.reconcile': { area: 'Financeiro', action: 'special', label: 'Conciliar contas', specialGroup: 'Financeiro' },
  'commission.view_own': { area: 'Financeiro', action: 'view', label: 'Ver as próprias comissões' },
  'commission.view_all': { area: 'Financeiro', action: 'view', label: 'Ver todas as comissões' },
  'commission.manage': { area: 'Financeiro', action: 'special', label: 'Fechar comissão', specialGroup: 'Financeiro' },
  'commission.configure': { area: 'Financeiro', action: 'special', label: 'Configurar regras de comissão', specialGroup: 'Financeiro' },
  'commission.close': { area: 'Financeiro', action: 'special', label: 'Fechar competência', specialGroup: 'Financeiro' },
  'report.view': { area: 'Relatórios', action: 'view', label: 'Visualizar relatórios' },
  'report.view_clinical': { area: 'Relatórios', action: 'view', label: 'Relatórios clínicos' },
  'report.view_financial': { area: 'Relatórios', action: 'view', label: 'Relatórios financeiros' },
  'report.view_management': { area: 'Relatórios', action: 'view', label: 'Relatórios de gestão' },
  'report.export': { area: 'Relatórios', action: 'special', label: 'Exportar relatórios', specialGroup: 'Relatórios' },
  'role.manage': { area: 'Usuários', action: 'special', label: 'Gerenciar perfis', specialGroup: 'Usuários' },
  'user.manage': { area: 'Usuários', action: 'edit', label: 'Gerenciar usuários' },
  'user.view': { area: 'Usuários', action: 'view', label: 'Visualizar usuários' },
  'clinic.view': { area: 'Configurações', action: 'view', label: 'Visualizar configurações' },
  'clinic.manage': { area: 'Configurações', action: 'edit', label: 'Editar configurações' },
  'unit.view': { area: 'Configurações', action: 'view', label: 'Visualizar unidades' },
  'unit.manage': { area: 'Configurações', action: 'edit', label: 'Gerenciar unidades e cadeiras' },
  'organization.manage': { area: 'Organização', action: 'special', label: 'Administrar organização', specialGroup: 'Organização' },
  'integration.view': { area: 'Integrações', action: 'view', label: 'Visualizar integrações' },
  'integration.manage': { area: 'Integrações', action: 'edit', label: 'Configurar integrações' },
  'audit.view': { area: 'Organização', action: 'special', label: 'Ver histórico de auditoria', specialGroup: 'Organização' },
  'return_alert.view': { area: 'Retornos', action: 'view', label: 'Visualizar retornos' },
  'return_alert.manage': { area: 'Retornos', action: 'edit', label: 'Gerenciar retornos' },
  'task.view': { area: 'Tarefas', action: 'view', label: 'Visualizar tarefas' },
  'task.manage': { area: 'Tarefas', action: 'edit', label: 'Gerenciar tarefas' },
  'lab_case.view': { area: 'Laboratório', action: 'view', label: 'Visualizar casos de laboratório' },
  'lab_case.manage': { area: 'Laboratório', action: 'edit', label: 'Gerenciar casos de laboratório' },
  'laboratory.manage': { area: 'Laboratório', action: 'special', label: 'Cadastrar laboratórios parceiros', specialGroup: 'Laboratório' },
  'notification.view': { area: 'Notificações', action: 'view', label: 'Visualizar notificações' },
};

export function permissionLabel(code: string) {
  return PERMISSION_PRESENTATION[code]?.label ?? humanizeCode(code);
}

export function permissionArea(code: string) {
  return PERMISSION_PRESENTATION[code]?.area ?? humanizeCode(code.split('.')[0] ?? code);
}

function humanizeCode(code: string) {
  const dictionary: Record<string, string> = {
    view: 'Visualizar',
    create: 'Criar',
    update: 'Editar',
    manage: 'Gerenciar',
    cancel: 'Cancelar',
    archive: 'Arquivar',
    sign: 'Assinar',
    export: 'Exportar',
    approve: 'Aprovar',
    execute: 'Executar',
    present: 'Apresentar',
    reopen: 'Restaurar',
    merge: 'Mesclar',
    refund: 'Estornar',
    discount: 'Desconto',
    reconcile: 'Conciliar',
    configure: 'Configurar',
    close: 'Fechar',
    patient: 'Pacientes',
    appointment: 'Agenda',
    anamnesis: 'Anamnese',
    treatment: 'Tratamentos',
    document: 'Documentos',
    financial: 'Financeiro',
    commission: 'Comissões',
    report: 'Relatórios',
    user: 'Usuários',
    role: 'Perfis',
    clinic: 'Clínica',
    unit: 'Unidades',
    organization: 'Organização',
    integration: 'Integrações',
    task: 'Tarefas',
    notification: 'Notificações',
  };
  return code
    .split(/[._]/)
    .map((part) => dictionary[part] ?? part)
    .join(' · ');
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
    if (meta.action === 'view' && !row.view) row.view = code;
    else if (meta.action === 'create' && !row.create) row.create = code;
    else if (meta.action === 'edit' && !row.edit) row.edit = code;
    else if (meta.action === 'cancel' && !row.cancel) row.cancel = code;
    else row.specials.push({ code, label: meta.label });
    areas.set(area, row);
  }
  return [...areas.values()].sort((a, b) => a.area.localeCompare(b.area, 'pt-BR'));
}
