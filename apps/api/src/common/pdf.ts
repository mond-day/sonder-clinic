import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { resolvePublicWebUrl } from './public-web-url';

export type PdfTableInput = {
  title: string;
  subtitle?: string;
  meta?: Array<[string, string]>;
  rows: Array<Record<string, unknown>>;
  footerNote?: string;
};

export type PdfDocumentInput = {
  clinicName: string;
  clinicDetails?: string[];
  professionalName?: string;
  professionalDetails?: string[];
  title: string;
  patientName?: string;
  patientDocument?: string;
  identityRows?: Array<[string, string]>;
  bodyLines: string[];
  signatures?: Array<{ label: string; name: string; detail?: string }>;
  footerLeft?: string;
  footerRight?: string;
  validationCode?: string;
  /** Override da URL pública; se omitido, usa WEB_URL + /validar/documento?codigo= */
  validationUrl?: string;
  issuedLine?: string;
  /** Cor da identidade visual (hex). Usada no filete do cabeçalho. */
  primaryColor?: string;
};

function publicValidationUrl(code: string, override?: string): string {
  if (override?.trim()) return override.trim();
  const webUrl = resolvePublicWebUrl();
  return `${webUrl}/validar/documento?codigo=${encodeURIComponent(code)}`;
}

function safeAccent(value?: string) {
  return value && /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : '#176B5B';
}

export async function buildValidationQrPng(validationUrl: string): Promise<Buffer> {
  return QRCode.toBuffer(validationUrl, {
    type: 'png',
    width: 240,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#183139', light: '#ffffff' },
  });
}

function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

export async function buildReportPdf(input: PdfTableInput): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 48, size: 'A4' });
  const done = collect(doc);

  doc.fillColor('#0f3d3a').fontSize(18).text(input.title, { align: 'left' });
  if (input.subtitle) {
    doc.moveDown(0.3).fillColor('#5b6d72').fontSize(10).text(input.subtitle);
  }
  if (input.meta?.length) {
    doc.moveDown(0.6);
    for (const [label, value] of input.meta) {
      doc.fillColor('#183139').fontSize(9).text(`${label}: ${value}`);
    }
  }

  doc.moveDown(0.8);
  if (!input.rows.length) {
    doc.fillColor('#6a7d83').fontSize(11).text('Sem registros no período selecionado.');
  } else {
    const headers = Object.keys(input.rows[0]!);
    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidth = usableWidth / Math.min(headers.length, 6);
    const drawHeaders = headers.slice(0, 6);

    doc.fillColor('#0f3d3a').fontSize(9).font('Helvetica-Bold');
    let x = doc.page.margins.left;
    const y = doc.y;
    for (const header of drawHeaders) {
      doc.text(header, x, y, { width: colWidth - 4, continued: false });
      x += colWidth;
    }
    doc.moveDown(0.4);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .strokeColor('#c5d2d0').stroke();
    doc.moveDown(0.3).font('Helvetica').fillColor('#183139');

    for (const row of input.rows.slice(0, 40)) {
      if (doc.y > doc.page.height - 72) {
        doc.addPage();
      }
      let cellX = doc.page.margins.left;
      const rowY = doc.y;
      for (const header of drawHeaders) {
        const value = row[header] == null ? '' : String(row[header]);
        doc.text(value.slice(0, 42), cellX, rowY, { width: colWidth - 4 });
        cellX += colWidth;
      }
      doc.y = rowY + 16;
    }
  }

  if (input.footerNote) {
    doc.moveDown(1).fillColor('#6a7d83').fontSize(8).text(input.footerNote);
  }
  doc.end();
  return done;
}

