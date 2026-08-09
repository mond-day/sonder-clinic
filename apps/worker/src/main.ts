import { startObservability } from '@sonder/observability';
import { processDueFinanceRecurrences } from './finance-recurrences';
import { processDueTaskRecurrences } from './task-recurrences';
import { processOutbox } from './outbox';

const intervalMs = 5_000;

async function tick(): Promise<void> {
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
}

async function main(): Promise<void> {
  await startObservability('sonder-worker');
  console.info(JSON.stringify({ service: 'sonder-worker', status: 'started', driver: process.env.QUEUE_DRIVER ?? 'memory' }));
  setInterval(() => void tick(), intervalMs);
  void tick();
}

void main();
