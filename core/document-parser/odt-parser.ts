import JSZip from 'jszip';
import { assertZipWithinLimits } from './guards';
import { DocumentParagraph, DocumentTable } from '../types';
import { decodeXmlEntities } from './docx-parser';

export interface OdtParseOutput {
  fullText: string;
  paragraphs: DocumentParagraph[];
  tables: DocumentTable[];
  headers: string[];
  footers: string[];
  pageCount: number;
  hasImages: boolean;
  imageCount: number;
  warnings: string[];
}

function stripOdtTagsToText(xmlFragment: string): string {
  return decodeXmlEntities(
    xmlFragment
      .replace(/<text:tab\s*\/>/g, '\t')
      .replace(/<text:line-break\s*\/>/g, '\n')
      .replace(/<text:s(?:\s+text:c="(\d+)")?\s*\/>/g, (_, c) => ' '.repeat(c ? parseInt(c, 10) : 1))
      .replace(/<[^>]+>/g, '')
  );
}

export async function parseOdtBuffer(buffer: Buffer): Promise<OdtParseOutput> {
  const zip = await JSZip.loadAsync(buffer);
  assertZipWithinLimits(zip, 'Document ODT');
  const contentFile = zip.file('content.xml');
  if (!contentFile) {
    throw new Error('Archive ODT invalide : fichier content.xml introuvable.');
  }

  const contentXml = await contentFile.async('string');
  const paragraphs: DocumentParagraph[] = [];
  const tables: DocumentTable[] = [];
  const headers: string[] = [];
  const footers: string[] = [];
  const warnings: string[] = [];

  // 1. Tableaux <table:table>
  const tableRanges: [number, number][] = [];
  const tblRegex = /<table:table\b[^>]*>([\s\S]*?)<\/table:table>/g;
  let tblMatch: RegExpExecArray | null;
  let tblIdx = 0;

  while ((tblMatch = tblRegex.exec(contentXml)) !== null) {
    tableRanges.push([tblMatch.index, tblMatch.index + tblMatch[0].length]);
    const rows: string[][] = [];
    const rowRegex = /<table:table-row\b[^>]*>([\s\S]*?)<\/table:table-row>/g;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(tblMatch[1])) !== null) {
      const cells: string[] = [];
      const cellRegex = /<table:table-cell\b[^>]*>([\s\S]*?)<\/table:table-cell>/g;
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        cells.push(stripOdtTagsToText(cellMatch[1]).trim());
      }
      rows.push(cells);
    }
    tables.push({ index: tblIdx++, rows });
  }

  const isInsideTable = (pos: number) => tableRanges.some(([s, e]) => pos >= s && pos < e);

  // 2. Paragraphes <text:p> et titres <text:h>
  const pRegex = /<text:(?:p|h)\b[^>]*>([\s\S]*?)<\/text:(?:p|h)>/g;
  let pMatch: RegExpExecArray | null;
  let pIdx = 0;
  while ((pMatch = pRegex.exec(contentXml)) !== null) {
    if (isInsideTable(pMatch.index)) continue;
    const text = stripOdtTagsToText(pMatch[1]).trim();
    if (text) {
      paragraphs.push({
        index: pIdx++,
        text,
        section: 'body',
      });
    }
  }

  // 3. En-têtes et pieds de page dans styles.xml
  const stylesFile = zip.file('styles.xml');
  if (stylesFile) {
    const stylesXml = await stylesFile.async('string');
    const headerRegex = /<style:header\b[^>]*>([\s\S]*?)<\/style:header>/g;
    let hm: RegExpExecArray | null;
    while ((hm = headerRegex.exec(stylesXml)) !== null) {
      const t = stripOdtTagsToText(hm[1]).trim();
      if (t) headers.push(t);
    }
    const footerRegex = /<style:footer\b[^>]*>([\s\S]*?)<\/style:footer>/g;
    let fm: RegExpExecArray | null;
    while ((fm = footerRegex.exec(stylesXml)) !== null) {
      const t = stripOdtTagsToText(fm[1]).trim();
      if (t) footers.push(t);
    }
  }

  const pictureFiles = Object.keys(zip.files).filter((f) => f.startsWith('Pictures/') && !zip.files[f].dir);

  const allText = [
    ...headers,
    ...paragraphs.map((p) => p.text),
    ...tables.flatMap((t) => t.rows.map((r) => r.join(' | '))),
    ...footers,
  ].join('\n');

  return {
    fullText: allText,
    paragraphs,
    tables,
    headers,
    footers,
    pageCount: 1,
    hasImages: pictureFiles.length > 0,
    imageCount: pictureFiles.length,
    warnings,
  };
}
