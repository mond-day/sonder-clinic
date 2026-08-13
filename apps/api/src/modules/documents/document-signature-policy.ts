export const ELECTRONIC_SIGNATURE_CONSENT_V1 = {
  version: 'ELECTRONIC_SIGNATURE_CONSENT_V1',
  text: 'Declaro que revisei o conteúdo deste documento e concordo com a utilização desta assinatura eletrônica para manifestação da minha vontade.',
} as const;

export const DOCUMENT_SIGNATURE_POLICIES = {
  PRESCRIPTION: {
    patient: false as const,
    professional: 'A1_REQUIRED' as const,
  },
  ATTESTATION: {
    patient: false as const,
    professional: 'A1_REQUIRED' as const,
  },
  ANAMNESIS: {
    patient: 'ELECTRONIC_REQUIRED' as const,
    professional: false as const,
  },
  ODONTOGRAM: {
    patient: 'ELECTRONIC_REQUIRED' as const,
    professional: 'A1_REQUIRED' as const,
  },
  TREATMENT_PLAN: {
    patient: 'ELECTRONIC_REQUIRED' as const,
    professional: false as const,
  },
  CONTRACT: {
    patient: 'ELECTRONIC_REQUIRED' as const,
    provider: 'A1_REQUIRED' as const,
  },
} as const;

const ELECTRONIC_METHODS = new Set(['DRAWN', 'REMOTE', 'ELECTRONIC_LOCAL', 'ELECTRONIC_REMOTE']);
const PROVIDER_ROLES = new Set(['CLINIC', 'PROFESSIONAL', 'PROVIDER']);
const PATIENT_ROLES = new Set(['PATIENT', 'GUARDIAN']);

export function normalizeSignatureMethod(method: string): string {
  if (method === 'DRAWN') return 'ELECTRONIC_LOCAL';
  if (method === 'REMOTE') return 'ELECTRONIC_REMOTE';
  return method;
}

export function isPatientSignerRole(role: string): boolean {
  return PATIENT_ROLES.has(role);
}

export function isProviderSignerRole(role: string): boolean {
  return PROVIDER_ROLES.has(role);
}

export function roleSatisfiesRequirement(required: string, actual: string): boolean {
  if (required === actual) return true;
  if (required === 'PATIENT' && PATIENT_ROLES.has(actual)) return true;
  if ((required === 'PROVIDER' || required === 'CLINIC' || required === 'PROFESSIONAL')
    && required === 'PROVIDER'
    && PROVIDER_ROLES.has(actual)) {
    return true;
  }
  return false;
}

/** Regras rígidas aplicadas no ato de assinar. Não altera receita/atestado nesta fatia. */
export function assertContractSignatureAllowed(input: {
  templateType: string;
  role: string;
  method: string;
  existingRoles: string[];
  serviceProviderSigner?: 'CLINIC' | 'PROFESSIONAL';
}): void {
  if (input.templateType !== 'CONTRACT') return;
  const method = normalizeSignatureMethod(input.method);
  const hasPatient = input.existingRoles.some((role) => PATIENT_ROLES.has(role));

  if (isPatientSignerRole(input.role)) {
    if (method === 'A1') {
      throw new Error('O paciente assina o contrato por assinatura eletrônica, não com certificado digital da clínica.');
    }
    if (!ELECTRONIC_METHODS.has(input.method) && method !== 'ELECTRONIC_LOCAL' && method !== 'ELECTRONIC_REMOTE') {
      throw new Error('Use a assinatura eletrônica do paciente para este contrato.');
    }
    return;
  }

  if (isProviderSignerRole(input.role)) {
    const expected = input.serviceProviderSigner ?? 'CLINIC';
    if (input.role !== expected && input.role !== 'PROVIDER') {
      throw new Error(expected === 'CLINIC'
        ? 'Este contrato deve ser assinado pela clínica, não pelo profissional.'
        : 'Este contrato deve ser assinado pelo profissional responsável, não pela clínica.');
    }
    if (method !== 'A1') {
      throw new Error('A parte prestadora assina o contrato com certificado digital.');
    }
    if (!hasPatient) {
      throw new Error('O paciente ou responsável precisa assinar o contrato antes da clínica.');
    }
    return;
  }

  throw new Error('Papel de assinatura não permitido para contrato.');
}
