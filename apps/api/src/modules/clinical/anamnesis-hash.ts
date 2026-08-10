import { createHash } from 'node:crypto';

/** Serialização canônica (chaves ordenadas) para hash clínico estável. */
export function canonicalizeValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalizeValue);
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  const out: Record<string, unknown> = {};
  for (const [key, nested] of entries) {
    out[key] = canonicalizeValue(nested);
  }
  return out;
}

export function canonicalizeAnswers(answers: Record<string, unknown>): Record<string, unknown> {
  return canonicalizeValue(answers) as Record<string, unknown>;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeValue(value));
}

export function buildAnamnesisContentHash(input: {
  answers: Record<string, unknown>;
  templateId: string;
  templateVersion: number;
  patientId: string;
  clinicId: string;
}): string {
  const payload = canonicalJson({
    templateId: input.templateId,
    templateVersion: input.templateVersion,
    patientId: input.patientId,
    clinicId: input.clinicId,
    answers: canonicalizeAnswers(input.answers),
  });
  return createHash('sha256').update(payload).digest('hex');
}
