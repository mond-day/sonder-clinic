import { escapePrintHtml } from './print-document';

export const PRINT_ACCENT_FALLBACK = '#159a96';

export function safePrintColor(value?: string, fallback = PRINT_ACCENT_FALLBACK) {
  return value && /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : fallback;
}

export function sharedPrintCss(primaryColor?: string, orientation: 'portrait' | 'landscape' = 'portrait') {
  const accent = safePrintColor(primaryColor);
  const page = orientation === 'landscape'
    ? 'size:A4 landscape;margin:10mm 11mm 11mm'
    : 'size:A4 portrait;margin:13mm 14mm 14mm';

  return `
:root{
  --nav:#153d46;
  --nav-deep:#102f36;
  --accent:${escapePrintHtml(accent)};
  --accent-dark:#117873;
  --accent-soft:#dcf4f1;
  --ink:#183139;
  --muted:#6a7d83;
  --line:#dce5e6;
  --line-soft:#edf2f2;
  --surface:#f7f9f9;
  --danger:#c7505c;
  --danger-soft:#fce8eb;
  --warning:#b6771e;
  --warning-soft:#fff0d7;
  --success:#368764;
  --success-soft:#e3f3ea;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff;color:var(--ink)}
body{
  font-family:"Manrope","Inter","Segoe UI",Arial,sans-serif;
  font-size:10.5pt;
  line-height:1.45;
  -webkit-print-color-adjust:exact;
  print-color-adjust:exact;
}
.document{width:100%}
.doc-header{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:18px;
  padding-bottom:12px;
  border-bottom:1.5px solid var(--nav);
}
.brand{display:flex;align-items:center;gap:11px;min-width:0}
.brand-mark{
  width:38px;height:38px;border-radius:10px;
  background:var(--nav);color:#f0fffd;
  display:grid;place-items:center;font-weight:800;font-size:16px;
  flex:0 0 auto;
}
.brand-logo{
  width:38px;height:38px;object-fit:contain;flex:0 0 auto;
}
.brand-copy strong{display:block;font-size:12.5pt;letter-spacing:-.02em}
.brand-copy span{display:block;margin-top:2px;color:var(--muted);font-size:8.5pt}
.doc-type{text-align:right}
.doc-type .eyebrow{
  color:var(--accent-dark);font-size:7.5pt;font-weight:800;
  letter-spacing:.12em;text-transform:uppercase
}
.doc-type h1{
  margin:2px 0 0;font-size:20pt;line-height:1.12;
  letter-spacing:-.035em;font-weight:760;color:var(--nav-deep)
}
.doc-type small{display:block;color:var(--muted);margin-top:4px}
.identity{
  display:grid;
  gap:0;
  margin:14px 0 18px;
  border-top:1px solid var(--line);
  border-bottom:1px solid var(--line);
}
.identity-item{padding:8px 12px;border-right:1px solid var(--line);min-width:0}
.identity-item:first-child{padding-left:0}
.identity-item:last-child{border-right:0;padding-right:0}
.label{
  display:block;color:var(--muted);font-size:7pt;font-weight:800;
  letter-spacing:.09em;text-transform:uppercase;margin-bottom:3px
}
.value{display:block;font-size:10.5pt;font-weight:680;overflow-wrap:anywhere}
.section{margin:0 0 18px;break-inside:avoid}
.section-title{
  display:flex;align-items:center;gap:9px;margin:0 0 9px;
  font-size:11pt;font-weight:780;color:var(--nav-deep)
}
.section-title:before{
  content:"";width:3px;height:17px;border-radius:99px;background:var(--accent)
}
.muted{color:var(--muted)}
.status{
  display:inline-flex;align-items:center;border-radius:999px;
  padding:3px 8px;font-size:7.5pt;font-weight:800;white-space:nowrap
}
.status.green{background:var(--success-soft);color:var(--success)}
.status.amber{background:var(--warning-soft);color:var(--warning)}
.status.red{background:var(--danger-soft);color:var(--danger)}
.status.teal{background:var(--accent-soft);color:var(--accent-dark)}
.callout{
  border-left:3px solid var(--accent);
  background:#f7fbfa;padding:9px 11px;margin:8px 0 0;
  color:#334f56;break-inside:avoid
}
.signature-grid{
  display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:34px;
  break-inside:avoid
}
.signature{padding-top:25px;border-top:1px solid #9badb1;text-align:center}
.signature strong{display:block;font-size:9.5pt}
.signature span{display:block;color:var(--muted);font-size:8pt;margin-top:2px}
.doc-footer{
  display:flex;justify-content:space-between;gap:16px;
  margin-top:24px;padding-top:8px;border-top:1px solid var(--line);
  color:var(--muted);font-size:7.5pt
}
.empty{margin:24px 0;color:var(--muted);text-align:center}
thead{display:table-header-group}
@media print{
  .document{margin:0}
  a{color:inherit;text-decoration:none}
}
@page{${page}}
@media(max-width:700px){.identity{grid-template-columns:1fr 1fr !important}}
`;
}
