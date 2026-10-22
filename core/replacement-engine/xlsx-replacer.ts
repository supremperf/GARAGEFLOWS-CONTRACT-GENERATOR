import JSZip from 'jszip';
import { decodeXmlEntities, encodeXmlEntities } from '../document-parser/docx-parser';
import { XLS_UNSUPPORTED_MESSAGE } from '../document-parser/xlsx-parser';
import { detectCsvDelimiter, parseCsv, serializeCsv } from '../spreadsheet/csv';
import {
  computeTextSpanReplacements,
  ReplacementInstruction,
} from './docx-replacer';

export interface XlsxReplacementResult {
  buffer: Buffer;
  replacementsCount: Record<string, number>;
}

/**
 * Remplacement de variables dans un tableur, SANS SheetJS (retiré pour
 * vulnérabilités non corrigées sur npm) :
 *  - XLSX : réécriture XML directe dans le zip d'origine (styles, formules,
 *    dimensions et mise en page intégralement préservés) ;
 *  - ODS : remplacement dans les <text:p> de content.xml, reste du document
 *    inchangé octet par octet hors cellules modifiées ;
 *  - CSV : aller-retour via l'analyseur CSV interne ;
 *  - XLS (binaire hérité) : rejet explicite avec message de conversion.
 */
export async function replaceInSpreadsheetBuffer(
  originalBuffer: Buffer,
  format: 'xlsx' | 'xls' | 'ods' | 'csv',
  instructions: ReplacementInstruction[]
): Promise<XlsxReplacementResult> {
  const replacementsCount: Record<string, number> = {};
  const genericCounterRef = { count: 0 };

  if (format === 'xls') {
    throw new Error(XLS_UNSUPPORTED_MESSAGE);
  }

  if (format === 'csv') {
    const text = originalBuffer.toString('utf8');
    const delimiter = detectCsvDelimiter(text);
    const rows = parseCsv(text, delimiter);
    const replaced = rows.map((row) =>
      row.map((cell) => {
        if (!cell) return cell;
        const { newText, spanReplacements } = computeTextSpanReplacements(cell, instructions, genericCounterRef, replacementsCount);
        return spanReplacements.length > 0 ? newText : cell;
      })
    );
    return { buffer: Buffer.from(serializeCsv(replaced, delimiter), 'utf8'), replacementsCount };
  }

  const zip = await JSZip.loadAsync(Buffer.from(originalBuffer));

  if (format === 'ods') {
    const contentFile = zip.file('content.xml');
    if (!contentFile) throw new Error('Classeur ODS invalide : content.xml introuvable.');
    const contentXml = await contentFile.async('string');
    // Remplacement par paragraphe texte : les variables contractuelles ne
    // franchissent pas les frontières de <text:p> dans les cellules ODS.
    const updated = contentXml.replace(/<text:p\b([^>]*)>([\s\S]*?)<\/text:p>/g, (full, attrs: string, inner: string) => {
      const plain = decodeXmlEntities(inner.replace(/<[^>]+>/g, ''));
      if (!plain) return full;
      const { newText, spanReplacements } = computeTextSpanReplacements(plain, instructions, genericCounterRef, replacementsCount);
      if (spanReplacements.length === 0) return full;
      return `<text:p${attrs}>${encodeXmlEntities(newText)}</text:p>`;
    });
    zip.file('content.xml', updated);
    const outBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    return { buffer: outBuffer, replacementsCount };
  }

  // --- XLSX : réécriture XML dans le zip d'origine ---
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
}