export async function buildClinicalDocumentPdf(input: PdfDocumentInput): Promise<Buffer> {
  const FOOTER_SAFE_HEIGHT = 108;
  const QR_SIZE = 68;
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'portrait',
    margins: { top: 48, left: 48, right: 48, bottom: 28 },
  });
  const done = collect(doc);
  const pageWidth = doc.page.width;
  const left = doc.page.margins.left;
  const right = pageWidth - doc.page.margins.right;
  const bodyBottom = doc.page.height - FOOTER_SAFE_HEIGHT;

  const clinicTitle = input.clinicName.trim() || 'Clínica';
  const accent = safeAccent(input.primaryColor);
  doc.save();
  doc.rect(0, 0, pageWidth, 8).fill(accent);
  doc.restore();
  doc.fillColor('#1d292e').fontSize(12).font('Helvetica-Bold').text(clinicTitle.toUpperCase(), left, doc.y, {
    width: (right - left) * 0.62,
  });
  if (input.professionalName) {
    const savedY = doc.y;
    doc.fontSize(9).font('Helvetica-Bold').text(input.professionalName, left + (right - left) * 0.62, 48, {
      width: (right - left) * 0.38,
      align: 'right',
    });
    for (const line of input.professionalDetails ?? ['Cirurgião-dentista']) {
      doc.font('Helvetica').fillColor('#657176').fontSize(8).text(line, {
        width: (right - left) * 0.38,
        align: 'right',
      });
    }
    doc.y = Math.max(savedY, doc.y);
    doc.fillColor('#1d292e');
    doc.x = left;
  }
  for (const line of input.clinicDetails ?? []) {
    doc.font('Helvetica').fillColor('#657176').fontSize(8).text(line, left, doc.y, { width: (right - left) * 0.62 });
  }
  doc.moveDown(0.6);
  doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor(accent).lineWidth(1.5).stroke();
  doc.lineWidth(1);
  doc.moveDown(1.1);

  doc.fillColor('#657176').fontSize(8).font('Helvetica').text('DOCUMENTO ODONTOLÓGICO', { align: 'center' });
  doc.moveDown(0.25);
  doc.fillColor('#1d292e').fontSize(16).font('Helvetica-Bold').text(input.title, { align: 'center' });
  doc.moveDown(0.9);

  const rows = input.identityRows?.length
    ? input.identityRows
    : [
      input.patientName ? ['Paciente', input.patientName] as [string, string] : null,
      input.patientDocument ? ['CPF', input.patientDocument.replace(/^CPF\s+/i, '')] as [string, string] : null,
    ].filter((row): row is [string, string] => Boolean(row));

  if (rows.length) {
    const boxY = doc.y;
    const boxHeight = 12 + Math.ceil(rows.length / 2) * 16;
    doc.save();
    doc.roundedRect(left, boxY, right - left, boxHeight, 6).fillAndStroke('#f7f7f3', '#e4e0d5');
    doc.restore();
    let rowIndex = 0;
    for (let i = 0; i < rows.length; i += 2) {
      const y = boxY + 8 + rowIndex * 16;
      const leftRow = rows[i]!;
      doc.fillColor('#1d292e').font('Helvetica-Bold').fontSize(8)
        .text(`${leftRow[0]}: `, left + 10, y, { continued: true, width: (right - left) / 2 - 16 })
        .font('Helvetica').text(leftRow[1]);
      const rightRow = rows[i + 1];
      if (rightRow) {
        doc.font('Helvetica-Bold').text(`${rightRow[0]}: `, left + (right - left) / 2, y, {
          continued: true,
          width: (right - left) / 2 - 16,
        }).font('Helvetica').text(rightRow[1]);
      }
      rowIndex += 1;
    }
    doc.y = boxY + boxHeight + 16;
    doc.x = left;
  }

  doc.fillColor('#1d292e').font('Times-Roman').fontSize(11);
  for (const line of input.bodyLines) {
    if (doc.y > bodyBottom - 40) doc.addPage();
    doc.text(line || ' ', left, doc.y, { align: 'left', lineGap: 3, width: right - left });
  }

  const stacked: Array<{ label: string; name: string; detail?: string }> = input.signatures?.length
    ? input.signatures
    : [
      { label: 'Assinatura do profissional', name: input.footerLeft ?? '' },
      { label: 'Ciência / assinatura do paciente', name: input.footerRight ?? '' },
    ].filter((item) => item.name.trim());

  doc.moveDown(1.6);
  doc.font('Helvetica');
  for (const signature of stacked) {
    if (doc.y > bodyBottom - 70) doc.addPage();
    doc.moveTo(left, doc.y).lineTo(left + 280, doc.y).strokeColor('#cbc5b9').stroke();
    doc.moveDown(0.35);
    doc.fillColor('#7b827f').fontSize(7).font('Helvetica-Bold')
      .text(signature.label.toUpperCase(), left, doc.y, { width: 280 });
    doc.moveDown(1.2);
    doc.fillColor('#1d292e').fontSize(9).font('Helvetica-Bold').text(signature.name, left, doc.y, { width: 280 });
    if (signature.detail) {
      doc.fillColor('#657176').fontSize(8).font('Helvetica').text(signature.detail, left, doc.y, { width: 280 });
    }
    doc.moveDown(1.1);
  }

  if (input.validationCode) {
    const validationUrl = publicValidationUrl(input.validationCode, input.validationUrl);
    const qrBuffer = await QRCode.toBuffer(validationUrl, {
      type: 'png',
      width: QR_SIZE * 2,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#183139', light: '#ffffff' },
    });
    const qrX = pageWidth - doc.page.margins.right - QR_SIZE;
    const qrY = doc.page.height - 24 - QR_SIZE;
    doc.save();
    doc.image(qrBuffer, qrX, qrY, { width: QR_SIZE, height: QR_SIZE });
    doc.restore();

    const footerY = doc.page.height - FOOTER_SAFE_HEIGHT + 12;
    doc.moveTo(left, footerY).lineTo(right, footerY).strokeColor('#d9d5ca').stroke();
    doc.fillColor('#1d292e').fontSize(8).font('Helvetica-Bold')
      .text(`Documento eletrônico · Código ${input.validationCode}`, left, footerY + 8, {
        width: right - left - QR_SIZE - 16,
      });
    doc.fillColor('#657176').fontSize(7).font('Helvetica')
      .text('Validar autenticidade', left, doc.y, {
        width: right - left - QR_SIZE - 16,
        link: validationUrl,
      });
    doc.fillColor('#8b928f').fontSize(6.5).text(validationUrl, left, doc.y, {
      width: right - left - QR_SIZE - 16,
      link: validationUrl,
    });
    if (input.issuedLine) {
      doc.text(input.issuedLine, left, doc.y, { width: right - left - QR_SIZE - 16 });
    }
    doc.text('Documento emitido eletronicamente por meio da plataforma Sonder Clinic.', left, doc.y, {
      width: right - left - QR_SIZE - 16,
    });
  }

  doc.end();
  return done;
}
