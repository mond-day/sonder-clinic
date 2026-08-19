import { describe, expect, it } from 'vitest';
import { classifySetupState } from './setup.dto';
import { consumeSetupAttempt, setupTokensEqual } from './setup.service';

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

  it('limita tentativas de initialize por chave', () => {
    const key = `test-${Date.now()}-${Math.random()}`;
    expect(consumeSetupAttempt(key, 1_000)).toBe(true);
    expect(consumeSetupAttempt(key, 1_001)).toBe(true);
    expect(consumeSetupAttempt(key, 1_002)).toBe(true);
    expect(consumeSetupAttempt(key, 1_003)).toBe(true);
    expect(consumeSetupAttempt(key, 1_004)).toBe(true);
    expect(consumeSetupAttempt(key, 1_005)).toBe(false);
    expect(consumeSetupAttempt(key, 1_000 + 15 * 60 * 1000)).toBe(true);
  });
});
