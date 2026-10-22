import JSZip from 'jszip';
import { assertZipWithinLimits } from './guards';
import { parseCsv } from '../spreadsheet/csv';
import { indexToColumnName, readXlsxSheets } from '../spreadsheet/xlsx-xml';
import { readOdsSheets } from '../spreadsheet/ods-xml';
import { DocumentParagraph, DocumentTable, SpreadsheetSheet } from '../types';

export interface XlsxParseOutput {
  fullText: string;
  paragraphs: DocumentParagraph[];
  tables: DocumentTable[];
  sheets: SpreadsheetSheet[];
  hasImages: boolean;
  imageCount: number;
  warnings: string[];
}

export const XLS_UNSUPPORTED_MESSAGE =
  'Le format XLS (Excel 97-2003, binaire) n’est plus pris en charge pour des raisons de sécurité ' +
  '(ancienne bibliothèque SheetJS vulnérable retirée). Convertissez le fichier en .XLSX ou .ODS puis réimportez-le.';

export async function parseSpreadsheetBuffer(
  buffer: Buffer,
  format: 'xlsx' | 'xls' | 'ods' | 'csv'
): Promise<XlsxParseOutput> {
  if (format === 'xls') {
    throw new Error(XLS_UNSUPPORTED_MESSAGE);
  }
  const warnings: string[] = [];
  let hasImages = false;
  let imageCount = 0;
  let sheets: SpreadsheetSheet[] = [];

  if (format === 'csv') {
    const rows = parseCsv(buffer.toString('utf8'));
    const cells = rows.flatMap((row, r) =>
      row
        .map((value, c) => ({ value, c }))
        .filter(({ value }) => value.trim().length > 0)
        .map(({ value, c }) => ({
          address: `${indexToColumnName(c)}${r + 1}`,
          row: r,
          col: c,
          value,
          dataType: 's',
        }))
    );
    sheets = [{
      name: 'CSV',
      cells,
      rowCount: rows.length,
      colCount: rows.reduce((max, r) => Math.max(max, r.length), 0),
    }];
    // Conserve les lignes brutes pour la reconstruction texte ci-dessous.
    (sheets[0] as SpreadsheetSheet & { __rows?: string[][] }).__rows = rows;
  } else {
    const zip = await JSZip.loadAsync(buffer);
    assertZipWithinLimits(zip, format === 'xlsx' ? 'Classeur XLSX' : 'Classeur ODS');
    const mediaPrefix = format === 'xlsx' ? 'xl/media/' : 'Pictures/';
    const media = Object.keys(zip.files).filter((f) => f.startsWith(mediaPrefix) && !zip.files[f].dir);
    hasImages = media.length > 0;
    imageCount = media.length;
    sheets = format === 'xlsx' ? await readXlsxSheets(zip) : await readOdsSheets(zip);
  }

  const tables: DocumentTable[] = [];
  const paragraphs: DocumentParagraph[] = [];
  const allTextLines: string[] = [];

  sheets.forEach((sheet, sIdx) => {
    const tableRows: string[][] = [];
    const rawRows = (sheet as SpreadsheetSheet & { __rows?: string[][] }).__rows;
    if (rawRows) {
      for (const row of rawRows) {
        if (row.some((v) => v.trim().length > 0)) {
          tableRows.push(row);
          const lineText = row.filter((v) => v.trim().length > 0).join(' | ');
          allTextLines.push(`[${sheet.name}] ${lineText}`);
          paragraphs.push({ index: paragraphs.length, text: lineText, section: 'body' });
        }
      }
    } else {
      const byRow = new Map<number, Map<number, string>>();
      for (const cell of sheet.cells) {
        if (!byRow.has(cell.row)) byRow.set(cell.row, new Map());
        byRow.get(cell.row)?.set(cell.col, cell.value);
      }
      const rowIndexes = [...byRow.keys()].sort((a, b) => a - b);
      for (const r of rowIndexes) {
        const cols = byRow.get(r) as Map<number, string>;
        const maxCol = Math.max(...cols.keys());
        const rowValues: string[] = [];
        for (let c = 0; c <= maxCol; c++) rowValues.push(cols.get(c) ?? '');
        if (rowValues.some((v) => v.trim().length > 0)) {
          tableRows.push(rowValues);
          const lineText = rowValues.filter((v) => v.trim().length > 0).join(' | ');
          allTextLines.push(`[${sheet.name}] ${lineText}`);
          paragraphs.push({ index: paragraphs.length, text: lineText, section: 'body' });
        }
      }
    }
    tables.push({ index: sIdx, rows: tableRows });
  });

  return {
    fullText: allTextLines.join('\n'),
    paragraphs,
    tables,
    sheets: sheets.map(({ name, cells, rowCount, colCount }) => ({ name, cells, rowCount, colCount })),
    hasImages,
    imageCount,
    warnings,
  };
}
