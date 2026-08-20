import { describe, expect, it } from 'vitest';
import { clearMemoryRateLimits, consumeRateLimit, RATE_LIMITS } from '../../common/rate-limit';
import { classifySetupState } from './setup.dto';
import { setupTokensEqual } from './setup.service';

describe('setup helpers', () => {
  it('classifica EMPTY / READY / INCONSISTENT sem expor contagens', () => {
    expect(classifySetupState({ installationExists: false, organizationCount: 0, userCount: 0 }))
      .toEqual({ required: true, state: 'EMPTY' });
    expect(classifySetupState({ installationExists: true, organizationCount: 1, userCount: 1 }))
      .toEqual({ required: false, state: 'READY' });
    expect(classifySetupState({ installationExists: false, organizationCount: 1, userCount: 0 }))
      .toEqual({ required: false, state: 'INCONSISTENT' });
    expect(classifySetupState({ installationExists: false, organizationCount: 0, userCount: 1 }))
      .toEqual({ required: false, state: 'INCONSISTENT' });
  });

  it('compara tokens com tempo constante via hash', () => {
    expect(setupTokensEqual('token-certo', 'token-certo')).toBe(true);
    expect(setupTokensEqual('token-certo', 'token-errado')).toBe(false);
  });

  it('limita tentativas de initialize por chave', async () => {
    clearMemoryRateLimits();
    const key = `setup:test-${Date.now()}-${Math.random()}`;
    const { max, windowMs } = RATE_LIMITS.setup;
    for (let i = 0; i < max; i += 1) {
      expect(await consumeRateLimit(key, max, windowMs, 1_000 + i)).toBe(true);
    }
    expect(await consumeRateLimit(key, max, windowMs, 1_000 + max)).toBe(false);
    expect(await consumeRateLimit(key, max, windowMs, 1_000 + windowMs)).toBe(true);
  });
});
