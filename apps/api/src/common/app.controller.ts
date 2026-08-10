import {
  Controller, Get, HttpException, HttpStatus,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { prisma } from '@sonder/database';
import { observabilityStatus } from '@sonder/observability';
import { storageStatus } from '@sonder/storage';
import net from 'node:net';

async function pingRedis(url: string, timeoutMs = 2_000): Promise<boolean> {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const port = Number(parsed.port || 6379);
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error('timeout'));
      }, timeoutMs);
      socket.once('connect', () => {
        clearTimeout(timer);
        socket.end();
        resolve();
      });
      socket.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    return true;
  } catch {
    return false;
  }
}

@ApiTags('system')
@Controller()
export class AppController {
  @Get('health')
  health() {
    const storage = storageStatus();
    const observability = observabilityStatus('sonder-api');
    return {
      status: 'ok',
      service: 'sonder-api',
      timestamp: new Date().toISOString(),
      storage: storage.storage,
      antivirus: storage.antivirus,
      observability: {
        enabled: observability.enabled,
        exporter: observability.exporter,
        reason: observability.reason,
      },
    };
  }

  @Get('health/ready')
  async ready() {
    const checks: Record<string, { ok: boolean; detail?: string }> = {};
    const isProd = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { ok: true };
    } catch (error) {
      checks.database = {
        ok: false,
        detail: error instanceof Error ? error.message : 'database unavailable',
      };
    }

    const queueDriver = (process.env.QUEUE_DRIVER ?? 'memory').toLowerCase();
    if (queueDriver === 'redis' || isProd) {
      const redisUrl = process.env.REDIS_URL?.trim();
      if (!redisUrl) {
        checks.redis = { ok: false, detail: 'REDIS_URL ausente' };
      } else {
        const ok = await pingRedis(redisUrl);
        checks.redis = { ok, detail: ok ? undefined : 'conexão recusada/timeout' };
      }
    } else {
      checks.redis = { ok: true, detail: 'skipped (QUEUE_DRIVER!=redis)' };
    }

    const storage = storageStatus();
    const storageDriver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
    if (isProd || storageDriver !== 'local') {
      checks.storage = {
        ok: Boolean(storage.storage),
        detail: typeof storage.storage === 'string' ? storage.storage : undefined,
      };
    } else {
      checks.storage = { ok: true, detail: 'local' };
    }

    const ready = Object.values(checks).every((item) => item.ok);
    const body = {
      status: ready ? 'ready' : 'not_ready',
      service: 'sonder-api',
      timestamp: new Date().toISOString(),
      checks,
    };
    if (!ready) {
      throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return body;
  }
}
