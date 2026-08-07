import { startObservability } from '@sonder/observability';
import { processDueFinanceRecurrences } from './finance-recurrences';
import { processOutbox } from './outbox';

const intervalMs = 5_000;

async function tick(): Promise<void> {
  await processOutbox();
  const generated = await processDueFinanceRecurrences();
  if (generated > 0) {
    console.info(JSON.stringify({
      service: 'sonder-worker',
      event: 'finance-recurrence.generated',
      count: generated,
    }));
  }
}

async function main(): Promise<void> {
  await startObservability('sonder-worker');
  console.info(JSON.stringify({ service: 'sonder-worker', status: 'started', driver: process.env.QUEUE_DRIVER ?? 'memory' }));
  setInterval(() => void tick(), intervalMs);
  void tick();
}

void main();
