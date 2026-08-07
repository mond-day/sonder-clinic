import { describe, expect, it } from 'vitest';
import { updateProcedure, resolveProcedurePrice } from './operations-catalog.utils';

describe('operations-catalog.utils', () => {
  it('exports catalog helpers', () => {
    expect(typeof updateProcedure).toBe('function');
    expect(typeof resolveProcedurePrice).toBe('function');
  });
});
