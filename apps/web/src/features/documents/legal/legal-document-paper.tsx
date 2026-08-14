'use client';

import { API_URL } from '@/lib/api';
import { publicAppUrl } from '@/lib/public-url';
import { dateOnly, dateTime, formatBrazilianDateLong, formatCpf, formatCro, text } from '@/lib/format';

export type LegalSignatureView = {
  role: string;
  signerName?: string | null;
  method?: string | null;
  signedAt?: string | null;
  detail?: string | null;
  imageUrl?: string | null;
  cro?: string | null;
  cpf?: string | null;
};

export type LegalIdentityView = {
  clinicName?: string | null;
  clinicLegalName?: string | null;
  clinicTaxId?: string | null;
  clinicPhone?: string | null;
  clinicEmail?: string | null;
  clinicAddress?: string | null;
  clinicCro?: string | null;
  technicalResponsible?: string | null;
  professionalName?: string | null;
  professionalCro?: string | null;
  professionalSpecialty?: string | null;
  patientName?: string | null;
  patientCpf?: string | null;
  patientCpfMasked?: string | null;
  patientAddress?: string | null;
  issuedAt?: string | null;
  issuedPlace?: string | null;
};

export type LegalBodyItem = {
  title: string;
  details: Array<{ label: string; value: string }>;
};

const VALIDATION_PATH = '/validar/documento';

function signatureLabel(role: string, method?: string | null) {
  const normalized = role.toUpperCase();
  if (normalized.includes('PATIENT') || normalized.includes('PACIENTE')) {
    return 'Ciência / assinatura do paciente';
  }
  if (normalized.includes('GUARDIAN')) return 'Assinatura do responsável';
  if (method && ['A1', 'ICP', 'CERTIFICATE'].some((token) => method.toUpperCase().includes(token))) {
    return 'Assinatura do profissional';
  }
  return 'Assinatura do profissional';
}

function sealCopy(method?: string | null, signedAt?: string | null) {
  const value = String(method ?? '').toUpperCase();
  const when = signedAt ? dateTime(signedAt) : '';
  if (['A1', 'ICP', 'CERTIFICATE', 'ADVANCED'].some((token) => value.includes(token))) {
    return {
      title: 'ASSINADO DIGITALMENTE',
      detail: `Certificado digital ICP-Brasil${when ? ` · ${when}` : ''} · Valide pelo QR/código abaixo.`,
    };
  }
  if (value) {
    return {
      title: 'ASSINADO ELETRONICAMENTE',
      detail: `Assinatura registrada${when ? ` em ${when}` : ''} e vinculada a este documento.`,
    };
  }
  return null;
}

function clinicLines(identity: LegalIdentityView) {
  const legal = text(identity.clinicLegalName, '').trim();
  const trade = text(identity.clinicName, '').trim();
  const heading = (legal || trade || 'Clínica').toUpperCase();
  const lines: string[] = [];
  const tax = identity.clinicTaxId ? `CNPJ ${identity.clinicTaxId}` : '';
  const cro = identity.clinicCro ? formatCro(identity.clinicCro) : '';
  if (tax || cro) lines.push([tax, cro].filter(Boolean).join(' · '));
  if (identity.clinicAddress) lines.push(identity.clinicAddress);
  const contact = [identity.clinicPhone, identity.clinicEmail].filter(Boolean).join(' · ');
  if (contact) lines.push(contact);
  if (identity.technicalResponsible) lines.push(`Responsável técnico: ${identity.technicalResponsible}`);
  return { heading, lines };
}

