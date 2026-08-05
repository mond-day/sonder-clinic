import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntegrationsService } from './integrations.service';

const MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('IntegrationsService', () => {
  afterEach(() => vi.unstubAllEnvs());

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
      success: true,
      provider: 'NIBO',
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
});
