import { HttpException, HttpStatus } from '@nestjs/common';
import Redis from 'ioredis';

type Bucket = { count: number; resetAt: number };

const memory = new Map<string, Bucket>();
let redisClient: Redis | null | undefined;

function useRedis(): boolean {
  return (process.env.QUEUE_DRIVER ?? '').toLowerCase() === 'redis'
    && Boolean(process.env.REDIS_URL?.trim());
}

function getRedis(): Redis | null {
  if (!useRedis()) return null;
  if (redisClient === undefined) {
    try {
      redisClient = new Redis(process.env.REDIS_URL!, {
        maxRetriesPerRequest: 1,
        enableReadyCheck: false,
        lazyConnect: true,
      });
    } catch {
      redisClient = null;
    }
  }
  return redisClient;
}

async function consumeRedis(key: string, max: number, windowMs: number): Promise<boolean> {
  const client = getRedis();
  if (!client) return consumeMemory(key, max, windowMs);
  try {
    if (client.status === 'wait') await client.connect();
    const redisKey = `rl:${key}`;
    const count = await client.incr(redisKey);
    if (count === 1) await client.pexpire(redisKey, windowMs);
    return count <= max;
  } catch {
    return consumeMemory(key, max, windowMs);
  }
}

function consumeMemory(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const current = memory.get(key);
  if (!current || now >= current.resetAt) {
    memory.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= max) return false;
  current.count += 1;
  return true;
}

/** Consome uma tentativa. Retorna false se o limite foi excedido. */
export async function consumeRateLimit(
  key: string,
  max: number,
  windowMs: number,
  now = Date.now(),
): Promise<boolean> {
  if (useRedis()) return consumeRedis(key, max, windowMs);
  return consumeMemory(key, max, windowMs, now);
}

export async function assertRateLimit(
  key: string,
  max: number,
  windowMs: number,
  message = 'Muitas tentativas. Aguarde alguns minutos.',
): Promise<void> {
  const ok = await consumeRateLimit(key, max, windowMs);
  if (!ok) throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
}

export const RATE_LIMITS = {
  login: { max: 10, windowMs: 15 * 60 * 1000 },
  forgot: { max: 10, windowMs: 15 * 60 * 1000 },
  reset: { max: 10, windowMs: 15 * 60 * 1000 },
  invite: { max: 10, windowMs: 15 * 60 * 1000 },
  setup: { max: 5, windowMs: 15 * 60 * 1000 },
  publicLink: { max: 60, windowMs: 15 * 60 * 1000 },
  webhook: { max: 120, windowMs: 60 * 1000 },
  /** Public API: ~120 req/min por chave (Redis com fallback memória). */
  apiKey: { max: 120, windowMs: 60 * 1000 },
} as const;

/** Só para testes. */
export function clearMemoryRateLimits(): void {
  memory.clear();
}
