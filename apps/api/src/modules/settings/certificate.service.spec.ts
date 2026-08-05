import forge from 'node-forge';
import { beforeAll, describe, expect, it } from 'vitest';
import { CertificateService } from './certificate.service';

describe('CertificateService', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_MASTER_KEY = '11'.repeat(32);
  });

  function fixture(password: string) {
    const keys = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date(Date.now() + 86_400_000);
    const attributes = [{ name: 'commonName', value: 'Certificado de teste' }];
    cert.setSubject(attributes);
    cert.setIssuer(attributes);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {
      algorithm: '3des',
      generateLocalKeyId: true,
    });
    return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary');
  }

  it('extrai somente metadados seguros de um PKCS#12 válido', () => {
    const metadata = new CertificateService().validatePkcs12(fixture('senha-segura'), 'senha-segura');
    expect(metadata.subject).toContain('Certificado de teste');
    expect(metadata.serialNumber).toBe('01');
    expect(metadata.validTo).toBeTruthy();
  });

  it('rejeita senha incorreta sem expor detalhes', () => {
    const service = new CertificateService();
    expect(() => service.validatePkcs12(fixture('correta'), 'incorreta')).toThrow('Arquivo PKCS#12 inválido ou senha incorreta.');
  });
});
