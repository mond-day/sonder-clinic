export type DefaultDocumentTemplate = {
  type: string;
  name: string;
  title: string;
  body: string;
  footer: string;
  signature: string;
};

/** Variáveis preenchidas pelo servidor; não exigem conteúdo clínico do cliente. */
export const DEFAULT_TEMPLATE_ALLOWED_VARIABLES = ['identity.patientName', 'identity.professionalName'] as const;

/** Tipos gravados com grafias legadas/em português que contam como o mesmo tipo do padrão. */
const TYPE_ALIASES: Record<string, readonly string[]> = {
  ATTESTATION: ['ATTESTATION', 'CERTIFICATE', 'ATESTADO'],
  PRESCRIPTION: ['PRESCRIPTION', 'RECEITA', 'RECEITUARIO'],
  EXAM_REQUEST: ['EXAM_REQUEST', 'EXAME', 'SOLICITACAO_EXAME'],
  REFERRAL: ['REFERRAL', 'ENCAMINHAMENTO'],
  CONSENT: ['CONSENT', 'CONSENTIMENTO'],
  DECLARATION: ['DECLARATION', 'DECLARACAO', 'DECLARAÇÃO'],
};

/** Padrões que faltam: ignora tipos em que a clínica já tem modelo próprio (de qualquer status). */
export function missingDefaultTemplates(
  existing: ReadonlyArray<{ type: string; name: string }>,
): DefaultDocumentTemplate[] {
  const types = new Set(existing.map((row) => row.type.trim().toUpperCase()));
  const names = new Set(existing.map((row) => row.name));
  return DEFAULT_DOCUMENT_TEMPLATES.filter((row) => (
    !names.has(row.name)
    && !(TYPE_ALIASES[row.type] ?? [row.type]).some((alias) => types.has(alias))
  ));
}

const SIGNATURE = '{{identity.professionalName}} — {{identity.professionalCro}}';
const FOOTER = 'Documento eletrônico. Valide a autenticidade pelo QR Code.';

/** Modelos padrão criados (e publicados) para toda organização. A clínica pode duplicá-los e personalizar. */
export const DEFAULT_DOCUMENT_TEMPLATES: readonly DefaultDocumentTemplate[] = [
  {
    type: 'ATTESTATION',
    name: 'Atestado odontológico',
    title: 'Atestado',
    body: 'Atesto, para os devidos fins, que {{identity.patientName}} esteve sob cuidados odontológicos nesta data.',
    footer: FOOTER,
    signature: SIGNATURE,
  },
  {
    type: 'PRESCRIPTION',
    name: 'Receituário',
    title: 'Receituário',
    body: 'Prescrição para {{identity.patientName}}.',
    footer: FOOTER,
    signature: SIGNATURE,
  },
  {
    type: 'EXAM_REQUEST',
    name: 'Solicitação de exames',
    title: 'Solicitação de exames',
    body: 'Solicito a realização dos exames abaixo para {{identity.patientName}}.',
    footer: FOOTER,
    signature: SIGNATURE,
  },
  {
    type: 'REFERRAL',
    name: 'Encaminhamento',
    title: 'Encaminhamento',
    body: 'Encaminho {{identity.patientName}} para avaliação e conduta.',
    footer: FOOTER,
    signature: SIGNATURE,
  },
  {
    type: 'CONSENT',
    name: 'Termo de consentimento',
    title: 'Termo de consentimento',
    body: 'Eu, {{identity.patientName}}, declaro ter sido informado(a) sobre o procedimento proposto, seus riscos e alternativas, e autorizo sua realização.',
    footer: FOOTER,
    signature: SIGNATURE,
  },
  {
    type: 'DECLARATION',
    name: 'Declaração de comparecimento',
    title: 'Declaração de comparecimento',
    body: 'Declaro que {{identity.patientName}} compareceu à clínica para atendimento odontológico.',
    footer: FOOTER,
    signature: SIGNATURE,
  },
];
