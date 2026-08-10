import { describe, expect, it } from 'vitest';
import { buildAnamnesisContentHash, canonicalizeAnswers, canonicalJson } from './anamnesis-hash';

describe('anamnesis-hash', () => {
  it('é estável independente da ordem das chaves', () => {
    const a = buildAnamnesisContentHash({
      answers: { b: 2, a: 1 },
      templateId: 't1',
      templateVersion: 2,
      patientId: 'p1',
      clinicId: 'c1',
    });
    const b = buildAnamnesisContentHash({
      answers: { a: 1, b: 2 },
      templateId: 't1',
      templateVersion: 2,
      patientId: 'p1',
      clinicId: 'c1',
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('muda quando clinicId/patientId/template mudam', () => {
    const base = {
      answers: { q1: 'yes' },
      templateId: 't1',
      templateVersion: 1,
      patientId: 'p1',
      clinicId: 'c1',
    };
    const h1 = buildAnamnesisContentHash(base);
    expect(buildAnamnesisContentHash({ ...base, clinicId: 'c2' })).not.toBe(h1);
    expect(buildAnamnesisContentHash({ ...base, patientId: 'p2' })).not.toBe(h1);
    expect(buildAnamnesisContentHash({ ...base, templateId: 't2' })).not.toBe(h1);
    expect(buildAnamnesisContentHash({ ...base, templateVersion: 2 })).not.toBe(h1);
    expect(buildAnamnesisContentHash({ ...base, answers: { q1: 'no' } })).not.toBe(h1);
  });

  it('canonicalizeAnswers ordena chaves aninhadas', () => {
    expect(canonicalJson(canonicalizeAnswers({ z: { b: 1, a: 2 }, a: true })))
      .toBe(canonicalJson({ a: true, z: { a: 2, b: 1 } }));
  });
});
