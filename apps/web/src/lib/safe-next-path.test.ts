import { describe, expect, it } from 'vitest';
import { safeNextPath } from './api';

describe('safeNextPath', () => {
  it('aceita path relativo seguro', () => {
    expect(safeNextPath('/agenda')).toBe('/agenda');
    expect(safeNextPath('/patients/1')).toBe('/patients/1');
  });

  it('bloqueia open redirect', () => {
    expect(safeNextPath('//evil.com')).toBe('/');
    expect(safeNextPath('https://evil.com')).toBe('/');
    expect(safeNextPath(null)).toBe('/');
  });
});
