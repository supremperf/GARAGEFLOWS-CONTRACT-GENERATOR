import * as XLSX from 'xlsx';
import { assertZipWithinLimits, withPrototypePollutionGuard } from './guards';
import JSZip from 'jszip';
import { DocumentParagraph, DocumentTable, SpreadsheetCell, SpreadsheetSheet } from '../types';

export interface XlsxParseOutput {
  fullText: string;
  paragraphs: DocumentParagraph[];
  tables: DocumentTable[];
  sheets: SpreadsheetSheet[];
  hasImages: boolean;
  imageCount: number;
  warnings: string[];
}

export async function parseSpreadsheetBuffer(
  buffer: Buffer,
  format: 'xlsx' | 'xls' | 'ods' | 'csv'
): Promise<XlsxParseOutput> {
  const warnings: string[] = [];
  let hasImages = false;
  let imageCount = 0;

  if (format === 'xlsx') {
    try {
      const zip = await JSZip.loadAsync(buffer);
      assertZipWithinLimits(zip, 'Classeur XLSX');
      const media = Object.keys(zip.files).filter((f) => f.startsWith('xl/media/') && !zip.files[f].dir);
      hasImages = media.length > 0;
      imageCount = media.length;
    } catch {
      // Non-zip or legacy format
    }
  }

  const workbook = withPrototypePollutionGuard(() =>
    format === 'csv'
      ? XLSX.read(buffer.toString('utf8'), { type: 'string', cellFormula: true, cellStyles: true })
      : XLSX.read(buffer, { type: 'buffer', cellFormula: true, cellStyles: true })
  );

  const sheets: SpreadsheetSheet[] = [];
  const tables: DocumentTable[] = [];
  const paragraphs: DocumentParagraph[] = [];
  const allTextLines: string[] = [];

  workbook.SheetNames.forEach((sheetName, sIdx) => {
    const ws = workbook.Sheets[sheetName];
    if (!ws) return;

    const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
    const cells: SpreadsheetCell[] = [];
    const tableRows: string[][] = [];

    for (let r = range.s.r; r <= range.e.r; r++) {
      const rowValues: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (!cell) {
          rowValues.push('');
          continue;
        }
        const strVal = cell.v !== undefined && cell.v !== null ? String(cell.v) : cell.w ? String(cell.w) : '';
        rowValues.push(strVal);

        if (strVal || cell.f) {
          cells.push({
            address: addr,
            row: r,
            col: c,
            value: strVal,
            formula: cell.f,
            dataType: cell.t || 's',
          });
        }
      }
      if (rowValues.some((v) => v.trim().length > 0)) {
        tableRows.push(rowValues);
        const lineText = rowValues.filter((v) => v.trim().length > 0).join(' | ');
        allTextLines.push(`[${sheetName}] ${lineText}`);
        paragraphs.push({
          index: paragraphs.length,
          text: lineText,
          section: 'body',
        });
      }
    }

    sheets.push({
      name: sheetName,
      cells,
      rowCount: range.e.r - range.s.r + 1,
      colCount: range.e.c - range.s.c + 1,
    });

    tables.push({
      index: sIdx,
      rows: tableRows,
    });
  });

  return {
    fullText: allTextLines.join('\n'),
    paragraphs,
    tables,
    sheets,
    hasImages,
    imageCount,
    warnings,
  };
}
