import { escapePrintHtml, printHtmlDocument } from '../../lib/print-document';
import {
  buildPrintDocument,
  printStatusBadge,
  type PrintBranding,
  type PrintIdentityItem,
  type PrintStatusTone,
} from '../../lib/print/print-layout';

export type TreatmentPrintItem = {
  name: string;
  tooth?: string | null;
  face?: string | null;
  quantity?: number;
  sessions?: string;
  unitPrice?: string;
  total: string;
  status: string;
  statusTone?: PrintStatusTone;
  urgent?: boolean;
};

type PrintInput = {
  title: string;
  patientName?: string;
  clinicName?: string;
  branding?: PrintBranding;
  professionalName?: string;
  professionalCro?: string;
  statusLabel?: string;
  statusTone?: PrintStatusTone;
  versionLabel?: string;
  createdAtLabel?: string;
  validUntilLabel?: string;
  notes?: string | null;
  items: TreatmentPrintItem[];
  subtotal: string;
  discount: string;
  total: string;
  printedAt?: Date;
};

const EXTRA_CSS = `
.plan-hero{
  display:grid;grid-template-columns:1fr auto;gap:18px;align-items:start;
  margin:2px 0 15px
}
.plan-hero h2{margin:0;font-size:15pt;letter-spacing:-.02em;color:var(--nav-deep);overflow-wrap:anywhere}
.table-wrap{border-top:1.5px solid var(--nav);border-bottom:1px solid var(--line)}
table{width:100%;border-collapse:collapse}
th{
  padding:7px 6px;text-align:left;color:var(--muted);font-size:7pt;
  text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid var(--line);
  font-weight:800
}
td{padding:9px 6px;border-bottom:1px solid var(--line-soft);vertical-align:top;font-size:9.5pt;overflow-wrap:anywhere}
tbody tr:last-child td{border-bottom:0}
.proc strong{display:block;font-size:9.5pt}
.proc small{display:block;color:var(--muted);font-size:7.5pt;margin-top:2px}
.num{text-align:right;white-space:nowrap}
.center{text-align:center;white-space:nowrap}
.priority{font-size:7pt;font-weight:800;color:var(--danger)}
.summary{
  margin-top:14px;display:grid;grid-template-columns:1fr 240px;gap:22px;align-items:start
}
.notes{
  min-height:70px;padding:10px 0;border-top:1px solid var(--line);
  color:#415b61;break-inside:avoid;overflow-wrap:anywhere
}
.totals{border-top:1.5px solid var(--nav);padding-top:7px}
.totals-row{display:flex;justify-content:space-between;gap:16px;padding:3px 0;font-size:9pt}
.totals-row.total{margin-top:4px;padding-top:7px;border-top:1px solid var(--line);font-size:13pt;font-weight:800;color:var(--nav-deep)}
.acceptance{
  margin-top:19px;padding:10px 12px;background:#fbfcfc;border:1px solid var(--line);
  font-size:8.5pt;color:#476168;break-inside:avoid
}
@media(max-width:700px){.summary{grid-template-columns:1fr}}
`;

function identityItems(input: PrintInput): PrintIdentityItem[] {
  const items: PrintIdentityItem[] = [];
  if (input.patientName) items.push({ label: 'Paciente', value: input.patientName });
  if (input.professionalName) items.push({ label: 'Profissional', value: input.professionalName });
  if (input.createdAtLabel) items.push({ label: 'Criado em', value: input.createdAtLabel });
  if (input.validUntilLabel) items.push({ label: 'Validade', value: input.validUntilLabel });
  return items;
}

export function buildTreatmentPrintHtml(input: PrintInput): string {
  const rows = input.items.map((item) => {
    const location = [item.tooth, item.face].filter(Boolean).join(' · ') || '—';
    return `<tr>
      <td class="proc">
        <strong>${escapePrintHtml(item.name)}</strong>
        ${item.urgent ? '<small class="priority">Urgente</small>' : ''}
      </td>
      <td>${escapePrintHtml(location)}</td>
      <td class="center">${escapePrintHtml(item.sessions ?? '—')}</td>
      <td class="center">${printStatusBadge(item.status, item.statusTone ?? 'amber')}</td>
      <td class="num">${escapePrintHtml(item.total)}</td>
    </tr>`;
  }).join('');

  const notes = input.notes?.trim()
    ? `<div class="notes">
        <span class="label">Observações</span>
        ${escapePrintHtml(input.notes.trim()).replaceAll('\n', '<br />')}
      </div>`
    : `<div class="notes"><span class="label">Observações</span></div>`;

  const branding: PrintBranding = {
    ...input.branding,
    clinicName: input.branding?.clinicName || input.clinicName,
  };
  const clinicName = branding.clinicName?.trim() || 'Clínica';
  const professionalLine = input.professionalCro
    ? `${input.professionalName ?? ''} · ${input.professionalCro}`.replace(/^ · /, '')
    : input.professionalName;

  const body = `
  <div class="plan-hero">
    <div>
      <span class="label">Plano</span>
      <h2>${escapePrintHtml(input.title)}</h2>
    </div>
    ${input.statusLabel ? printStatusBadge(input.statusLabel, input.statusTone ?? 'teal') : ''}
  </div>
  <section class="section">
    <h2 class="section-title">Procedimentos</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Procedimento</th>
            <th>Dente / face</th>
            <th class="center">Sessões</th>
            <th class="center">Situação</th>
            <th class="num">Valor</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="5">Nenhum procedimento neste plano.</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="summary">
      ${notes}
      <div class="totals">
        <div class="totals-row"><span>Subtotal</span><strong>${escapePrintHtml(input.subtotal)}</strong></div>
        <div class="totals-row"><span>Desconto</span><strong>${escapePrintHtml(input.discount)}</strong></div>
        <div class="totals-row total"><span>Total</span><strong>${escapePrintHtml(input.total)}</strong></div>
      </div>
    </div>
  </section>
  <div class="acceptance">
    <strong>Ciência do plano:</strong> os procedimentos, valores e etapas acima representam o planejamento atual e podem ser ajustados conforme evolução clínica, exames complementares ou necessidade identificada durante o tratamento.
  </div>`;

  return buildPrintDocument({
    documentTitle: input.title,
    eyebrow: 'Planejamento clínico',
    heading: 'Plano de Tratamento',
    subtitle: input.versionLabel,
    branding,
    identity: identityItems(input),
    body,
    footerLeft: `${clinicName} · Plano de tratamento`,
    signatures: [
      { name: input.patientName, caption: 'Paciente / responsável' },
      { name: professionalLine, caption: 'Cirurgião-dentista' },
    ],
    printedAt: input.printedAt,
    orientation: 'portrait',
    extraCss: EXTRA_CSS,
  });
}

export function printTreatmentDocument(html: string) {
  return printHtmlDocument(html, 'Impressão do plano de tratamento');
}
