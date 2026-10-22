import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { withPrototypePollutionGuard } from '../document-parser/guards';
import { decodeXmlEntities, encodeXmlEntities } from '../document-parser/docx-parser';
import {
  computeTextSpanReplacements,
  ReplacementInstruction,
} from './docx-replacer';

export interface XlsxReplacementResult {
  buffer: Buffer;
  replacementsCount: Record<string, number>;
}

export async function replaceInSpreadsheetBuffer(
  originalBuffer: Buffer,
  format: 'xlsx' | 'xls' | 'ods' | 'csv',
  instructions: ReplacementInstruction[]
): Promise<XlsxReplacementResult> {
  const replacementsCount: Record<string, number> = {};
  const genericCounterRef = { count: 0 };

  if (format === 'xlsx') {
    try {
      const zip = await JSZip.loadAsync(Buffer.from(originalBuffer));
      const sharedStringsFile = zip.file('xl/sharedStrings.xml');
      const sharedStrings: string[] = [];

      if (sharedStringsFile) {
        const ssXml = await sharedStringsFile.async('string');
        const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
        let m: RegExpExecArray | null;
        while ((m = siRegex.exec(ssXml)) !== null) {
          const tParts: string[] = [];
          const tRegex = /<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/g;
          let tm: RegExpExecArray | null;
          while ((tm = tRegex.exec(m[1])) !== null) {
            tParts.push(decodeXmlEntities(tm[1]));
          }
          sharedStrings.push(tParts.join(''));
        }
      }

      // Parcourir les feuilles dans l'ordre (xl/worksheets/sheet1.xml, sheet2.xml...)
      const sheetFiles = Object.keys(zip.files)
        .filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))
        .sort();

      for (const sf of sheetFiles) {
        const sheetXml = await zip.file(sf)!.async('string');
        // Remplacer cellule par cellule <c ...>...</c> en préservant l'attribut style s="..." et les formules <f>
        const updatedSheetXml = sheetXml.replace(/<c\b([^>]*)>([\s\S]*?)<\/c>/g, (fullCellXml, attrs, innerCellXml) => {
          // Si la cellule contient une formule <f>, ne jamais altérer la formule
          if (/<f\b/.test(innerCellXml)) {
            return fullCellXml;
          }

          const typeMatch = /\bt="([^"]+)"/.exec(attrs);
          const cellType = typeMatch ? typeMatch[1] : '';

          let cellPlainText = '';
          if (cellType === 's') {
            const vMatch = /<v>(\d+)<\/v>/.exec(innerCellXml);
            if (vMatch) {
              const ssIdx = parseInt(vMatch[1], 10);
              cellPlainText = sharedStrings[ssIdx] || '';
            }
          } else if (cellType === 'inlineStr' || /<is\b/.test(innerCellXml)) {
            const tParts: string[] = [];
            const tRegex = /<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/g;
            let tm: RegExpExecArray | null;
            while ((tm = tRegex.exec(innerCellXml)) !== null) {
              tParts.push(decodeXmlEntities(tm[1]));
            }
            cellPlainText = tParts.join('');
          } else if (cellType === 'str') {
            const vMatch = /<v>([\s\S]*?)<\/v>/.exec(innerCellXml);
            if (vMatch) cellPlainText = decodeXmlEntities(vMatch[1]);
          }

          if (!cellPlainText) return fullCellXml;

          const { newText, spanReplacements } = computeTextSpanReplacements(
            cellPlainText,
            instructions,
            genericCounterRef,
            replacementsCount
          );

          if (spanReplacements.length === 0) return fullCellXml;

          // Convertir la cellule modifiée en inlineStr pour préserver 100 % du style s="..." sans conflit de table partagée
          const cleanedAttrs = attrs.replace(/\bt="[^"]*"/, '').trim();
          const encodedNew = encodeXmlEntities(newText);
          return `<c ${cleanedAttrs} t="inlineStr"><is><t xml:space="preserve">${encodedNew}</t></is></c>`;
        });

        zip.file(sf, updatedSheetXml);
      }

      const outBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
      });
      return { buffer: outBuffer, replacementsCount };
    } catch {
      // Fallback sur SheetJS si structure particulière
    }
  }

  // Traitement CSV / ODS / XLS via SheetJS en préservant les formules et dimensions
  const workbook =
    format === 'csv'
      ? withPrototypePollutionGuard(() => XLSX.read(originalBuffer.toString('utf8'), { type: 'string', cellFormula: true, cellStyles: true }))
      : withPrototypePollutionGuard(() => XLSX.read(Buffer.from(originalBuffer), { type: 'buffer', cellFormula: true, cellStyles: true }));

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws || !ws['!ref']) continue;
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (!cell || cell.f) continue; // Conserver les formules intactes
        if (typeof cell.v === 'string' && cell.v.length > 0) {
          const { newText, spanReplacements } = computeTextSpanReplacements(
            cell.v,
            instructions,
            genericCounterRef,
            replacementsCount
          );
          if (spanReplacements.length > 0) {
            cell.v = newText;
            if (cell.w) cell.w = newText;
          }
        }
      }
    }
  }

  const outBuf =
    format === 'csv'
      ? Buffer.from(XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]), 'utf8')
      : (XLSX.write(workbook, { type: 'buffer', bookType: format === 'ods' ? 'ods' : 'xlsx' }) as Buffer);

  return {
    buffer: outBuf,
    replacementsCount,
  };
}
