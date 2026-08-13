import { escapePrintHtml, formatPrintTimestamp, printHtmlDocument } from '../../lib/print-document';

export type TreatmentPrintItem = {
  name: string;
  tooth?: string | null;
  face?: string | null;
  quantity: number;
  sessions?: string;
  unitPrice: string;
  total: string;
  status: string;
};

type PrintInput = {
  title: string;
  patientName?: string;
  clinicName?: string;
  professionalName?: string;
  statusLabel?: string;
  notes?: string | null;
  items: TreatmentPrintItem[];
  subtotal: string;
  discount: string;
  total: string;
  printedAt?: Date;
};

export function buildTreatmentPrintHtml(input: PrintInput): string {
  const printedAt = input.printedAt ?? new Date();
  const metaItems = [
    input.patientName ? { label: 'Paciente', value: input.patientName } : null,
    input.clinicName ? { label: 'Clínica', value: input.clinicName } : null,
    input.professionalName ? { label: 'Profissional', value: input.professionalName } : null,
    input.statusLabel ? { label: 'Status', value: input.statusLabel } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  const rows = input.items.map((item) => {
    const location = [item.tooth, item.face].filter(Boolean).join(' · ') || '—';
    return `<tr>
      <td>
        <strong>${escapePrintHtml(item.name)}</strong>
        <span class="sub">${escapePrintHtml(item.status)}</span>
      </td>
      <td>${escapePrintHtml(location)}</td>
      <td class="num">${escapePrintHtml(String(item.quantity))}</td>
      <td class="num">${escapePrintHtml(item.sessions ?? '—')}</td>
      <td class="num">${escapePrintHtml(item.unitPrice)}</td>
      <td class="num">${escapePrintHtml(item.total)}</td>
    </tr>`;
  }).join('');

  const notes = input.notes?.trim()
    ? `<section class="notes">
        <h2>Observações</h2>
        <p>${escapePrintHtml(input.notes.trim()).replaceAll('\n', '<br />')}</p>
      </section>`
    : '';

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
      --surface: #f4faf9;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      font-family: "Manrope", "Segoe UI", ui-sans-serif, system-ui, sans-serif;
      font-size: 13px;
      line-height: 1.45;
      background: #fff;
    }
    .sheet { max-width: 820px; margin: 0 auto; padding: 28px 32px 36px; }
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
      background: #153d46; color: #f0fffd;
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
    h1 {
      margin: 0;
      font-family: "Source Serif 4", Georgia, serif;
      font-size: 24px;
      font-weight: 650;
      letter-spacing: -.02em;
    }
    .clinic { margin: 4px 0 0; color: var(--muted); font-size: 12px; font-weight: 600; }
    .meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px 14px;
      margin: 0 0 22px;
      padding: 14px 16px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 12px;
    }
    .meta span {
      display: block; color: var(--muted); font-size: 9px; font-weight: 700;
      letter-spacing: .05em; text-transform: uppercase;
    }
    .meta strong { display: block; margin-top: 4px; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; }
    th {
      text-align: left; font-size: 10px; letter-spacing: .04em; text-transform: uppercase;
      color: var(--muted); padding: 8px 10px; border-bottom: 1px solid var(--line);
    }
    td { padding: 10px; border-bottom: 1px solid #edf1f1; vertical-align: top; }
    td strong { display: block; font-size: 13px; }
    td .sub { display: block; margin-top: 2px; color: var(--muted); font-size: 11px; }
    .num { text-align: right; white-space: nowrap; }
    .totals {
      margin-top: 16px;
      margin-left: auto;
      width: min(280px, 100%);
      display: grid;
      gap: 6px;
    }
    .totals div { display: flex; justify-content: space-between; gap: 16px; font-size: 13px; }
    .totals .grand { padding-top: 8px; border-top: 2px solid var(--accent); font-weight: 750; font-size: 15px; }
    .notes { margin-top: 24px; page-break-inside: avoid; }
    .notes h2 {
      margin: 0 0 8px; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; color: var(--muted);
    }
    .notes p { margin: 0; white-space: pre-wrap; }
    .footer {
      margin-top: 28px; padding-top: 12px; border-top: 1px solid var(--line);
      color: var(--muted); font-size: 10px; display: flex; justify-content: space-between; gap: 12px;
    }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .sheet { max-width: none; padding: 0; }
      @page { margin: 16mm 14mm; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <header class="header">
      <div class="mark" aria-hidden="true">S</div>
      <div>
        <p class="kicker">Orçamento e plano de tratamento</p>
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
    <table>
      <thead>
        <tr>
          <th>Procedimento</th>
          <th>Dente / face</th>
          <th class="num">Qtd</th>
          <th class="num">Sessões</th>
          <th class="num">Unitário</th>
          <th class="num">Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="6">Nenhum procedimento neste plano.</td></tr>'}
      </tbody>
    </table>
    <div class="totals">
      <div><span>Subtotal</span><strong>${escapePrintHtml(input.subtotal)}</strong></div>
      <div><span>Desconto</span><strong>${escapePrintHtml(input.discount)}</strong></div>
      <div class="grand"><span>Total</span><strong>${escapePrintHtml(input.total)}</strong></div>
    </div>
    ${notes}
    <footer class="footer">
      <span>Sonder Clinic</span>
      <span>Impresso em ${escapePrintHtml(formatPrintTimestamp(printedAt))}</span>
    </footer>
  </div>
</body>
</html>`;
}

export function printTreatmentDocument(html: string) {
  return printHtmlDocument(html, 'Impressão do plano de tratamento');
}
