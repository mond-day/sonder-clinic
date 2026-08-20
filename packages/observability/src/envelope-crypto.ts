import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const V2_PREFIX = 'v2.';

function readMasterKey(value = process.env.ENCRYPTION_MASTER_KEY): Buffer {
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error('ENCRYPTION_MASTER_KEY inválida.');
  }
  return Buffer.from(value, 'hex');
}

function encryptWithKey(key: Buffer, plaintext: Buffer): { iv: Buffer; tag: Buffer; ciphertext: Buffer } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), ciphertext };
}

function decryptWithKey(key: Buffer, iv: Buffer, tag: Buffer, ciphertext: Buffer): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Envelope v2: DEK aleatória cifrada com a master key + AES-256-GCM no payload. */
export function envelopeEncrypt(plaintext: string | Buffer, masterKey = process.env.ENCRYPTION_MASTER_KEY): string {
  const kek = readMasterKey(masterKey);
  const dek = randomBytes(32);
  const data = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8');
  const wrapped = encryptWithKey(kek, dek);
  const body = encryptWithKey(dek, data);
  return V2_PREFIX + [
    wrapped.iv,
    wrapped.tag,
    wrapped.ciphertext,
    body.iv,
    body.tag,
    body.ciphertext,
  ].map((part) => part.toString('base64url')).join('.');
}

/** Aceita v2 (envelope) e v1 legado (iv.tag.ciphertext com master key direta). */
export function envelopeDecrypt(payload: string, masterKey = process.env.ENCRYPTION_MASTER_KEY): Buffer {
  const kek = readMasterKey(masterKey);
  if (payload.startsWith(V2_PREFIX)) {
    const parts = payload.slice(V2_PREFIX.length).split('.');
    if (parts.length !== 6 || parts.some((part) => !part)) {
      throw new Error('Payload envelope v2 inválido.');
    }
    const [ivKek, tagKek, encDek, ivData, tagData, ciphertext] = parts.map((part) => Buffer.from(part!, 'base64url'));
    const dek = decryptWithKey(kek, ivKek!, tagKek!, encDek!);
    return decryptWithKey(dek, ivData!, tagData!, ciphertext!);
  }

  const parts = payload.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new Error('Payload criptografado inválido.');
  }
  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part!, 'base64url'));
  return decryptWithKey(kek, iv!, tag!, ciphertext!);
}

export function envelopeEncryptJson(value: Record<string, string>, masterKey = process.env.ENCRYPTION_MASTER_KEY): string {
  return envelopeEncrypt(JSON.stringify(value), masterKey);
}

export function envelopeDecryptJson(payload: string, masterKey = process.env.ENCRYPTION_MASTER_KEY): Record<string, string> {
  const parsed: unknown = JSON.parse(envelopeDecrypt(payload, masterKey).toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Credencial descriptografada inválida.');
  }
  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0,
    ),
  );
}

export function isEnvelopeV2(payload: string): boolean {
  return payload.startsWith(V2_PREFIX);
}
