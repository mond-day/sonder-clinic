import { describe, expect, it } from 'vitest';
import { assertContractSignatureAllowed } from './document-signature-policy';

describe('assertContractSignatureAllowed', () => {
  it('permite assinatura eletrônica do paciente', () => {
    expect(() => assertContractSignatureAllowed({
      templateType: 'CONTRACT',
      role: 'PATIENT',
      method: 'ELECTRONIC_REMOTE',
      existingRoles: [],
    })).not.toThrow();
  });

  it('bloqueia A1 da clínica antes do paciente', () => {
    expect(() => assertContractSignatureAllowed({
      templateType: 'CONTRACT',
      role: 'CLINIC',
      method: 'A1',
      existingRoles: [],
      serviceProviderSigner: 'CLINIC',
    })).toThrow(/antes da clínica/);
  });

  it('permite A1 da clínica depois do paciente', () => {
    expect(() => assertContractSignatureAllowed({
      templateType: 'CONTRACT',
      role: 'CLINIC',
      method: 'A1',
      existingRoles: ['PATIENT'],
      serviceProviderSigner: 'CLINIC',
    })).not.toThrow();
  });

  it('não aplica regra rígida em atestado nesta fatia', () => {
    expect(() => assertContractSignatureAllowed({
      templateType: 'ATTESTATION',
      role: 'PROFESSIONAL',
      method: 'DRAWN',
      existingRoles: [],
    })).not.toThrow();
  });
});
