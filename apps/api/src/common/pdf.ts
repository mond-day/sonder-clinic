import PDFDocument from 'pdfkit';

export type PdfTableInput = {
  title: string;
  subtitle?: string;
  meta?: Array<[string, string]>;
  rows: Array<Record<string, unknown>>;
  footerNote?: string;
};

export type PdfDocumentInput = {
  clinicName: string;
  title: string;
  patientName?: string;
  patientDocument?: string;
  bodyLines: string[];
  footerLeft?: string;
  footerRight?: string;
  validationCode?: string;
};

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
  const doc = new PDFDocument({ margin: 56, size: 'A4' });
  const done = collect(doc);

  doc.fillColor('#0f3d3a').fontSize(12).font('Helvetica-Bold').text(input.clinicName.toUpperCase());
  doc.fillColor('#5b6d72').fontSize(9).font('Helvetica').text('Documento clínico gerado pelo Sonder Clinic');
  doc.moveDown(1.2);
  doc.fillColor('#183139').fontSize(16).font('Helvetica-Bold').text(input.title, { align: 'center' });
  doc.moveDown(1);

  if (input.patientName) {
    doc.font('Helvetica').fontSize(11).text(`Paciente: ${input.patientName}`);
  }
  if (input.patientDocument) {
    doc.text(`Documento: ${input.patientDocument}`);
  }
  doc.moveDown(0.8);

  for (const line of input.bodyLines) {
    doc.fontSize(11).text(line || ' ', { align: 'left', lineGap: 3 });
  }

  doc.moveDown(2.5);
  const col = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2;
  const baseY = doc.y;
  doc.moveTo(doc.page.margins.left, baseY).lineTo(doc.page.margins.left + col - 16, baseY).strokeColor('#555').stroke();
  doc.moveTo(doc.page.margins.left + col + 16, baseY).lineTo(doc.page.width - doc.page.margins.right, baseY).stroke();
  doc.fontSize(8).fillColor('#555')
    .text(input.footerLeft ?? 'Assinatura do profissional', doc.page.margins.left, baseY + 6, { width: col - 16, align: 'center' })
    .text(input.footerRight ?? 'Assinatura do paciente', doc.page.margins.left + col + 16, baseY + 6, {
      width: col - 16,
      align: 'center',
    });

  if (input.validationCode) {
    doc.moveDown(3).fillColor('#6a7d83').fontSize(8)
      .text(`Código de validação: ${input.validationCode}`, { align: 'center' });
  }

  doc.end();
  return done;
}
