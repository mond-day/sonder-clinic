/** Permissões de sistema — usadas pelo setup de produção e pelo seed de demo. */
export const PERMISSION_CODES = [
  'organization.manage', 'clinic.view', 'clinic.manage', 'unit.view', 'unit.manage',
  'user.view', 'user.manage', 'role.manage', 'patient.view', 'patient.create',
  'patient.update', 'patient.archive', 'appointment.view', 'appointment.create',
  'appointment.update', 'appointment.cancel', 'appointment.override_conflict',
  'patient.document.manage', 'patient.consent.manage',
  'medical_record.view', 'medical_record.create', 'medical_record.correct', 'medical_record.private_note',
  'anamnesis.view', 'anamnesis.manage',
  'anamnesis.template.view', 'anamnesis.template.create', 'anamnesis.template.update',
  'anamnesis.template.publish', 'anamnesis.template.archive',
  'anamnesis.response.view', 'anamnesis.response.create', 'anamnesis.response.sign', 'anamnesis.response.supersede',
  'treatment.view', 'treatment.create', 'treatment.update', 'treatment.approve', 'treatment.execute',
  'treatment.present', 'treatment.cancel', 'treatment.archive', 'treatment.reopen', 'treatment.price_override',
  'procedure_table.manage',
  'document.view', 'document.create', 'document.sign', 'document.template.manage',
  'document.cancel', 'document.archive', 'document.folder.manage',
  'certificate.manage_own', 'certificate.manage_all',
  'financial.view', 'financial.create', 'financial.discount', 'financial.refund', 'financial.cancel', 'financial.reconcile',
  'commission.view_own', 'commission.view_all', 'commission.configure', 'commission.close',
  'integration.view', 'integration.manage',
  'report.view_clinical', 'report.view_financial', 'report.view_management', 'report.export', 'audit.view',
  'return_alert.view', 'return_alert.manage', 'task.view', 'task.manage',
  'lab_case.view', 'lab_case.manage', 'laboratory.manage', 'notification.view',
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

export const ODONTOGRAM_CONDITIONS: ReadonlyArray<readonly [code: string, name: string, color: string]> = [
  ['HEALTHY', 'Hígido', '#78A890'],
  ['CARIES', 'Cárie', '#B93A3A'],
  ['RESTORATION', 'Restauração existente', '#315E8A'],
  ['MISSING', 'Ausência dentária', '#68746F'],
  ['EXTRACTION', 'Extração indicada', '#B87412'],
  ['IMPLANT', 'Implante planejado', '#765AA6'],
];
