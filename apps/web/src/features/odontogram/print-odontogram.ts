import { escapePrintHtml, printHtmlDocument } from '../../lib/print-document';
import {
  buildPrintDocument,
  printStatusBadge,
  type PrintBranding,
  type PrintIdentityItem,
  type PrintStatusTone,
} from '../../lib/print/print-layout';
import {
  ARCH_BY_TYPE,
  FACES,
  dentitionLabel,
  faceShortLabel,
  normalizeFaceKey,
  parseDentitionType,
  type DentitionType,
  type FaceKey,
} from './odontogram-anatomy';

export type OdontogramPrintFinding = {
  toothFdi: string;
  face?: string | null;
  status?: string | null;
  notes?: string | null;
  conditionName?: string | null;
};

type PrintInput = {
  patientName?: string;
  clinicName?: string;
  branding?: PrintBranding;
  professionalName?: string;
  professionalCro?: string;
  dentitionType?: string;
  updatedAtLabel?: string;
  versionLabel?: string;
  findings: OdontogramPrintFinding[];
  printedAt?: Date;
};

const STATUS_FILL: Record<string, string> = {
  EXISTING: '#368764',
  PLANNED: '#159a96',
  IN_PROGRESS: '#b6771e',
  COMPLETED: '#153d46',
};

const STATUS_TONE: Record<string, PrintStatusTone> = {
  EXISTING: 'green',
  PLANNED: 'teal',
  IN_PROGRESS: 'amber',
  COMPLETED: 'teal',
};

const EXTRA_CSS = `
.identity{margin-bottom:12px}
.odontogram-board{
  border-top:1.5px solid var(--nav);
  border-bottom:1px solid var(--line);
  padding:10px 0 11px;
}
.arch-label{
  text-align:center;color:var(--muted);font-size:7pt;font-weight:800;
  text-transform:uppercase;letter-spacing:.1em;margin:2px 0 5px
}
.arch{
  display:grid;gap:3px;align-items:end
}
.arch + .arch-label{margin-top:7px}
.tooth{text-align:center;min-width:0;break-inside:avoid}
.tooth-number{font-size:6.8pt;font-weight:800;color:#536d73;margin-bottom:1px}
.tooth svg{width:100%;max-width:38px;height:auto;display:block;margin:0 auto}
.legend{
  display:flex;flex-wrap:wrap;align-items:center;gap:12px;
  margin:9px 0 14px;color:#516a70;font-size:7.5pt
}
.legend-item{display:flex;align-items:center;gap:5px}
.dot{width:9px;height:9px;border-radius:2px;border:1px solid rgba(0,0,0,.08);display:inline-block}
.findings-grid{
  display:grid;grid-template-columns:1.15fr .85fr;gap:22px;align-items:start
}
.findings-table{width:100%;border-collapse:collapse}
.findings-table th{
  padding:6px 5px;border-bottom:1px solid var(--line);text-align:left;
  color:var(--muted);font-size:6.8pt;text-transform:uppercase;letter-spacing:.07em
}
.findings-table td{padding:6px 5px;border-bottom:1px solid var(--line-soft);font-size:8pt;vertical-align:top;overflow-wrap:anywhere}
.face-key{
  display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-top:8px
}
.face-key div{padding:6px 5px;border:1px solid var(--line);text-align:center;font-size:7pt}
.face-key strong{display:block;color:var(--nav-deep);font-size:8pt}
.signature-grid{margin-top:18px}
.doc-footer{margin-top:14px}
@media(max-width:900px){.findings-grid{grid-template-columns:1fr}}
`;

function statusKey(status?: string | null) {
  return String(status ?? '').toUpperCase();
}

function fillForStatus(status?: string | null) {
  return STATUS_FILL[statusKey(status)] ?? '#ffffff';
}

function findingsByToothFace(findings: OdontogramPrintFinding[]) {
  const map = new Map<string, OdontogramPrintFinding>();
  for (const finding of findings) {
    const face = normalizeFaceKey(finding.face);
    map.set(`${finding.toothFdi}:${face}`, finding);
    if (!face || face === 'V') map.set(`${finding.toothFdi}:`, finding);
  }
  return map;
}

function toothSvg(tooth: number, map: Map<string, OdontogramPrintFinding>) {
  const fill = (face: FaceKey | '') => {
    const finding = map.get(`${tooth}:${face}`)
      ?? (face === 'V' ? map.get(`${tooth}:`) : undefined);
    return fillForStatus(finding?.status);
  };
  return `<svg viewBox="0 0 50 50" aria-label="Dente ${tooth}">
      <polygon points="4,4 46,4 36,14 14,14" fill="${fill('V')}" stroke="#9fb1b5" stroke-width="1"/>
      <polygon points="4,46 46,46 36,36 14,36" fill="${fill('L')}" stroke="#9fb1b5" stroke-width="1"/>
      <polygon points="4,4 14,14 14,36 4,46" fill="${fill('M')}" stroke="#9fb1b5" stroke-width="1"/>
      <polygon points="46,4 36,14 36,36 46,46" fill="${fill('D')}" stroke="#9fb1b5" stroke-width="1"/>
      <rect x="14" y="14" width="22" height="22" rx="3" fill="${fill('O')}" stroke="#9fb1b5" stroke-width="1"/>
    </svg>`;
}

