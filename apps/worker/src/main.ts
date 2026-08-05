import { prisma } from '@sonder/database';

const intervalMs = 5_000;

async function processOutbox(): Promise<void> {
  const events = await prisma.outboxEvent.findMany({
    where: { processedAt: null, attempts: { lt: 5 } },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });
  for (const event of events) {
    try {
      // Os adapters reais serão acionados aqui; em dev o processamento é idempotente e local.
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date(), attempts: { increment: 1 } },
      });
    } catch (error) {
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          attempts: { increment: 1 },
          lastError: error instanceof Error ? error.message.slice(0, 500) : 'Erro desconhecido',
        },
      });
    }
  }
}

console.info(JSON.stringify({ service: 'sonder-worker', status: 'started', driver: process.env.QUEUE_DRIVER ?? 'memory' }));
setInterval(() => void processOutbox(), intervalMs);
void processOutbox();
