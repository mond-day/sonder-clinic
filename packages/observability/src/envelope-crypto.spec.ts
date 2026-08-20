import { describe, expect, it } from 'vitest';
import {
  envelopeDecrypt,
  envelopeDecryptJson,
  envelopeEncrypt,
  envelopeEncryptJson,
  isEnvelopeV2,
} from './envelope-crypto';

const MASTER = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('envelope-crypto', () => {
  it('cifra em v2 e decifra', () => {
    const payload = envelopeEncrypt('segredo', MASTER);
    expect(isEnvelopeV2(payload)).toBe(true);
    expect(envelopeDecrypt(payload, MASTER).toString('utf8')).toBe('segredo');
  });

  it('aceita JSON e round-trip', () => {
    const encrypted = envelopeEncryptJson({ apiKey: 'abc', webhookSecret: 'xyz' }, MASTER);
    expect(envelopeDecryptJson(encrypted, MASTER)).toEqual({ apiKey: 'abc', webhookSecret: 'xyz' });
  });

  it('decifra payload v1 legado', () => {
    const { createCipheriv, randomBytes } = require('node:crypto') as typeof import('node:crypto');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(MASTER, 'hex'), iv);
    const encrypted = Buffer.concat([cipher.update('legado', 'utf8'), cipher.final()]);
    const v1 = [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
    expect(isEnvelopeV2(v1)).toBe(false);
    expect(envelopeDecrypt(v1, MASTER).toString('utf8')).toBe('legado');
  });
});
