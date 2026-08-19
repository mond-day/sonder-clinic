export type SetupFormInput = {
  clinicName: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  taxId?: string;
};

export function resolveSetupApiBase(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = env.INTERNAL_API_URL
    || env.API_URL
    || env.NEXT_PUBLIC_API_URL
    || 'http://localhost:4000/api/v1';
  return raw.replace(/\/$/, '');
}

/** Token informado pelo operador. Nunca ler INITIAL_SETUP_TOKEN do env do Next. */
export function readSetupTokenHeader(header: string | null | undefined): string {
  return header?.trim() ?? '';
}

const SETUP_SECRET_KEYS = new Set(['setupToken', 'token', 'initialSetupToken']);

export function omitSetupSecrets(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (!SETUP_SECRET_KEYS.has(key)) copy[key] = value;
  }
  return copy;
}

export function toInitializeBody(input: SetupFormInput) {
  const clinicName = input.clinicName.trim();
  const taxId = input.taxId?.trim();
  return {
    organization: {
      legalName: clinicName,
      tradeName: clinicName,
      ...(taxId ? { taxId } : {}),
    },
    clinic: {
      legalName: clinicName,
      tradeName: clinicName,
    },
    unit: { name: 'Unidade principal' },
    admin: {
      name: input.adminName.trim(),
      email: input.adminEmail.trim().toLowerCase(),
      password: input.adminPassword,
    },
  };
}
