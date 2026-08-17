import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@sonder/database';
import { IntegrationsService } from './integrations.service';

const MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('IntegrationsService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('usa adapters mockados por padrão no desenvolvimento', async () => {
    vi.stubEnv('ENCRYPTION_MASTER_KEY', MASTER_KEY);
    vi.stubEnv('NIBO_MOCK', 'true');
    vi.stubEnv('ABACATEPAY_MOCK', 'true');
    vi.stubEnv('EVOLUTION_MOCK', 'true');
    vi.stubEnv('CHATWOOT_MOCK', 'true');
    const service = new IntegrationsService();
    const listed = await service.list();

    expect(listed.bootstrap).toHaveLength(4);
    await expect(service.test('NIBO')).resolves.toMatchObject({
      success: false,
      provider: 'NIBO',
      enabled: false,
    });
  });

  it('recusa modo live sem credenciais', async () => {
    vi.stubEnv('ENCRYPTION_MASTER_KEY', MASTER_KEY);
    vi.stubEnv('NIBO_MOCK', 'false');
    const service = new IntegrationsService();

    await expect(service.test('NIBO')).resolves.toMatchObject({
      success: false,
    });
  });

  it('testConnection NIBO com apiKey da conexão tenta live mesmo com MOCK', async () => {
    vi.stubEnv('ENCRYPTION_MASTER_KEY', MASTER_KEY);
    vi.stubEnv('NIBO_MOCK', 'true');
    const service = new IntegrationsService();
    vi.spyOn(prisma.integrationConnection, 'findFirst').mockResolvedValue({
      id: 'conn-1',
      provider: 'NIBO',
      encryptedCredentials: 'stored',
      configuration: {},
      lastSyncAt: null,
      status: 'ACTIVE',
      clinicId: 'clinic-1',
      scopeType: 'CLINIC',
      scopeId: 'clinic-1',
    } as never);
    vi.spyOn(service, 'decryptForAdapter').mockReturnValue({ apiKey: 'tenant-key' });
    vi.spyOn(prisma.integrationConnection, 'update').mockResolvedValue({} as never);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '[]',
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await service.testConnection('org-1', 'conn-1');
    expect(String(result.message ?? '')).not.toMatch(/MOCK/i);
    expect(fetchMock).toHaveBeenCalled();
  });
});
