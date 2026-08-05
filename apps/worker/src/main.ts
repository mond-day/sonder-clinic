import { processOutbox } from './outbox';

const intervalMs = 5_000;

console.info(JSON.stringify({ service: 'sonder-worker', status: 'started', driver: process.env.QUEUE_DRIVER ?? 'memory' }));
setInterval(() => void processOutbox(), intervalMs);
void processOutbox();
