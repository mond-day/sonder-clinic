import { describe, expect, it } from 'vitest';
import { omitSetupSecrets, resolveSetupApiBase, toInitializeBody } from './setup-initialize';

describe('toInitializeBody', () => {
  it('preenche organização, clínica e unidade a partir do nome da clínica', () => {
    expect(toInitializeBody({
      clinicName: '  Clínica Aurora  ',
      adminName: '  Ana Admin  ',
      adminEmail: '  Ana@Clinic.COM  ',
      adminPassword: 'SenhaForte1',
      taxId: ' 12.345.678/0001-99 ',
    })).toEqual({
      organization: {
        legalName: 'Clínica Aurora',
        tradeName: 'Clínica Aurora',
        taxId: '12.345.678/0001-99',
      },
      clinic: {
        legalName: 'Clínica Aurora',
        tradeName: 'Clínica Aurora',
      },
      unit: { name: 'Unidade principal' },
      admin: {
        name: 'Ana Admin',
        email: 'ana@clinic.com',
        password: 'SenhaForte1',
      },
    });
  });

  it('omite taxId vazio', () => {
    const body = toInitializeBody({
      clinicName: 'Clinic',
      adminName: 'Ana',
      adminEmail: 'ana@clinic.com',
      adminPassword: 'SenhaForte1',
      taxId: '   ',
    });
    expect(body.organization).not.toHaveProperty('taxId');
  });
});

describe('resolveSetupApiBase', () => {
  it('prefere a URL interna do Swarm', () => {
    expect(resolveSetupApiBase({
      INTERNAL_API_URL: 'http://api:4000/api/v1/',
      NEXT_PUBLIC_API_URL: 'https://api.example.com/api/v1',
    })).toBe('http://api:4000/api/v1');
  });

  it('cai no fallback local', () => {
    expect(resolveSetupApiBase({})).toBe('http://localhost:4000/api/v1');
  });
});

describe('setup payload sanitization', () => {
  it('remove campos de token do JSON antes de encaminhar', () => {
    expect(omitSetupSecrets({
      setupToken: 'nao-deve-seguir',
      token: 'tampouco',
      initialSetupToken: 'nem-esse',
      organization: { legalName: 'Clinic' },
    })).toEqual({
      organization: { legalName: 'Clinic' },
    });
  });
});
