import { envelopeDecryptJson, envelopeEncryptJson } from '@sonder/observability';

export function encryptCredentialsPayload(value: Record<string, string>): string {
  return envelopeEncryptJson(value);
}

export function decryptCredentialsPayload(payload: string): Record<string, string> {
  return envelopeDecryptJson(payload);
}