function renderArch(teeth: number[], label: string, map: Map<string, OdontogramPrintFinding>) {
  return `
    <div class="arch-label">${escapePrintHtml(label)}</div>
    <div class="arch" style="grid-template-columns:repeat(${teeth.length},minmax(0,1fr))">
      ${teeth.map((tooth) => `
        <div class="tooth">
          <div class="tooth-number">${tooth}</div>
          ${toothSvg(tooth, map)}
        </div>
      `).join('')}
    </div>`;
}

function groupedFindingRows(findings: OdontogramPrintFinding[]) {
  const groups = new Map<string, {
    tooth: string;
    faces: string[];
    condition: string;
    status: string;
    notes: string[];
  }>();
  for (const finding of findings) {
    const tooth = String(finding.toothFdi || '—');
    const condition = finding.conditionName?.trim() || 'Condição';
    const status = statusKey(finding.status) || 'EXISTING';
    const key = `${tooth}|${condition}|${status}`;
    const current = groups.get(key) ?? { tooth, faces: [], condition, status, notes: [] };
    const face = faceShortLabel(finding.face);
    if (face && face !== '—' && !current.faces.includes(face)) current.faces.push(face);
    if (finding.notes?.trim()) current.notes.push(finding.notes.trim());
    groups.set(key, current);
  }
  return [...groups.values()];
}

function identityItems(input: PrintInput): PrintIdentityItem[] {
  const items: PrintIdentityItem[] = [];
  if (input.patientName) items.push({ label: 'Paciente', value: input.patientName });
  if (input.professionalName) items.push({ label: 'Profissional', value: input.professionalName });
  if (input.updatedAtLabel) items.push({ label: 'Atualizado em', value: input.updatedAtLabel });
  if (input.versionLabel) items.push({ label: 'Versão', value: input.versionLabel });
  return items;
}

export function buildOdontogramPrintHtml(input: PrintInput): string {
  const dentition: DentitionType = parseDentitionType(input.dentitionType);
  const arches = ARCH_BY_TYPE[dentition];
  const map = findingsByToothFace(input.findings);
  const rows = groupedFindingRows(input.findings);
  const branding: PrintBranding = {
    ...input.branding,
    clinicName: input.branding?.clinicName || input.clinicName,
  };
  const clinicName = branding.clinicName?.trim() || 'Clínica';
  const professionalLine = input.professionalCro
    ? `${input.professionalName ?? ''} · ${input.professionalCro}`.replace(/^ · /, '')
    : input.professionalName;

  const findingsTable = rows.length
    ? rows.map((row) => `<tr>
        <td>${escapePrintHtml(row.tooth)}</td>
        <td>${escapePrintHtml(row.faces.join(', ') || '—')}</td>
        <td>${escapePrintHtml(row.condition)}</td>
        <td>${printStatusBadge(
          row.status === 'EXISTING' ? 'Existente'
            : row.status === 'PLANNED' ? 'Planejado'
            : row.status === 'IN_PROGRESS' ? 'Em andamento'
            : row.status === 'COMPLETED' ? 'Concluído'
            : row.status,
          STATUS_TONE[row.status] ?? 'teal',
        )}</td>
        <td>${escapePrintHtml(row.notes.join(' ') || '—')}</td>
      </tr>`).join('')
    : '<tr><td colspan="5">Nenhum achado registrado nesta versão.</td></tr>';

  const body = `
  <section class="odontogram-board">
    ${renderArch(arches.upper, 'Arcada superior', map)}
    ${renderArch(arches.lower, 'Arcada inferior', map)}
  </section>
  <div class="legend" aria-label="Legenda">
    <strong>Legenda:</strong>
    <span class="legend-item"><i class="dot" style="background:#368764"></i> Existente</span>
    <span class="legend-item"><i class="dot" style="background:#159a96"></i> Planejado</span>
    <span class="legend-item"><i class="dot" style="background:#b6771e"></i> Em andamento</span>
    <span class="legend-item"><i class="dot" style="background:#153d46"></i> Concluído</span>
  </div>
  <div class="findings-grid">
    <section class="section">
      <h2 class="section-title">Achados registrados</h2>
      <table class="findings-table">
        <thead><tr><th>Dente</th><th>Face</th><th>Condição</th><th>Situação</th><th>Observação</th></tr></thead>
        <tbody>${findingsTable}</tbody>
      </table>
    </section>
    <section class="section">
      <h2 class="section-title">Leitura das faces</h2>
      <div class="face-key">
        ${FACES.map((face) => `<div><strong>${escapePrintHtml(face.short)}</strong>${escapePrintHtml(face.label)}</div>`).join('')}
      </div>
    </section>
  </div>`;

  return buildPrintDocument({
    documentTitle: 'Odontograma',
    eyebrow: 'Registro clínico',
    heading: 'Odontograma',
    subtitle: `Dentição ${dentitionLabel(dentition).toLowerCase()} · situação atual`,
    branding,
    identity: identityItems(input),
    body,
    footerLeft: `${clinicName} · Odontograma integrante do prontuário`,
    signatures: [
      { name: input.patientName, caption: 'Paciente / responsável' },
      { name: professionalLine, caption: 'Cirurgião-dentista' },
    ],
    printedAt: input.printedAt,
    orientation: 'landscape',
    extraCss: EXTRA_CSS,
  });
}

export function printOdontogramDocument(html: string) {
  return printHtmlDocument(html, 'Impressão do odontograma');
}
