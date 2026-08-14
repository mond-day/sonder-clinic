import { describe, expect, it } from 'vitest';
import { formatDentalCidLine, resolveDentalCid } from './dental-cid';

describe('dental-cid', () => {
  it('resolve código do catálogo com descrição', () => {
    expect(resolveDentalCid('K04.7')).toEqual({
      code: 'K04.7',
      description: 'Abscesso periapical sem fístula',
    });
  });

  it('formata linha do atestado com código e descrição', () => {
    expect(formatDentalCidLine('K04.7')).toBe('CID-10 K04.7 — Abscesso periapical sem fístula.');
  });
});
