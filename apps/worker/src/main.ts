import { startObservability, hydrateDockerSecrets } from '@sonder/observability';
import { assertWorkerProductionEnvironment } from './production-env';
import { materializeExpiredAnamneses } from './anamnesis-expire';
import { processDueFinanceRecurrences } from './finance-recurrences';
import { renewExpiringGoogleCalendarWatches, isGoogleWatchAutoRenewEnabled } from './google-calendar-watch-renew';
import { processDueTaskRecurrences } from './task-recurrences';
import { processOutbox } from './outbox';

const intervalMs = 5_000;
const anamnesisExpireEveryMs = Number(process.env.ANAMNESIS_EXPIRE_INTERVAL_MS ?? 3600_000);
const googleWatchRenewEveryMs = Number(
  process.env.GOOGLE_CALENDAR_WATCH_RENEW_INTERVAL_MS ?? 6 * 3600_000,
);

let lastAnamnesisExpireAt = 0;
let lastGoogleWatchRenewAt = 0;
let tickRunning = false;

async function tick(): Promise<void> {
  // Mutex local: evita overlap de ticks na mesma réplica (multi-réplica coberta pelo claim em §4).
  if (tickRunning) return;
  tickRunning = true;
  try {
    await processOutbox();
    const [financeGenerated, taskGenerated] = await Promise.all([
      processDueFinanceRecurrences(),
      processDueTaskRecurrences(),
    ]);
    if (financeGenerated > 0) {
      console.info(JSON.stringify({
        service: 'sonder-worker',
        event: 'finance-recurrence.generated',
        count: financeGenerated,
      }));
    }
    if (taskGenerated > 0) {
      console.info(JSON.stringify({
        service: 'sonder-worker',
        event: 'task-recurrence.generated',
        count: taskGenerated,
      }));
    }

    const now = Date.now();
    if (now - lastAnamnesisExpireAt >= anamnesisExpireEveryMs) {
      lastAnamnesisExpireAt = now;
      try {
        const expired = await materializeExpiredAnamneses();
        if (expired > 0) {
          console.info(JSON.stringify({
            service: 'sonder-worker',
            event: 'anamnesis.expired.materialized',
            count: expired,
          }));
        }
      } catch (error) {
        console.warn(JSON.stringify({
          service: 'sonder-worker',
          event: 'anamnesis.expired.failed',
          error: error instanceof Error ? error.message : 'unknown',
        }));
      }
    }

    if (
      isGoogleWatchAutoRenewEnabled()
      && now - lastGoogleWatchRenewAt >= googleWatchRenewEveryMs
    ) {
      lastGoogleWatchRenewAt = now;
      try {
        const result = await renewExpiringGoogleCalendarWatches();
        if (result.renewed > 0 || result.failed > 0) {
          console.info(JSON.stringify({
            service: 'sonder-worker',
            event: 'google-calendar.watch-renew',
            ...result,
          }));
        }
      } catch (error) {
        console.warn(JSON.stringify({
          service: 'sonder-worker',
          event: 'google-calendar.watch-renew.failed',
          error: error instanceof Error ? error.message : 'unknown',
        }));
      }
    }
  } finally {
    tickRunning = false;
  }
}

async function main(): Promise<void> {
  hydrateDockerSecrets();
  assertWorkerProductionEnvironment();
  await startObservability('sonder-worker');
  console.info(JSON.stringify({
    service: 'sonder-worker',
    status: 'started',
    driver: process.env.QUEUE_DRIVER ?? 'memory',
    googleWatchAutoRenew: isGoogleWatchAutoRenewEnabled(),
  }));
  setInterval(() => void tick(), intervalMs);
  void tick();
}

void main();
