import { prisma } from '@sonder/database';

/**
 * Materializa status EXPIRED para anamneses SIGNED com validUntil < hoje (UTC date).
 * Idempotente; não toca CANCELLED/SUPERSEDED.
 */
export async function materializeExpiredAnamneses(now = new Date()): Promise<number> {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const result = await prisma.anamnesisResponse.updateMany({
    where: {
      status: 'SIGNED',
      validUntil: { lt: day },
    },
    data: { status: 'EXPIRED' },
  });
  return result.count;
}
