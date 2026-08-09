import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  advanceTaskOccurrence,
  normalizeTaskFrequency,
  taskOccurrenceKey,
} from './workspace-tasks.utils';
import {
  assertLabStatusTransition,
  LAB_TRANSITIONS,
} from './workspace-lab.utils';

describe('workspace-tasks.utils', () => {
  it('avança recorrência diária/semanal/mensal', () => {
    const base = new Date('2026-08-01T00:00:00.000Z');
    expect(advanceTaskOccurrence(base, 'DAILY', 1).toISOString().slice(0, 10)).toBe('2026-08-02');
    expect(advanceTaskOccurrence(base, 'WEEKLY', 2).toISOString().slice(0, 10)).toBe('2026-08-15');
    expect(advanceTaskOccurrence(base, 'MONTHLY', 1).toISOString().slice(0, 10)).toBe('2026-09-01');
  });

  it('normaliza frequência e rejeita inválida', () => {
    expect(normalizeTaskFrequency('daily')).toBe('DAILY');
    expect(() => normalizeTaskFrequency('YEARLY')).toThrow(BadRequestException);
  });

  it('gera chave idempotente de ocorrência', () => {
    expect(taskOccurrenceKey('abc', new Date('2026-08-07T12:00:00.000Z'))).toBe('abc:2026-08-07');
  });
});

describe('workspace-lab.utils', () => {
  it('permite transições válidas', () => {
    expect(() => assertLabStatusTransition('REQUESTED', 'IN_LAB')).not.toThrow();
    expect(() => assertLabStatusTransition('IN_LAB', 'RETURNED')).not.toThrow();
    expect(() => assertLabStatusTransition('RETURNED', 'INSTALLED')).not.toThrow();
    expect(() => assertLabStatusTransition('REQUESTED', 'CANCELLED', 'motivo ok')).not.toThrow();
  });

  it('bloqueia regressões impossíveis', () => {
    expect(() => assertLabStatusTransition('INSTALLED', 'IN_LAB')).toThrow(ConflictException);
    expect(() => assertLabStatusTransition('CANCELLED', 'REQUESTED')).toThrow(ConflictException);
    expect(LAB_TRANSITIONS.REQUESTED).toContain('IN_LAB');
  });

  it('exige motivo no cancelamento', () => {
    expect(() => assertLabStatusTransition('REQUESTED', 'CANCELLED', '')).toThrow(BadRequestException);
    expect(() => assertLabStatusTransition('REQUESTED', 'CANCELLED', 'motivo ok')).not.toThrow();
  });
});
