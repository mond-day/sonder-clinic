import ExcelJS from 'exceljs';
import type { CellValue, SheetRow } from './import-types';

export class SpreadsheetError extends Error {}

function toCellValue(value: ExcelJS.CellValue): CellValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
    if ('result' in value) return toCellValue(value.result as ExcelJS.CellValue);
    if ('text' in value && typeof value.text === 'string') return value.text;
  }
  return null;
}

/** Lê a primeira aba: cabeçalho na linha 1; linhas totalmente vazias são ignoradas. */
export async function readSheet(buffer: Buffer, maxRows: number): Promise<{ headers: string[]; rows: SheetRow[] }> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new SpreadsheetError('Não foi possível ler o arquivo. Envie uma planilha .xlsx válida.');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new SpreadsheetError('A planilha não tem abas.');

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, column) => {
    headers[column - 1] = String(toCellValue(cell.value) ?? '').replace(/\s+/g, ' ').trim();
  });
  if (!headers.some(Boolean)) throw new SpreadsheetError('Cabeçalho não encontrado na linha 1.');

  const rows: SheetRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: Record<string, CellValue> = {};
    let filled = false;
    headers.forEach((header, index) => {
      if (!header) return;
      const value = toCellValue(row.getCell(index + 1).value);
      if (value !== null && value !== '') filled = true;
      cells[header] = value;
    });
    if (filled) rows.push({ rowNumber, cells });
  });
  if (rows.length > maxRows) {
    throw new SpreadsheetError(`A planilha tem ${rows.length} linhas; o limite por importação é ${maxRows}.`);
  }
  return { headers: headers.filter(Boolean), rows };
}
