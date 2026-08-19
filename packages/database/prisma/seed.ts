import { PrismaClient } from '@prisma/client';
import { seedDemo } from './seeds/demo';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  if ((process.env.NODE_ENV ?? '').toLowerCase() === 'production') {
    throw new Error('pnpm db:seed é exclusivo de desenvolvimento/CI. Não use seed de demo em produção. Use o setup inicial (/setup).');
  }
  await seedDemo(prisma);
}

main().finally(() => prisma.$disconnect());
