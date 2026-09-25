import { describe, expect, it } from 'vitest';
import { isNiboPullEnabled, niboPullIntervalMs } from './nibo-pull';
import { isNiboMock, readNiboAccountId, readNiboIdList } from './nibo-sync';

describe('nibo-pull config', () => {
  it('isNiboPullEnabled respeita env', () => {
    const prev = process.env.NIBO_PULL_ENABLED;
    process.env.NIBO_PULL_ENABLED = 'false';
    expect(isNiboPullEnabled()).toBe(false);
    process.env.NIBO_PULL_ENABLED = 'true';
    expect(isNiboPullEnabled()).toBe(true);
    if (prev === undefined) delete process.env.NIBO_PULL_ENABLED;
    else process.env.NIBO_PULL_ENABLED = prev;
  });

  it('niboPullIntervalMs tem piso de 1 minuto', () => {
    const prev = process.env.NIBO_PULL_INTERVAL_MS;
    process.env.NIBO_PULL_INTERVAL_MS = '1000';
    expect(niboPullIntervalMs()).toBe(30 * 60_000);
    process.env.NIBO_PULL_INTERVAL_MS = String(45 * 60_000);
    expect(niboPullIntervalMs()).toBe(45 * 60_000);
    if (prev === undefined) delete process.env.NIBO_PULL_INTERVAL_MS;
    else process.env.NIBO_PULL_INTERVAL_MS = prev;
  });

  it('isNiboMock trata ausência como true', () => {
    const prev = process.env.NIBO_MOCK;
    delete process.env.NIBO_MOCK;
    expect(isNiboMock()).toBe(true);
    process.env.NIBO_MOCK = 'false';
    expect(isNiboMock()).toBe(false);
    if (prev === undefined) delete process.env.NIBO_MOCK;
    else process.env.NIBO_MOCK = prev;
  });
});

describe('nibo-sync accountId e IDs', () => {
  it('readNiboAccountId', () => {
    expect(readNiboAccountId({ accountId: 'a1' })).toBe('a1');
    expect(readNiboAccountId({ niboAccountId: 'a2' })).toBe('a2');
    expect(readNiboAccountId({ accountIds: ['x', 'y'] })).toBe('x');
    expect(readNiboAccountId(undefined)).toBeNull();
  });

  it('readNiboIdList normaliza casing', () => {
    expect(readNiboIdList({ receivableCategoryIds: ['Ab', 'ab'] }, 'receivableCategoryIds')).toEqual(['ab']);
  });
});
