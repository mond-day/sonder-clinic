import { describe, expect, it } from 'vitest';
import { createRepeatGate, isDebugLogEnabled } from './log';

describe('createRepeatGate', () => {
  it('libera a primeira ocorrência e bloqueia repetições iguais dentro da janela', () => {
    const gate = createRepeatGate(60_000);
    expect(gate('nibo', 'a', 0)).toBe(true);
    expect(gate('nibo', 'a', 5_000)).toBe(false);
    expect(gate('nibo', 'a', 59_999)).toBe(false);
  });

  it('libera quando a assinatura muda', () => {
    const gate = createRepeatGate(60_000);
    gate('nibo', 'a', 0);
    expect(gate('nibo', 'b', 1_000)).toBe(true);
    expect(gate('nibo', 'b', 2_000)).toBe(false);
  });

  it('emite resumo periódico mesmo sem mudança', () => {
    const gate = createRepeatGate(60_000);
    gate('nibo', 'a', 0);
    expect(gate('nibo', 'a', 60_000)).toBe(true);
    expect(gate('nibo', 'a', 61_000)).toBe(false);
  });

  it('isola chaves diferentes', () => {
    const gate = createRepeatGate(60_000);
    gate('conn-1', 'a', 0);
    expect(gate('conn-2', 'a', 1_000)).toBe(true);
  });
});

describe('isDebugLogEnabled', () => {
  it('só liga em debug/verbose/trace', () => {
    expect(isDebugLogEnabled('debug')).toBe(true);
    expect(isDebugLogEnabled('VERBOSE')).toBe(true);
    expect(isDebugLogEnabled('info')).toBe(false);
    expect(isDebugLogEnabled(undefined)).toBe(false);
  });
});
