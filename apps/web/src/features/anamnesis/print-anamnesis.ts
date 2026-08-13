import { escapePrintHtml, formatPrintTimestamp, printHtmlDocument } from '../../lib/print-document';
import { isGroupVisible, type ConditionGroup } from './conditions';
import {
  formatAnamnesisAnswer,
  isEmptyAnamnesisAnswer,
  type AnamnesisSchema,
  type AnamnesisSection,
} from './format-answer';

type PrintInput = {
  title: string;
  patientName?: string;
  clinicName?: string;
  statusLabel?: string;
  riskLabel?: string;
  schema: AnamnesisSchema | null | undefined;
  answers: Record<string, unknown>;
  printedAt?: Date;
};

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

  const body = sections.length
    ? sections.map((section) => `
        <section class="section">
          <h2>${escapePrintHtml(section.title)}</h2>
          <dl>
            ${section.rows.map((row) => `
              <div class="row">
                <dt>${escapePrintHtml(row.label)}</dt>
                <dd>${escapePrintHtml(row.answer).replaceAll('\n', '<br />')}</dd>
              </div>
            `).join('')}
          </dl>
        </section>
      `).join('')
    : '<p class="empty">Nenhuma resposta preenchida.</p>';

  const metaItems = [
    input.patientName ? { label: 'Paciente', value: input.patientName } : null,
    input.clinicName ? { label: 'Clínica', value: input.clinicName } : null,
    input.statusLabel ? { label: 'Status', value: input.statusLabel } : null,
    input.riskLabel ? { label: 'Risco', value: input.riskLabel } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  const printedAt = input.printedAt ?? new Date();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapePrintHtml(input.title)}</title>
  <style>
    :root {
      --ink: #183139;
      --muted: #6a7d83;
      --line: #dce5e6;
      --accent: #159a96;
      --nav: #153d46;
      --surface: #f4faf9;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      font-family: "Manrope", "Segoe UI", ui-sans-serif, system-ui, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      background: #fff;
    }
    .sheet {
      max-width: 780px;
      margin: 0 auto;
      padding: 28px 32px 40px;
    }
    .header {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 14px;
      align-items: start;
      padding-bottom: 18px;
      border-bottom: 2px solid var(--accent);
      margin-bottom: 20px;
    }
    .mark {
      width: 42px; height: 42px; border-radius: 12px;
      background: var(--nav); color: #f0fffd;
      display: grid; place-items: center;
      font-size: 18px; font-weight: 800;
    }
    .kicker {
      margin: 0 0 4px;
      color: var(--accent);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .clinic {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
    }
    h1 {
      margin: 0;
      font-family: "Source Serif 4", Georgia, serif;
      font-size: 24px;
      font-weight: 650;
      letter-spacing: -.02em;
      line-height: 1.25;
    }
    .meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px 16px;
      margin: 0 0 22px;
      padding: 14px 16px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 12px;
    }
    .meta div { min-width: 0; }
    .meta span {
      display: block;
      color: var(--muted);
      font-size: 9px;
      font-weight: 700;
      letter-spacing: .05em;
      text-transform: uppercase;
    }
    .meta strong {
      display: block;
      margin-top: 4px;
      font-size: 13px;
      font-weight: 650;
      overflow-wrap: anywhere;
    }
    .section {
      margin: 0 0 18px;
      padding: 14px 16px 12px;
      border: 1px solid var(--line);
      border-radius: 12px;
      border-left: 3px solid var(--accent);
      page-break-inside: avoid;
    }
    .section h2 {
      margin: 0 0 12px;
      color: var(--ink);
      font-size: 12px;
      font-weight: 750;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    dl { margin: 0; display: grid; gap: 12px; }
    .row {
      display: grid;
      grid-template-columns: minmax(140px, .42fr) minmax(0, 1fr);
      gap: 10px 16px;
      padding: 0 0 10px;
      border-bottom: 1px solid #edf1f1;
    }
    .row:last-child { border-bottom: 0; padding-bottom: 0; }
    dt {
      margin: 0;
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
    }
    dd {
      margin: 0;
      font-size: 14px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .empty {
      margin: 24px 0;
      color: var(--muted);
      text-align: center;
    }
    .footer {
      margin-top: 28px;
      padding-top: 12px;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 10px;
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .sheet { max-width: none; padding: 0; }
      @page { margin: 16mm 14mm; }
    }
    @media (max-width: 640px) {
      .row { grid-template-columns: 1fr; gap: 4px; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <header class="header">
      <div class="mark" aria-hidden="true">S</div>
      <div>
        <p class="kicker">Anamnese clínica</p>
        <h1>${escapePrintHtml(input.title)}</h1>
        ${input.clinicName ? `<p class="clinic">${escapePrintHtml(input.clinicName)}</p>` : ''}
      </div>
    </header>
    ${metaItems.length ? `
      <div class="meta">
        ${metaItems.map((item) => `
          <div>
            <span>${escapePrintHtml(item.label)}</span>
            <strong>${escapePrintHtml(item.value)}</strong>
          </div>
        `).join('')}
      </div>
    ` : ''}
    ${body}
    <footer class="footer">
      <span>Sonder Clinic</span>
      <span>Impresso em ${escapePrintHtml(formatPrintTimestamp(printedAt))}</span>
    </footer>
  </div>
</body>
</html>`;
}

export function printAnamnesisDocument(html: string) {
  return printHtmlDocument(html, 'Impressão da anamnese');
}
