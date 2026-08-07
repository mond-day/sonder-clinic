import { describe, expect, it } from 'vitest';
import {
  assertPlanTransition,
  canTransitionPlan,
  countValidSessions,
  derivePlanStatusFromItems,
  nextItemStatusAfterSession,
} from './operations-treatments.utils';

describe('operations-treatments.utils', () => {
  describe('state machine', () => {
    it('permite DRAFT → PRESENTED → APPROVED → IN_PROGRESS → COMPLETED', () => {
      expect(canTransitionPlan('DRAFT', 'PRESENTED')).toBe(true);
      expect(canTransitionPlan('PRESENTED', 'APPROVED')).toBe(true);
      expect(canTransitionPlan('APPROVED', 'IN_PROGRESS')).toBe(true);
      expect(canTransitionPlan('IN_PROGRESS', 'COMPLETED')).toBe(true);
    });

    it('bloqueia saltos inválidos', () => {
      expect(canTransitionPlan('DRAFT', 'COMPLETED')).toBe(false);
      expect(canTransitionPlan('COMPLETED', 'IN_PROGRESS')).toBe(false);
      expect(() => assertPlanTransition('CANCELLED', 'APPROVED')).toThrow(/inválida/);
    });

    it('permite cancelar a partir de estados ativos', () => {
      for (const from of ['DRAFT', 'PRESENTED', 'PARTIALLY_APPROVED', 'APPROVED', 'IN_PROGRESS'] as const) {
        expect(canTransitionPlan(from, 'CANCELLED')).toBe(true);
      }
    });
  });

  describe('session completion', () => {
    it('não conclui item quando plannedSessions > 1 e só há 1 sessão', () => {
      const result = nextItemStatusAfterSession({
        currentStatus: 'APPROVED',
        plannedSessions: 3,
        validSessionCount: 1,
      });
      expect(result).toEqual({ status: 'IN_PROGRESS', completed: false });
    });

    it('conclui automaticamente ao atingir plannedSessions', () => {
      const result = nextItemStatusAfterSession({
        currentStatus: 'IN_PROGRESS',
        plannedSessions: 3,
        validSessionCount: 3,
      });
      expect(result).toEqual({ status: 'COMPLETED', completed: true });
    });

    it('ignora correções ao contar sessões válidas', () => {
      expect(countValidSessions([
        { correctionOfId: null },
        { correctionOfId: 'abc' },
        { correctionOfId: null },
      ])).toBe(2);
    });

    it('bloqueia sessão em item já concluído', () => {
      expect(() => nextItemStatusAfterSession({
        currentStatus: 'COMPLETED',
        plannedSessions: 2,
        validSessionCount: 3,
      })).toThrow(/não aceita/);
    });
  });

  describe('derivePlanStatusFromItems', () => {
    it('deriva APPROVED / PARTIALLY_APPROVED / IN_PROGRESS / COMPLETED', () => {
      expect(derivePlanStatusFromItems([
        { status: 'APPROVED' },
        { status: 'APPROVED' },
      ])).toBe('APPROVED');
      expect(derivePlanStatusFromItems([
        { status: 'APPROVED' },
        { status: 'PLANNED' },
      ])).toBe('PARTIALLY_APPROVED');
      expect(derivePlanStatusFromItems([
        { status: 'IN_PROGRESS' },
        { status: 'APPROVED' },
      ])).toBe('IN_PROGRESS');
      expect(derivePlanStatusFromItems([
        { status: 'COMPLETED' },
        { status: 'CANCELLED' },
      ])).toBe('COMPLETED');
    });
  });
});
