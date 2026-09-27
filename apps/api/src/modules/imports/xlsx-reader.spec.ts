import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { readSheet, SpreadsheetError } from './xlsx-reader';

async function workbookBuffer(rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Dados');
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('readSheet', () => {
  it('lê cabeçalho, ignora linhas vazias e normaliza rich text', async () => {
    const buffer = await workbookBuffer([
      ['Nome completo', ' Celular ', 'Data'],
      [{ richText: [{ text: 'Paciente ' }, { text: 'Teste' }] }, '(65) 99999-0000', new Date(Date.UTC(2026, 0, 5))],
      [null, null, null],
      ['Outra Pessoa', 6533330000, null],
    ]);
    const { headers, rows } = await readSheet(buffer, 100);
    expect(headers).toEqual(['Nome completo', 'Celular', 'Data']);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ rowNumber: 2, cells: { 'Nome completo': 'Paciente Teste', Celular: '(65) 99999-0000' } });
    expect(rows[1]!.rowNumber).toBe(4);
    expect(rows[1]!.cells.Celular).toBe(6533330000);
  });

  it('recusa arquivo inválido e planilha acima do limite', async () => {
    await expect(readSheet(Buffer.from('não é xlsx'), 10)).rejects.toBeInstanceOf(SpreadsheetError);
    const buffer = await workbookBuffer([['Nome'], ['A'], ['B'], ['C']]);
    await expect(readSheet(buffer, 2)).rejects.toThrow('limite');
  });
});
