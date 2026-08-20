import { prisma } from '@sonder/database';

const TTL_MS = 30_000;

type CacheEntry = { status: string; expiresAt: number };

const cache = new Map<string, CacheEntry>();

/** Status do usuário com cache curto (~30s) para o AuthGuard. */
export async function getCachedUserStatus(userId: string): Promise<string | null> {
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > now) return hit.status;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });
  if (!user) {
    cache.delete(userId);
    return null;
  }
  cache.set(userId, { status: user.status, expiresAt: now + TTL_MS });
  return user.status;
}

export function invalidateUserStatusCache(userId: string): void {
  cache.delete(userId);
}

/** Só para testes. */
export function clearUserStatusCache(): void {
  cache.clear();
}
