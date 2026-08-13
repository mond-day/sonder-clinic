import { escapePrintHtml, printHtmlDocument } from '../../lib/print-document';
import {
  buildPrintDocument,
  printStatusBadge,
  type PrintBranding,
  type PrintIdentityItem,
  type PrintStatusTone,
} from '../../lib/print/print-layout';
import { isGroupVisible, type ConditionGroup } from './conditions';
import {
  formatAnamnesisAnswer,
  isEmptyAnamnesisAnswer,
  type AnamnesisSchema,
  type AnamnesisSection,
} from './format-answer';

type PrintAlert = {
  message?: string;
};

type PrintInput = {
  title: string;
  templateSubtitle?: string;
  patientName?: string;
  birthDateLabel?: string;
  professionalName?: string;
  professionalCro?: string;
  documentDateLabel?: string;
  clinicName?: string;
  branding?: PrintBranding;
  statusLabel?: string;
  statusTone?: PrintStatusTone;
  riskLabel?: string;
  riskTone?: PrintStatusTone;
  alerts?: PrintAlert[];
  patientSignatureName?: string;
  professionalSignatureName?: string;
  schema: AnamnesisSchema | null | undefined;
  answers: Record<string, unknown>;
  printedAt?: Date;
};

const EXTRA_CSS = `
.questions{border-top:1px solid var(--line)}
.qa{
  display:grid;grid-template-columns:minmax(170px,.8fr) minmax(0,1.5fr);
  gap:16px;padding:8px 0;border-bottom:1px solid var(--line-soft);
  break-inside:avoid
}
.qa .q{font-size:9pt;color:#526a70;font-weight:680}
.qa .a{font-size:10pt;color:var(--ink);overflow-wrap:anywhere}
.risk-band{
  display:flex;justify-content:space-between;align-items:center;gap:16px;
  padding:9px 11px;background:var(--surface);border:1px solid var(--line);
  margin-bottom:16px;break-inside:avoid
}
.risk-band strong{font-size:10pt}
@media(max-width:700px){.qa{grid-template-columns:1fr}}
`;

function identityItems(input: PrintInput): PrintIdentityItem[] {
  const items: PrintIdentityItem[] = [];
  if (input.patientName) items.push({ label: 'Paciente', value: input.patientName });
  if (input.birthDateLabel) items.push({ label: 'Nascimento', value: input.birthDateLabel });
  if (input.professionalName) items.push({ label: 'Profissional', value: input.professionalName });
  if (input.documentDateLabel) items.push({ label: 'Data', value: input.documentDateLabel });
  return items;
}

/** Monta HTML de impressão omitindo perguntas sem resposta. */
export function buildAnamnesisPrintHtml(input: PrintInput): string {
  const sections: Array<{ title: string; rows: Array<{ label: string; answer: string }> }> = [];

  for (const section of input.schema?.sections ?? []) {
    if (!isGroupVisible(input.answers, section.visibleWhen as ConditionGroup | null | undefined)) continue;
    const title = section.title || section.name || 'Seção';
    const rows: Array<{ label: string; answer: string }> = [];
    for (const question of (section as AnamnesisSection).questions ?? []) {
      if (!isGroupVisible(input.answers, question.visibleWhen)) continue;
      const raw = input.answers[question.code];
      if (isEmptyAnamnesisAnswer(raw)) continue;
      rows.push({
        label: question.label,
        answer: formatAnamnesisAnswer(question, raw),
      });
    }
    if (rows.length) sections.push({ title, rows });
  }

  const sectionsHtml = sections.length
    ? sections.map((section) => `
        <section class="section">
          <h2 class="section-title">${escapePrintHtml(section.title)}</h2>
          <div class="questions">
            ${section.rows.map((row) => `
              <div class="qa">
                <div class="q">${escapePrintHtml(row.label)}</div>
                <div class="a">${escapePrintHtml(row.answer).replaceAll('\n', '<br />')}</div>
              </div>
            `).join('')}
          </div>
        </section>
      `).join('')
    : '<p class="empty">Nenhuma resposta preenchida.</p>';

  const alerts = (input.alerts ?? [])
    .map((item) => item.message?.trim())
    .filter((message): message is string => Boolean(message));
  const alertsHtml = alerts.length
    ? alerts.map((message) => `<div class="callout"><strong>Alerta clínico:</strong> ${escapePrintHtml(message)}</div>`).join('')
    : '';

  const riskBand = (input.statusLabel || input.riskLabel)
    ? `<div class="risk-band">
        <div>
          <span class="label">Situação da anamnese</span>
          <strong>${escapePrintHtml(input.statusLabel || '—')}</strong>
        </div>
        ${input.riskLabel ? printStatusBadge(input.riskLabel, input.riskTone ?? 'teal') : ''}
      </div>`
    : '';

  const branding: PrintBranding = {
    ...input.branding,
    clinicName: input.branding?.clinicName || input.clinicName,
  };
  const clinicName = branding.clinicName?.trim() || 'Clínica';
  const professionalLine = input.professionalCro
    ? `${input.professionalName ?? ''} · ${input.professionalCro}`.replace(/^ · /, '')
    : input.professionalName;

  return buildPrintDocument({
    documentTitle: input.title,
    eyebrow: 'Documento clínico',
    heading: 'Anamnese',
    subtitle: input.templateSubtitle || input.title,
    branding,
    identity: identityItems(input),
    body: `${riskBand}${sectionsHtml}${alertsHtml}`,
    footerLeft: `${clinicName} · Documento integrante do prontuário odontológico`,
    signatures: [
      { name: input.patientSignatureName || input.patientName, caption: 'Paciente / responsável' },
      { name: professionalLine, caption: 'Cirurgião-dentista' },
    ],
    printedAt: input.printedAt,
    orientation: 'portrait',
    extraCss: EXTRA_CSS,
  });
}

export function printAnamnesisDocument(html: string) {
  return printHtmlDocument(html, 'Impressão da anamnese');
}
