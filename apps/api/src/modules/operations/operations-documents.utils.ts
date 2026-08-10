import { createHash } from 'node:crypto';

export type DocumentStatus =
  | 'DRAFT'
  | 'GENERATED'
  | 'PARTIALLY_SIGNED'
  | 'SIGNED'
  | 'CANCELLED';

export type DocumentTemplateStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type PrescriptionStatus = 'DRAFT' | 'REVIEWED' | 'SIGNED' | 'CANCELLED';

export type PrescriptionItem = {
  medicationName: string;
  concentration?: string;
  pharmaceuticalForm?: string;
  route?: string;
  quantity: string;
  dosage: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
};

export type SignatureRules = {
  requiredRoles?: string[];
  allowDuplicateRoles?: boolean;
  minSignatures?: number;
};

export const DOCUMENT_TEMPLATE_TYPES = [
  'ATTESTATION',
  'PRESCRIPTION',
  'EXAM_REQUEST',
  'DECLARATION',
  'CONSENT',
  'REFERRAL',
  'CUSTOM',
] as const;

export type DocumentTemplateType = (typeof DOCUMENT_TEMPLATE_TYPES)[number];

export const DEFAULT_PATIENT_FOLDERS = [
  { name: 'Documentos clínicos', sortOrder: 10 },
  { name: 'Receitas', sortOrder: 20 },
  { name: 'Atestados', sortOrder: 30 },
  { name: 'Exames', sortOrder: 40 },
  { name: 'Radiografias', sortOrder: 50 },
  { name: 'Fotografias', sortOrder: 60 },
  { name: 'Termos e consentimentos', sortOrder: 70 },
  { name: 'Outros', sortOrder: 80 },
] as const;

/** Campos de identidade que o cliente não pode forçar no frozenContent. */
export const CLIENT_IDENTITY_KEYS = [
  'paciente',
  'patientName',
  'patient',
  'cpf',
  'patientCpf',
  'profissional',
  'professional',
  'professionalName',
  'cro',
  'professionalCro',
  'croNumber',
  'clinica',
  'clinic',
  'clinicName',
  'identity',
] as const;

export function stripClientIdentity(content: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(content ?? {})) {
    if ((CLIENT_IDENTITY_KEYS as readonly string[]).includes(key)) continue;
    next[key] = value;
  }
  return next;
}

export function maskCpf(cpf?: string | null): string | null {
  if (!cpf) return null;
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return '***.***.***-**';
  return `${digits.slice(0, 3)}.***.***-${digits.slice(9)}`;
}

export function buildServerFrozenContent(input: {
  clinicalContent: Record<string, unknown>;
  patient: { fullName: string; cpf?: string | null };
  professional?: { name: string; croNumber?: string | null; croState?: string | null } | null;
  clinic: { tradeName?: string | null; legalName?: string | null };
  template: { id: string; name: string; type: string; version: number };
  generatedAt?: Date;
}): Record<string, unknown> {
  const clinical = stripClientIdentity(input.clinicalContent);
  const cro = input.professional?.croNumber
    ? `CRO/${input.professional.croState ?? '??'} ${input.professional.croNumber}`
    : null;
  return {
    ...clinical,
    identity: {
      patientName: input.patient.fullName,
      patientCpfMasked: maskCpf(input.patient.cpf),
      professionalName: input.professional?.name ?? null,
      professionalCro: cro,
      clinicName: input.clinic.tradeName ?? input.clinic.legalName ?? null,
      generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    },
    template: {
      id: input.template.id,
      name: input.template.name,
      type: input.template.type,
      version: input.template.version,
    },
  };
}

