import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma, WHATSAPP_NOT_CONFIGURED_REASON } from '@sonder/database';
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

  it('testConnection Evolution usa credenciais da conexão (não só env)', async () => {
    vi.stubEnv('ENCRYPTION_MASTER_KEY', MASTER_KEY);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('EVOLUTION_MOCK', 'false');
    const service = new IntegrationsService();
    vi.spyOn(prisma.integrationConnection, 'findFirst').mockResolvedValue({
      id: 'conn-evo',
      provider: 'EVOLUTION',
      encryptedCredentials: 'stored',
      configuration: { baseUrl: 'https://evo.example' },
      lastSyncAt: null,
      status: 'ACTIVE',
      clinicId: 'clinic-1',
      scopeType: 'CLINIC',
      scopeId: 'clinic-1',
    } as never);
    vi.spyOn(service, 'decryptForAdapter').mockReturnValue({
      apiKey: 'evo-key',
      instanceName: 'clinic',
    });
    vi.spyOn(prisma.integrationConnection, 'update').mockResolvedValue({} as never);
    vi.spyOn(prisma, '$transaction').mockResolvedValue(0 as never);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '[]',
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await service.testConnection('org-1', 'conn-evo');
    expect(result.success).toBe(true);
    expect(String(result.message ?? '')).toMatch(/Evolution/i);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://evo.example/instance/fetchInstances',
      expect.objectContaining({ headers: expect.objectContaining({ apikey: 'evo-key' }) }),
    );
  });

  it('testConnection AbacatePay não trata MOCK ausente como ligado em produção', async () => {
    vi.stubEnv('ENCRYPTION_MASTER_KEY', MASTER_KEY);
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.ABACATEPAY_MOCK;
    const service = new IntegrationsService();
    vi.spyOn(prisma.integrationConnection, 'findFirst').mockResolvedValue({
      id: 'conn-aba',
      provider: 'ABACATEPAY',
      encryptedCredentials: 'stored',
      configuration: {},
      lastSyncAt: null,
      status: 'ACTIVE',
      clinicId: 'clinic-1',
      scopeType: 'CLINIC',
      scopeId: 'clinic-1',
    } as never);
    vi.spyOn(service, 'decryptForAdapter').mockReturnValue({ apiKey: 'aba-key' });
    vi.spyOn(prisma.integrationConnection, 'update').mockResolvedValue({} as never);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { id: 'x' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await service.testConnection('org-1', 'conn-aba');
    expect(String(result.message ?? '')).not.toMatch(/MOCK/i);
    expect(fetchMock).toHaveBeenCalled();
  });

  describe('Chatwoot ativo reativa lembretes bloqueados por falta de WhatsApp', () => {
    const chatwootConnection = {
      id: 'conn-cw',
      provider: 'CHATWOOT',
      encryptedCredentials: 'stored',
      configuration: {},
      lastSyncAt: null,
      status: 'ERROR',
      clinicId: 'clinic-1',
      scopeType: 'CLINIC',
      scopeId: 'clinic-1',
    };
    const scheduledFor = new Date(Date.now() + 86_400_000);

    function setup(credentials: Record<string, string>, fetchOk = true) {
      vi.stubEnv('ENCRYPTION_MASTER_KEY', MASTER_KEY);
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('CHATWOOT_MOCK', 'false');
      const service = new IntegrationsService();
      vi.spyOn(prisma.integrationConnection, 'findFirst').mockResolvedValue(chatwootConnection as never);
      vi.spyOn(service, 'decryptForAdapter').mockReturnValue(credentials);
      const connectionUpdate = vi.spyOn(prisma.integrationConnection, 'update').mockResolvedValue({} as never);
      const tx = {
        appointmentReminder: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'rem-1', appointmentId: 'appt-1', scheduledFor, leadMinutes: 1440 },
          ]),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        outboxEvent: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      };
      vi.spyOn(prisma, '$transaction').mockImplementation(
        ((run: (client: typeof tx) => unknown) => Promise.resolve(run(tx))) as never,
      );
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: fetchOk,
        status: fetchOk ? 200 : 401,
        text: async () => '{}',
      }));
      return { service, tx, connectionUpdate };
    }

    const fullCredentials = { baseUrl: 'https://cw.example', apiToken: 'tok', accountId: '1', inboxId: '7' };

    it('teste com sucesso marca ACTIVE e devolve à fila só lembretes DISABLED futuros da mesma clínica/organização', async () => {
      const { service, tx, connectionUpdate } = setup(fullCredentials);

      const result = await service.testConnection('org-1', 'conn-cw');

      expect(result.success).toBe(true);
      expect(connectionUpdate).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'ACTIVE' }),
      }));
      expect(tx.appointmentReminder.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          status: 'DISABLED',
          statusReason: WHATSAPP_NOT_CONFIGURED_REASON,
          scheduledFor: { gt: expect.any(Date) },
          appointment: expect.objectContaining({
            organizationId: 'org-1',
            clinicId: 'clinic-1',
            kind: 'APPOINTMENT',
            patientId: { not: null },
          }),
        }),
      }));
      expect(tx.appointmentReminder.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['rem-1'] }, status: 'DISABLED' },
        data: { status: 'PENDING', statusReason: null },
      });
      expect(tx.outboxEvent.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({
          aggregateId: 'rem-1',
          eventType: 'appointment.whatsapp-reminder.requested',
        })],
      });
      expect(result).toMatchObject({ reactivatedReminders: 1 });
    });

    it('teste com falha não reativa lembretes', async () => {
      const { service, tx } = setup(fullCredentials, false);

      const result = await service.testConnection('org-1', 'conn-cw');

      expect(result.success).toBe(false);
      expect(tx.appointmentReminder.findMany).not.toHaveBeenCalled();
    });

    it('desativar só muda o status (credenciais ficam) e reativar volta ACTIVE e devolve lembretes à fila', async () => {
      const { service, tx, connectionUpdate } = setup(fullCredentials);
      vi.spyOn(prisma.auditEvent, 'create').mockResolvedValue({} as never);
      vi.spyOn(prisma, '$transaction').mockImplementation(((arg: unknown) => (
        Array.isArray(arg) ? Promise.all(arg) : Promise.resolve((arg as (client: typeof tx) => unknown)(tx))
      )) as never);

      await service.setStatus('org-1', 'user-1', 'conn-cw', 'DISABLED');
      expect(connectionUpdate).toHaveBeenLastCalledWith({ where: { id: 'conn-cw' }, data: { status: 'DISABLED' } });
      expect(tx.appointmentReminder.findMany).not.toHaveBeenCalled();

      const result = await service.setStatus('org-1', 'user-1', 'conn-cw', 'ACTIVE');
      expect(connectionUpdate).toHaveBeenLastCalledWith({ where: { id: 'conn-cw' }, data: { status: 'ACTIVE' } });
      expect(result).toEqual({ id: 'conn-cw', status: 'ACTIVE', reactivatedReminders: 1 });
    });

    it('sucesso sem inbox avisa que o envio vai falhar', async () => {
      const { service } = setup({ baseUrl: 'https://cw.example', apiToken: 'tok', accountId: '1' });

      const result = await service.testConnection('org-1', 'conn-cw');

      expect(result.success).toBe(true);
      expect(String(result.message)).toMatch(/inbox/i);
    });
  });
});
