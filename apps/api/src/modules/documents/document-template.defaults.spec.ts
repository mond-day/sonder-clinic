import { describe, expect, it } from 'vitest';
import { validateDocumentTemplateStructure } from '../operations/operations-documents.utils';
import { DEFAULT_DOCUMENT_TEMPLATES, DEFAULT_TEMPLATE_ALLOWED_VARIABLES, missingDefaultTemplates } from './document-template.defaults';

describe('DEFAULT_DOCUMENT_TEMPLATES', () => {
  it('inclui atestado e todos passam na validação de publicação', () => {
    expect(DEFAULT_DOCUMENT_TEMPLATES.some((row) => row.type === 'ATTESTATION')).toBe(true);
    for (const row of DEFAULT_DOCUMENT_TEMPLATES) {
      const errors = validateDocumentTemplateStructure({
        name: row.name,
        type: row.type,
        structuredContent: { title: row.title, header: '', body: row.body, footer: row.footer, signature: row.signature },
        allowedVariables: [...DEFAULT_TEMPLATE_ALLOWED_VARIABLES],
        signatureRules: { requiredRoles: ['PROFESSIONAL'], minSignatures: 1 },
      });
      expect({ name: row.name, errors }).toEqual({ name: row.name, errors: [] });
    }
  });
});

describe('missingDefaultTemplates', () => {
  it('cria todos quando a clínica não tem modelo', () => {
    expect(missingDefaultTemplates([])).toHaveLength(DEFAULT_DOCUMENT_TEMPLATES.length);
  });

  it('não duplica tipo que a clínica já tem, mesmo com grafia legada ou arquivado', () => {
    const missing = missingDefaultTemplates([
      { type: 'ATESTADO', name: 'Meu atestado' },
      { type: 'Receita', name: 'Receita da clínica' },
      { type: 'CONSENTIMENTO', name: 'Termo próprio' },
    ]).map((row) => row.type);
    expect(missing).not.toContain('ATTESTATION');
    expect(missing).not.toContain('PRESCRIPTION');
    expect(missing).not.toContain('CONSENT');
    expect(missing).toContain('REFERRAL');
  });

  it('é idempotente depois de criados', () => {
    const created = DEFAULT_DOCUMENT_TEMPLATES.map((row) => ({ type: row.type, name: row.name }));
    expect(missingDefaultTemplates(created)).toEqual([]);
  });
});