export function hashDocumentContent(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function parseSignatureRules(raw: unknown): SignatureRules {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { requiredRoles: ['PROFESSIONAL'], minSignatures: 1 };
  const obj = raw as Record<string, unknown>;
  const requiredRoles = Array.isArray(obj.requiredRoles)
    ? obj.requiredRoles.filter((role): role is string => typeof role === 'string' && role.length > 0)
    : ['PROFESSIONAL'];
  const minSignatures = typeof obj.minSignatures === 'number' && obj.minSignatures > 0
    ? Math.floor(obj.minSignatures)
    : Math.max(1, requiredRoles.length);
  return {
    requiredRoles: requiredRoles.length ? requiredRoles : ['PROFESSIONAL'],
    allowDuplicateRoles: obj.allowDuplicateRoles === true,
    minSignatures,
  };
}

export function nextDocumentStatusAfterSign(input: {
  currentStatus: DocumentStatus;
  signatures: Array<{ role: string }>;
  newRole: string;
  rules: SignatureRules;
}): DocumentStatus {
  if (input.currentStatus === 'SIGNED' || input.currentStatus === 'CANCELLED') {
    throw new Error('Documento imutável após assinatura completa ou cancelamento.');
  }
  if (!input.rules.allowDuplicateRoles && input.signatures.some((s) => s.role === input.newRole)) {
    throw new Error(`Papel ${input.newRole} já assinou este documento.`);
  }
  const after = [...input.signatures, { role: input.newRole }];
  const required = input.rules.requiredRoles ?? ['PROFESSIONAL'];
  const missing = required.filter((role) => !after.some((s) => s.role === role));
  const min = input.rules.minSignatures ?? required.length;
  if (missing.length === 0 && after.length >= min) return 'SIGNED';
  return 'PARTIALLY_SIGNED';
}

export function assertDocumentMutable(status: DocumentStatus, archivedAt?: Date | null): void {
  if (status === 'SIGNED') throw new Error('Documento assinado é imutável.');
  if (status === 'CANCELLED') throw new Error('Documento cancelado é imutável.');
  if (archivedAt) throw new Error('Documento arquivado não pode ser alterado.');
}

export function assertTemplateEditable(status: DocumentTemplateStatus): void {
  if (status !== 'DRAFT') throw new Error('Somente rascunhos de modelo podem ser editados diretamente.');
}

export function assertCidConsent(input: {
  templateType: string;
  clinicalContent: Record<string, unknown>;
}): void {
  const cid = input.clinicalContent.cid ?? input.clinicalContent.cidCode;
  if (!cid) return;
  const consent = input.clinicalContent.cidConsent;
  if (!consent || typeof consent !== 'object' || Array.isArray(consent)) {
    throw new Error('Inclusão de CID exige registro de autorização do paciente (cidConsent).');
  }
  const c = consent as Record<string, unknown>;
  if (c.authorized !== true) {
    throw new Error('CID requer authorized=true no consentimento do paciente.');
  }
  if (typeof c.authorizedAt !== 'string' || !c.authorizedAt) {
    throw new Error('CID requer authorizedAt no consentimento.');
  }
  if (typeof c.authorizedById !== 'string' || !c.authorizedById) {
    throw new Error('CID requer authorizedById (autor do registro).');
  }
}

export function validateTemplateVariables(
  allowedVariables: unknown,
  clinicalContent: Record<string, unknown>,
): string[] {
  const allowed = Array.isArray(allowedVariables)
    ? allowedVariables.filter((v): v is string => typeof v === 'string')
    : [];
  if (!allowed.length) return [];
  const errors: string[] = [];
  for (const key of allowed) {
    // Identidade e paths legados (paciente.*, profissional.*) são preenchidos no servidor.
    if (
      key.startsWith('identity.')
      || key.startsWith('optional.')
      || key.startsWith('paciente')
      || key.startsWith('profissional')
      || key.startsWith('clinica')
      || key === 'data'
    ) {
      continue;
    }
    const required = !key.endsWith('?');
    const name = key.replace(/\?$/, '');
    if (!required) continue;
    if (clinicalContent[name] === undefined || clinicalContent[name] === null || clinicalContent[name] === '') {
      errors.push(`Variável obrigatória ausente: ${name}`);
    }
  }
  return errors;
}

const KNOWN_IDENTITY_VARS = new Set([
  'patientName', 'patientCpf', 'professionalName', 'professionalCro', 'clinicName', 'date',
  'paciente', 'profissional', 'clinica', 'data', 'identity.patientName', 'identity.clinicName',
]);

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.?]+)\s*\}\}/g;

export function extractTemplatePlaceholders(structuredContent: unknown): string[] {
  if (!structuredContent || typeof structuredContent !== 'object' || Array.isArray(structuredContent)) {
    return [];
  }
  const texts = Object.values(structuredContent as Record<string, unknown>)
    .filter((value): value is string => typeof value === 'string');
  const found = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(PLACEHOLDER_RE)) {
      if (match[1]) found.add(match[1]);
    }
  }
  return [...found];
}

