import { describe, expect, it } from 'vitest';
import {
  assertCidConsent,
  assertDocumentMutable,
  buildServerFrozenContent,
  CLIENT_IDENTITY_KEYS,
  hashDocumentContent,
  maskCpf,
  nextDocumentStatusAfterSign,
  normalizePrescriptionItems,
  parseSignatureRules,
  stripClientIdentity,
  validateTemplateVariables,
} from './operations-documents.utils';

describe('operations-documents.utils', () => {
  describe('frozenContent server-side', () => {
    it('remove campos de identidade enviados pelo cliente', () => {
      const stripped = stripClientIdentity({
        paciente: 'Hack',
        cpf: '00000000000',
        profissional: 'Fake',
        corpo: 'Texto clínico',
        dias: 3,
      });
      expect(stripped).toEqual({ corpo: 'Texto clínico', dias: 3 });
      for (const key of CLIENT_IDENTITY_KEYS) {
        expect(stripped[key]).toBeUndefined();
      }
    });

    it('monta identity a partir dos dados do servidor', () => {
      const frozen = buildServerFrozenContent({
        clinicalContent: {
          paciente: 'Ignorado',
          cpf: '11111111111',
          corpo: 'Afastamento 2 dias',
          cid: 'K02.1',
          cidConsent: {
            authorized: true,
            authorizedAt: '2026-08-07T12:00:00.000Z',
            authorizedById: 'actor-1',
          },
        },
        patient: { fullName: 'Mariana Souza', cpf: '12345678900' },
        professional: { name: 'Dra. Camila', croNumber: '12345', croState: 'MT' },
        clinic: { tradeName: 'Center Clinic' },
        template: { id: 't1', name: 'Atestado', type: 'ATTESTATION', version: 2 },
        generatedAt: new Date('2026-08-07T12:00:00.000Z'),
      });

      expect(frozen.paciente).toBeUndefined();
      expect(frozen.cpf).toBeUndefined();
      expect(frozen.corpo).toBe('Afastamento 2 dias');
      expect(frozen.identity).toMatchObject({
        patientName: 'Mariana Souza',
        patientCpfMasked: '123.***.***-00',
        professionalName: 'Dra. Camila',
        professionalCro: 'CRO/MT 12345',
        clinicName: 'Center Clinic',
      });
      expect(frozen.template).toMatchObject({ version: 2, type: 'ATTESTATION' });
    });

    it('hash muda se identity do servidor mudar', () => {
      const base = {
        clinicalContent: { corpo: 'x' },
        patient: { fullName: 'A', cpf: '12345678900' },
        professional: { name: 'B', croNumber: '1', croState: 'MT' },
        clinic: { tradeName: 'C' },
        template: { id: 't', name: 'T', type: 'CUSTOM', version: 1 },
        generatedAt: new Date('2026-08-07T00:00:00.000Z'),
      };
      const a = hashDocumentContent(buildServerFrozenContent(base));
      const b = hashDocumentContent(buildServerFrozenContent({
        ...base,
        patient: { fullName: 'A', cpf: '99999999999' },
      }));
      expect(a).not.toEqual(b);
      expect(maskCpf('12345678900')).toBe('123.***.***-00');
    });
  });

  describe('imutabilidade e assinaturas', () => {
    it('bloqueia mutação após SIGNED/CANCELLED', () => {
      expect(() => assertDocumentMutable('SIGNED')).toThrow(/imutável/);
      expect(() => assertDocumentMutable('CANCELLED')).toThrow(/imutável/);
      expect(() => assertDocumentMutable('GENERATED')).not.toThrow();
    });

    it('usa PARTIALLY_SIGNED quando faltam papéis', () => {
      const rules = parseSignatureRules({ requiredRoles: ['PROFESSIONAL', 'PATIENT'], minSignatures: 2 });
      const status = nextDocumentStatusAfterSign({
        currentStatus: 'GENERATED',
        signatures: [],
        newRole: 'PROFESSIONAL',
        rules,
      });
      expect(status).toBe('PARTIALLY_SIGNED');
    });

    it('marca SIGNED quando todos os papéis assinaram', () => {
      const rules = parseSignatureRules({ requiredRoles: ['PROFESSIONAL', 'PATIENT'] });
      const status = nextDocumentStatusAfterSign({
        currentStatus: 'PARTIALLY_SIGNED',
        signatures: [{ role: 'PROFESSIONAL' }],
        newRole: 'PATIENT',
        rules,
      });
      expect(status).toBe('SIGNED');
    });

    it('impede assinatura duplicada do mesmo papel', () => {
      expect(() => nextDocumentStatusAfterSign({
        currentStatus: 'PARTIALLY_SIGNED',
        signatures: [{ role: 'PROFESSIONAL' }],
        newRole: 'PROFESSIONAL',
        rules: parseSignatureRules({ requiredRoles: ['PROFESSIONAL', 'PATIENT'] }),
      })).toThrow(/já assinou/);
    });

    it('bloqueia nova assinatura em documento já SIGNED', () => {
      expect(() => nextDocumentStatusAfterSign({
        currentStatus: 'SIGNED',
        signatures: [{ role: 'PROFESSIONAL' }],
        newRole: 'PATIENT',
        rules: parseSignatureRules({}),
      })).toThrow(/imutável/);
    });
  });

  describe('CID consent e RX', () => {
    it('exige cidConsent quando CID presente', () => {
      expect(() => assertCidConsent({
        templateType: 'ATTESTATION',
        clinicalContent: { cid: 'K02.1' },
      })).toThrow(/cidConsent/);
      expect(() => assertCidConsent({
        templateType: 'ATTESTATION',
        clinicalContent: {
          cid: 'K02.1',
          cidConsent: { authorized: true, authorizedAt: '2026-08-07T00:00:00Z', authorizedById: 'u1' },
        },
      })).not.toThrow();
    });

    it('normaliza itens de prescrição', () => {
      const items = normalizePrescriptionItems([
        { name: 'Dipirona 500mg', qty: '1 caixa', instructions: '1 cp 6/6h' },
      ]);
      expect(items[0]).toMatchObject({
        medicationName: 'Dipirona 500mg',
        quantity: '1 caixa',
        dosage: '1 cp 6/6h',
      });
    });

    it('valida variáveis obrigatórias do template', () => {
      expect(validateTemplateVariables(['corpo', 'dias?', 'identity.patientName'], { corpo: 'ok' })).toEqual([]);
      expect(validateTemplateVariables(['corpo'], {})).toEqual(['Variável obrigatória ausente: corpo']);
    });
  });
});