export function LegalDocumentPaper({
  eyebrow = 'Documento odontológico',
  title,
  identity,
  identityRows,
  bodyText,
  bodyItems,
  placeLine,
  signatures,
  validationCode,
  footerNote,
  accentColor,
}: {
  eyebrow?: string;
  title: string;
  identity: LegalIdentityView;
  identityRows: Array<{ label: string; value: string }>;
  bodyText?: string;
  bodyItems?: LegalBodyItem[];
  placeLine?: string;
  signatures: LegalSignatureView[];
  validationCode?: string | null;
  footerNote?: string;
  accentColor?: string | null;
}) {
  const clinic = clinicLines(identity);
  const professionalName = text(identity.professionalName, '');
  const professionalCro = identity.professionalCro ? formatCro(identity.professionalCro) : '';
  const issued = identity.issuedAt ? dateOnly(identity.issuedAt) : '';
  const validationHref = validationCode
    ? publicAppUrl(`${VALIDATION_PATH}?codigo=${encodeURIComponent(validationCode)}`)
    : publicAppUrl(VALIDATION_PATH);
  const qrSrc = validationCode
    ? `${API_URL}/public/documents/${encodeURIComponent(validationCode)}/qr`
    : '';
  const accent = accentColor && /^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : '#176B5B';

  return (
    <article className="legal-document-paper" style={{ ['--legal-accent' as string]: accent }}>
      <header className="legal-letterhead">
        <div className="legal-clinic">
          <strong>{clinic.heading}</strong>
          {clinic.lines.map((line) => <span key={line}>{line}</span>)}
        </div>
        {professionalName ? (
          <div className="legal-professional">
            <strong>{professionalName}</strong>
            <span>Cirurgião-dentista</span>
            {professionalCro ? <span>{professionalCro}</span> : null}
            {identity.professionalSpecialty ? <span>{identity.professionalSpecialty}</span> : null}
          </div>
        ) : null}
      </header>

      <section className="legal-title">
        <small>{eyebrow}</small>
        <h1>{title}</h1>
      </section>

      <section className="legal-identity">
        {identityRows.map((row) => (
          <p key={`${row.label}-${row.value}`}>
            <strong>{row.label}:</strong> {row.value}
          </p>
        ))}
      </section>

      <section className="legal-body">
        {bodyItems?.map((item, index) => (
          <div className="legal-item" key={`${item.title}-${index}`}>
            <strong>{item.title}</strong>
            <div className="legal-details">
              {item.details.map((detail) => (
                <div key={detail.label}><b>{detail.label}:</b> {detail.value}</div>
              ))}
            </div>
          </div>
        ))}
        {bodyText ? <p style={{ whiteSpace: 'pre-wrap' }}>{bodyText}</p> : null}
        {placeLine ? <p className="legal-place">{placeLine}</p> : null}
      </section>

      <section className="legal-signature-stack">
        {signatures.map((signature, index) => {
          const seal = signature.signedAt || signature.method ? sealCopy(signature.method, signature.signedAt) : null;
          return (
            <div className="legal-signature" key={`${signature.role}-${index}`}>
              {seal ? (
                <div className="legal-seal">
                  <div className="legal-seal-icon" aria-hidden>✓</div>
                  <div>
                    <strong>{seal.title}</strong>
                    <span>{seal.detail}</span>
                  </div>
                </div>
              ) : null}
              <div className="legal-signature-label">{signatureLabel(signature.role, signature.method)}</div>
              {signature.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="legal-signature-image" src={signature.imageUrl} alt="" />
              ) : <div className="legal-signature-image" />}
              <strong>{text(signature.signerName, identity.professionalName ?? '')}</strong>
              {signature.detail ? <span>{signature.detail}</span> : null}
            </div>
          );
        })}
      </section>

      <footer className="legal-footer">
        <div className="legal-validation">
          <strong>
            Documento eletrônico
            {validationCode ? ` · Código ${validationCode}` : ''}
          </strong>
          Validar autenticidade:{' '}
          <a href={validationHref} target="_blank" rel="noreferrer">{validationHref}</a>
          <br />
          {identity.issuedPlace || issued
            ? `Emitido${identity.issuedPlace ? ` em ${identity.issuedPlace}` : ''}${issued ? `, ${issued}` : ''}.`
            : null}
          <br />
          {footerNote ?? 'Documento emitido eletronicamente por meio da plataforma Sonder Clinic.'}
        </div>
        <div className="legal-qr" aria-hidden>
          {qrSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrSrc} alt="" />
          ) : (
            <span>QR</span>
          )}
        </div>
      </footer>
    </article>
  );
}

export function formatLegalCpf(full?: string | null, _masked?: string | null) {
  const digits = String(full ?? '').replace(/\D/g, '');
  if (digits.length === 11) return formatCpf(full);
  return '—';
}

export function formatLegalPlaceLine(identity: LegalIdentityView) {
  const place = text(identity.issuedPlace, '').trim();
  const date = identity.issuedAt ? formatBrazilianDateLong(identity.issuedAt, '') : '';
  if (place && date) return `${place}, ${date}.`;
  if (date) return date.endsWith('.') ? date : `${date}.`;
  return '';
}
