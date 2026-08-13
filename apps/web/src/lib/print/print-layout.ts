import { escapePrintHtml, formatPrintTimestamp } from './print-document';
import { sharedPrintCss } from './print-theme';

export type PrintBranding = {
  clinicName?: string;
  subtitle?: string;
  logoUrl?: string;
  primaryColor?: string;
};

export type PrintIdentityItem = {
  label: string;
  value: string;
};

export type PrintStatusTone = 'green' | 'amber' | 'red' | 'teal';

export type PrintSignature = {
  name?: string;
  caption: string;
};

export type PrintDocumentInput = {
  documentTitle: string;
  eyebrow: string;
  heading: string;
  subtitle?: string;
  branding?: PrintBranding;
  identity: PrintIdentityItem[];
  body: string;
  footerLeft: string;
  signatures?: PrintSignature[];
  printedAt?: Date;
  orientation?: 'portrait' | 'landscape';
  extraCss?: string;
};

function clinicInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'S';
}

export function formatPrintCro(professional?: {
  croNumber?: string | null;
  croState?: string | null;
} | null) {
  const number = professional?.croNumber?.trim();
  if (!number) return undefined;
  const state = professional?.croState?.trim();
  return state ? `CRO/${state} ${number}` : `CRO ${number}`;
}

export function formatPrintProfessionalLine(name?: string, cro?: string) {
  if (name && cro) return `${name} · ${cro}`;
  return name || cro || undefined;
}

export function printStatusBadge(label: string, tone: PrintStatusTone) {
  return `<span class="status ${tone}">${escapePrintHtml(label)}</span>`;
}

function brandMarkHtml(branding: PrintBranding) {
  if (branding.logoUrl) {
    return `<img class="brand-logo" src="${escapePrintHtml(branding.logoUrl)}" alt="" />`;
  }
  const mark = branding.clinicName ? clinicInitials(branding.clinicName) : 'S';
  return `<div class="brand-mark" aria-hidden="true">${escapePrintHtml(mark)}</div>`;
}

function identityHtml(items: PrintIdentityItem[]) {
  if (!items.length) return '';
  const columns = items.map((_, index) => (index === 0 ? 'minmax(0,2fr)' : 'minmax(0,1fr)')).join(' ');
  return `
  <section class="identity" style="grid-template-columns:${columns}" aria-label="Identificação">
    ${items.map((item) => `
      <div class="identity-item">
        <span class="label">${escapePrintHtml(item.label)}</span>
        <span class="value">${escapePrintHtml(item.value)}</span>
      </div>
    `).join('')}
  </section>`;
}

function signaturesHtml(signatures?: PrintSignature[]) {
  if (!signatures?.length) return '';
  return `
  <div class="signature-grid">
    ${signatures.map((item) => `
      <div class="signature">
        <strong>${escapePrintHtml(item.name?.trim() || ' ')}</strong>
        <span>${escapePrintHtml(item.caption)}</span>
      </div>
    `).join('')}
  </div>`;
}

export function buildPrintDocument(input: PrintDocumentInput): string {
  const printedAt = input.printedAt ?? new Date();
  const branding = input.branding ?? {};
  const clinicName = branding.clinicName?.trim();
  const orientation = input.orientation ?? 'portrait';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapePrintHtml(input.documentTitle)}</title>
  <style>
${sharedPrintCss(branding.primaryColor, orientation)}
${input.extraCss ?? ''}
  </style>
</head>
<body>
<main class="document">
  <header class="doc-header">
    <div class="brand">
      ${brandMarkHtml(branding)}
      <div class="brand-copy">
        <strong>${escapePrintHtml(clinicName || ' ')}</strong>
        ${branding.subtitle?.trim() ? `<span>${escapePrintHtml(branding.subtitle.trim())}</span>` : ''}
      </div>
    </div>
    <div class="doc-type">
      <div class="eyebrow">${escapePrintHtml(input.eyebrow)}</div>
      <h1>${escapePrintHtml(input.heading)}</h1>
      ${input.subtitle ? `<small>${escapePrintHtml(input.subtitle)}</small>` : ''}
    </div>
  </header>
  ${identityHtml(input.identity)}
  ${input.body}
  ${signaturesHtml(input.signatures)}
  <footer class="doc-footer">
    <span>${escapePrintHtml(input.footerLeft)}</span>
    <span>Emitido em ${escapePrintHtml(formatPrintTimestamp(printedAt))}</span>
  </footer>
</main>
</body>
</html>`;
}
