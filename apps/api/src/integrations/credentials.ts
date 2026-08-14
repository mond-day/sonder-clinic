import { createDecipheriv } from 'node:crypto';

export function decryptCredentialsPayload(payload: string): Record<string, string> {
  const keyValue = process.env.ENCRYPTION_MASTER_KEY;
  if (!keyValue || !/^[a-f0-9]{64}$/i.test(keyValue)) {
    throw new Error('ENCRYPTION_MASTER_KEY inválida.');
  }
  const [ivValue, tagValue, encryptedValue] = payload.split('.');
  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error('Credencial criptografada inválida.');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(keyValue, 'hex'),
    Buffer.from(ivValue, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  const parsed: unknown = JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8'),
  );
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Credencial descriptografada inválida.');
  }
  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0,
    ),
  );
}