/** Valida snapshot do modelo antes de publicar (estrutura + placeholders + assinatura). */
export function validateDocumentTemplateStructure(template: {
  name?: string | null;
  type?: string | null;
  structuredContent?: unknown;
  allowedVariables?: unknown;
  signatureRules?: unknown;
}): string[] {
  const errors: string[] = [];
  const name = String(template.name ?? '').trim();
  if (name.length < 2) errors.push('Nome do modelo é obrigatório.');

  const type = String(template.type ?? '').trim();
  const allowedTypes = new Set([...DOCUMENT_TEMPLATE_TYPES, 'CERTIFICATE', 'ATTESTATION']);
  if (!type || !allowedTypes.has(type)) {
    errors.push(`Tipo de modelo inválido: ${type || '(vazio)'}.`);
  }

  const content = template.structuredContent;
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    errors.push('structuredContent deve ser um objeto.');
  } else {
    const body = String((content as Record<string, unknown>).body ?? '').trim();
    if (body.length < 5) errors.push('Corpo do modelo (body) é obrigatório (mínimo 5 caracteres).');
  }

  const allowed = Array.isArray(template.allowedVariables)
    ? template.allowedVariables.filter((v): v is string => typeof v === 'string')
    : [];
  if (!allowed.length) {
    errors.push('allowedVariables deve listar ao menos uma variável permitida.');
  }

  const placeholders = extractTemplatePlaceholders(content);
  for (const placeholder of placeholders) {
    const bare = placeholder.replace(/\?$/, '');
    const permitted = allowed.some((item) => item.replace(/\?$/, '') === bare)
      || KNOWN_IDENTITY_VARS.has(placeholder)
      || KNOWN_IDENTITY_VARS.has(bare);
    if (!permitted) {
      errors.push(`Variável desconhecida no conteúdo: {{${placeholder}}}.`);
    }
  }

  const rules = template.signatureRules;
  if (rules != null) {
    if (typeof rules !== 'object' || Array.isArray(rules)) {
      errors.push('signatureRules deve ser um objeto.');
    } else {
      const requiredRoles = (rules as SignatureRules).requiredRoles;
      if (requiredRoles != null && (!Array.isArray(requiredRoles) || requiredRoles.some((r) => typeof r !== 'string'))) {
        errors.push('signatureRules.requiredRoles deve ser um array de strings.');
      }
      const minSignatures = (rules as SignatureRules).minSignatures;
      if (minSignatures != null && (!Number.isInteger(minSignatures) || minSignatures < 1)) {
        errors.push('signatureRules.minSignatures deve ser inteiro >= 1.');
      }
    }
  }

  return errors;
}

export function normalizePrescriptionItems(items: unknown): PrescriptionItem[] {
  if (!Array.isArray(items) || !items.length) {
    throw new Error('Informe ao menos um item da receita.');
  }
  return items.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`Item ${index + 1} inválido.`);
    }
    const item = raw as Record<string, unknown>;
    const medicationName = String(item.medicationName ?? item.name ?? '').trim();
    const quantity = String(item.quantity ?? item.qty ?? '').trim();
    const dosage = String(item.dosage ?? item.instructions ?? '').trim();
    if (!medicationName) throw new Error(`Item ${index + 1}: medicationName é obrigatório.`);
    if (!quantity) throw new Error(`Item ${index + 1}: quantity é obrigatório.`);
    if (!dosage) throw new Error(`Item ${index + 1}: dosage é obrigatório.`);
    return {
      medicationName,
      concentration: optionalString(item.concentration),
      pharmaceuticalForm: optionalString(item.pharmaceuticalForm),
      route: optionalString(item.route),
      quantity,
      dosage,
      frequency: optionalString(item.frequency),
      duration: optionalString(item.duration),
      instructions: optionalString(item.instructions),
    };
  });
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

export function assertIgnoredWarningsJustified(input: {
  clinicalWarnings: unknown;
  ignoredWarnings: unknown;
}): void {
  const warnings = Array.isArray(input.clinicalWarnings) ? input.clinicalWarnings : [];
  const ignored = Array.isArray(input.ignoredWarnings) ? input.ignoredWarnings : [];
  if (!ignored.length) return;
  for (const entry of ignored) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('ignoredWarnings exige objetos com warning e justification.');
    }
    const row = entry as Record<string, unknown>;
    if (!String(row.warning ?? '').trim() || !String(row.justification ?? '').trim()) {
      throw new Error('Ignorar alerta clínico exige warning e justification.');
    }
  }
  if (warnings.length && ignored.length > warnings.length) {
    throw new Error('Há mais alertas ignorados do que alertas clínicos informados.');
  }
}

export function defaultFolderNameForTemplateType(type: string): string {
  switch (type.toUpperCase()) {
    case 'PRESCRIPTION':
    case 'RECEITUARIO':
      return 'Receitas';
    case 'ATTESTATION':
    case 'ATESTADO':
      return 'Atestados';
    case 'EXAM_REQUEST':
      return 'Exames';
    case 'CONSENT':
    case 'CONSENTIMENTO':
      return 'Termos e consentimentos';
    case 'REFERRAL':
    case 'ENCAMINHAMENTO':
      return 'Encaminhamentos';
    default:
      return 'Documentos clínicos';
  }
}

export function publicDocumentSafeView(input: {
  status: DocumentStatus;
  contentHash: string;
  generatedAt: Date;
  templateType?: string | null;
  clinicName?: string | null;
  signatures: Array<{ signerName: string; role: string; method: string; signedAt: Date }>;
}) {
  return {
    authentic: true,
    status: input.status,
    generatedAt: input.generatedAt,
    type: input.templateType ?? null,
    clinicName: input.clinicName ?? null,
    contentHash: input.contentHash,
    signatures: input.signatures.map((s) => ({
      role: s.role,
      method: s.method,
      signedAt: s.signedAt,
      // não expor nome completo sensível além do necessário para verificação
      signerLabel: s.signerName.length > 2 ? `${s.signerName.slice(0, 1)}***` : '***',
    })),
  };
}
