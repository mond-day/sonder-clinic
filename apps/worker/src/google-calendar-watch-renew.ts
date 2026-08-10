import { randomBytes, randomUUID } from 'node:crypto';
import { Prisma, prisma } from '@sonder/database';
import {
  decryptIntegrationCredentials,
  encryptIntegrationCredentials,
  ensureAccessToken,
  isGoogleCalendarMock,
  readCalendarId,
  resolveGoogleOAuth,
} from './google-calendar';

function pick(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function isGoogleWatchAutoRenewEnabled(): boolean {
  const raw = (process.env.GOOGLE_CALENDAR_WATCH_AUTO_RENEW ?? 'true').toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

export function googleWatchRenewLeadMs(): number {
  const hours = Number(process.env.GOOGLE_CALENDAR_WATCH_RENEW_LEAD_HOURS ?? '24');
  const safe = Number.isFinite(hours) && hours > 0 ? hours : 24;
  return safe * 3600_000;
}

async function stopChannel(accessToken: string, channelId: string, resourceId: string) {
  await fetch('https://www.googleapis.com/calendar/v3/channels/stop', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ id: channelId, resourceId }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => undefined);
}

async function registerWatch(accessToken: string, calendarId: string, input: {
  channelId: string;
  address: string;
  token: string;
}) {
  const cal = encodeURIComponent(calendarId || 'primary');
  const expiration = Date.now() + 6 * 24 * 60 * 60 * 1000;
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${cal}/events/watch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      id: input.channelId,
      type: 'web_hook',
      address: input.address,
      token: input.token,
      expiration: String(expiration),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Google watch renew falhou (HTTP ${response.status}).`);
  }
  const resourceId = pick(body.resourceId);
  if (!resourceId) throw new Error('Google watch renew sem resourceId.');
  return {
    channelId: pick(body.id) || input.channelId,
    resourceId,
    expiration: pick(body.expiration) || String(expiration),
  };
}

/**
 * Renova canais Google Calendar próximos do vencimento.
 * Lease atômico via updateMany condicional em configuration.webhookRenewLeaseUntil.
 * Assumir uma réplica de worker em produção é aceitável; o CAS reduz race entre réplicas.
 * Falhas são registradas em webhookWatchLastError sem derrubar o worker.
 */
export async function renewExpiringGoogleCalendarWatches(now = new Date()): Promise<{
  checked: number;
  renewed: number;
  skipped: number;
  failed: number;
}> {
  if (!isGoogleWatchAutoRenewEnabled() || isGoogleCalendarMock()) {
    return { checked: 0, renewed: 0, skipped: 0, failed: 0 };
  }
  const webhookUrl = pick(process.env.GOOGLE_CALENDAR_WEBHOOK_URL);
  if (!webhookUrl) {
    return { checked: 0, renewed: 0, skipped: 0, failed: 0 };
  }

  const leadMs = googleWatchRenewLeadMs();
  const threshold = new Date(now.getTime() + leadMs);
  const connections = await prisma.integrationConnection.findMany({
    where: { provider: 'GOOGLE_CALENDAR', status: 'ACTIVE' },
    take: 100,
  });

  let renewed = 0;
  let skipped = 0;
  let failed = 0;

  for (const connection of connections) {
    const config =
      connection.configuration && typeof connection.configuration === 'object' && !Array.isArray(connection.configuration)
        ? { ...(connection.configuration as Record<string, unknown>) }
        : {};

    const expirationRaw = pick(config.webhookExpiration);
    if (!expirationRaw) {
      skipped += 1;
      continue;
    }
    const expirationMs = Number(expirationRaw);
    const expirationDate = Number.isFinite(expirationMs)
      ? new Date(expirationMs)
      : new Date(expirationRaw);
    if (Number.isNaN(expirationDate.getTime()) || expirationDate > threshold) {
      skipped += 1;
      continue;
    }

    const leaseUntilRaw = pick(config.webhookRenewLeaseUntil);
    if (leaseUntilRaw && new Date(leaseUntilRaw) > now) {
      skipped += 1;
      continue;
    }

    const leaseUntil = new Date(now.getTime() + 5 * 60_000).toISOString();
    // Claim atômico: só uma réplica do worker obtém o lease.
    const claimed = await prisma.$executeRaw`
      UPDATE "IntegrationConnection"
      SET "configuration" = COALESCE("configuration", '{}'::jsonb)
        || jsonb_build_object('webhookRenewLeaseUntil', ${leaseUntil}::text)
      WHERE "id" = ${connection.id}::uuid
        AND "status" = 'ACTIVE'
        AND (
          "configuration" IS NULL
          OR "configuration"->>'webhookRenewLeaseUntil' IS NULL
          OR ("configuration"->>'webhookRenewLeaseUntil')::timestamptz <= ${now}
        )
    `;
    if (Number(claimed) !== 1) {
      skipped += 1;
      continue;
    }

    try {
      if (!connection.encryptedCredentials) {
        throw new Error('Conexão sem credenciais.');
      }
      let credentials = decryptIntegrationCredentials(connection.encryptedCredentials);
      const oauth = resolveGoogleOAuth(credentials);
      if (!oauth) throw new Error('OAuth Google incompleto.');
      const fresh = await ensureAccessToken(oauth, credentials);
      if (fresh.refreshed) {
        credentials = fresh.credentials;
        await prisma.integrationConnection.update({
          where: { id: connection.id },
          data: { encryptedCredentials: encryptIntegrationCredentials(credentials) },
        });
      }

      const prevChannelId = pick(config.webhookChannelId);
      const prevResourceId = pick(config.webhookResourceId);
      if (prevChannelId && prevResourceId) {
        await stopChannel(fresh.accessToken, prevChannelId, prevResourceId);
      }

      const channelId = randomUUID();
      const token = pick(config.webhookChannelToken, process.env.GOOGLE_CALENDAR_WEBHOOK_TOKEN)
        || randomBytes(24).toString('hex');
      const calendarId = readCalendarId(config);
      const watch = await registerWatch(fresh.accessToken, calendarId, {
        channelId,
        address: webhookUrl,
        token,
      });

      await prisma.integrationConnection.update({
        where: { id: connection.id },
        data: {
          configuration: {
            ...config,
            calendarId,
            webhookChannelId: watch.channelId,
            webhookResourceId: watch.resourceId,
            webhookChannelToken: token,
            webhookExpiration: watch.expiration,
            webhookRegisteredAt: new Date().toISOString(),
            webhookWatchLastError: null,
            webhookRenewLeaseUntil: null,
            webhookLastRenewedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
          lastSyncAt: new Date(),
        },
      });
      renewed += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : 'Falha desconhecida no renew.';
      await prisma.integrationConnection.update({
        where: { id: connection.id },
        data: {
          configuration: {
            ...config,
            webhookWatchLastError: message.slice(0, 500),
            webhookRenewLeaseUntil: null,
          } as Prisma.InputJsonValue,
        },
      }).catch(() => undefined);
      console.warn(JSON.stringify({
        service: 'sonder-worker',
        event: 'google-calendar.watch-renew.failed',
        connectionId: connection.id,
        error: message,
      }));
    }
  }

  return { checked: connections.length, renewed, skipped, failed };
}
