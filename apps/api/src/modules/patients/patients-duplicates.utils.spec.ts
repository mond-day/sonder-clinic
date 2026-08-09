import { describe, expect, it } from 'vitest';

function normalizeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function namesSimilar(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b) return true;
  const tokensA = new Set(a.split(' ').filter((t) => t.length > 1));
  const tokensB = new Set(b.split(' ').filter((t) => t.length > 1));
  if (!tokensA.size || !tokensB.size) return false;
  let overlap = 0;
  for (const token of tokensA) if (tokensB.has(token)) overlap += 1;
  const ratio = overlap / Math.max(tokensA.size, tokensB.size);
  return ratio >= 0.6 || a.includes(b) || b.includes(a);
}

describe('patient duplicate name helpers', () => {
  it('normaliza acentos e caixa', () => {
    expect(normalizeName('José da Silva')).toBe('jose da silva');
  });

  it('detecta nomes semelhantes', () => {
    expect(namesSimilar(normalizeName('Marina Costa'), normalizeName('Marina Costa Silva'))).toBe(true);
    expect(namesSimilar(normalizeName('Ana'), normalizeName('Bruno'))).toBe(false);
  });
});
