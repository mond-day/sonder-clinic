import forge from 'node-forge';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  assertProfessionalSigningCpf,
  CertificateService,
  extractCpfDigitsFromSubject,
  PROFESSIONAL_CPF_MISMATCH_MESSAGE,
} from './certificate.service';

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
    const attributes = [{ name: 'commonName', value: 'Certificado de teste:39053344705' }];
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
    expect(metadata.cpfDigits).toBe('39053344705');
    expect(metadata.serialNumber).toBe('01');
    expect(metadata.validTo).toBeTruthy();
  });

  it('extrai CPF de 11 dígitos do CN do certificado', () => {
    expect(extractCpfDigitsFromSubject('CN=MARIA SILVA:39053344705')).toBe('39053344705');
    expect(extractCpfDigitsFromSubject('CN=Clinica LTDA, O=AC')).toBeNull();
  });

  it('rejeita senha incorreta sem expor detalhes', () => {
    const service = new CertificateService();
    expect(() => service.validatePkcs12(fixture('correta'), 'incorreta')).toThrow('Arquivo PKCS#12 inválido ou senha incorreta.');
  });

  it('exige CPF do profissional igual ao CPF do certificado na assinatura', () => {
    expect(() => assertProfessionalSigningCpf('390.533.447-05', '39053344705')).not.toThrow();
    expect(() => assertProfessionalSigningCpf('39053344705', '39053344705')).not.toThrow();
    expect(() => assertProfessionalSigningCpf('39053344705', '11144477735')).toThrow(PROFESSIONAL_CPF_MISMATCH_MESSAGE);
    expect(() => assertProfessionalSigningCpf(null, '39053344705')).toThrow('Cadastre o CPF do profissional');
    expect(() => assertProfessionalSigningCpf('39053344705', null)).toThrow(PROFESSIONAL_CPF_MISMATCH_MESSAGE);
  });
});
