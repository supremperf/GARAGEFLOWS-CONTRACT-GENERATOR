import JSZip from 'jszip';
import { DocumentParagraph, DocumentTable } from '../types';

export interface DocxParseOutput {
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

export function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&');
}

export function encodeXmlEntities(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function extractTextFromParagraphXml(pXml: string): string {
  const parts: string[] = [];
  const tokenRegex = /<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br(?:\s+[^>]*)?\/>/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(pXml)) !== null) {
    if (match[0].startsWith('<w:tab')) {
      parts.push('\t');
    } else if (match[0].startsWith('<w:br')) {
      parts.push('\n');
    } else if (match[1] !== undefined) {
      parts.push(decodeXmlEntities(match[1]));
    }
  }
  return parts.join('');
}

export async function parseDocxBuffer(buffer: Buffer): Promise<DocxParseOutput> {
  const zip = await JSZip.loadAsync(buffer);
  const docFile = zip.file('word/document.xml');
  if (!docFile) {
    throw new Error('Archive DOCX invalide : fichier word/document.xml introuvable.');
  }

  const docXml = await docFile.async('string');
  const warnings: string[] = [];
  const paragraphs: DocumentParagraph[] = [];
  const tables: DocumentTable[] = [];
  const headers: string[] = [];
  const footers: string[] = [];

  // 1. Extraire les tableaux <w:tbl> et repérer leurs plages pour ne pas dupliquer leurs paragraphes
  const tableRanges: [number, number][] = [];
  const tblRegex = /<w:tbl\b[^>]*>([\s\S]*?)<\/w:tbl>/g;
  let tblMatch: RegExpExecArray | null;
  let tableIdx = 0;

  while ((tblMatch = tblRegex.exec(docXml)) !== null) {
    tableRanges.push([tblMatch.index, tblMatch.index + tblMatch[0].length]);
    const tblContent = tblMatch[1];
    const rows: string[][] = [];
    const trRegex = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g;
    let trMatch: RegExpExecArray | null;
    while ((trMatch = trRegex.exec(tblContent)) !== null) {
      const rowCells: string[] = [];
      const tcRegex = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g;
      let tcMatch: RegExpExecArray | null;
      while ((tcMatch = tcRegex.exec(trMatch[1])) !== null) {
        const cellParagraphs: string[] = [];
        const pRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
        let pMatch: RegExpExecArray | null;
        while ((pMatch = pRegex.exec(tcMatch[1])) !== null) {
          const t = extractTextFromParagraphXml(pMatch[1]);
          if (t) cellParagraphs.push(t);
        }
        rowCells.push(cellParagraphs.join('\n'));
      }
      rows.push(rowCells);
    }
    tables.push({ index: tableIdx++, rows });
  }

  const isInsideTable = (pos: number) =>
    tableRanges.some(([s, e]) => pos >= s && pos < e);

  // 2. Extraire les paragraphes hors tableaux
  const pRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  let pMatch: RegExpExecArray | null;
  let pIdx = 0;
  while ((pMatch = pRegex.exec(docXml)) !== null) {
    if (isInsideTable(pMatch.index)) continue;
    const text = extractTextFromParagraphXml(pMatch[1]);
    const styleMatch = /<w:pStyle\s+w:val="([^"]+)"/.exec(pMatch[1]);
    if (text.trim().length > 0) {
      paragraphs.push({
        index: pIdx++,
        text,
        section: 'body',
        style: styleMatch ? styleMatch[1] : undefined,
      });
    }
  }

  // 3. Extraire les en-têtes (word/header*.xml)
  const headerFiles = Object.keys(zip.files).filter((f) => /^word\/header\d*\.xml$/.test(f));
  for (const hf of headerFiles) {
    const hXml = await zip.file(hf)!.async('string');
    const hpRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
    let m: RegExpExecArray | null;
    while ((m = hpRegex.exec(hXml)) !== null) {
      const t = extractTextFromParagraphXml(m[1]).trim();
      if (t) headers.push(t);
    }
  }

  // 4. Extraire les pieds de page (word/footer*.xml)
  const footerFiles = Object.keys(zip.files).filter((f) => /^word\/footer\d*\.xml$/.test(f));
  for (const ff of footerFiles) {
    const fXml = await zip.file(ff)!.async('string');
    const fpRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
    let m: RegExpExecArray | null;
    while ((m = fpRegex.exec(fXml)) !== null) {
      const t = extractTextFromParagraphXml(m[1]).trim();
      if (t) footers.push(t);
    }
  }

  // 5. Détecter les images et sauts de page
  const mediaFiles = Object.keys(zip.files).filter((f) => f.startsWith('word/media/') && !zip.files[f].dir);
  const pageBreaks = (docXml.match(/<w:br\s+w:type="page"\s*\/>|<w:lastRenderedPageBreak\s*\/>/g) || []).length;
  const pageCount = Math.max(1, pageBreaks + 1);

  const allTextParts: string[] = [
    ...headers,
    ...paragraphs.map((p) => p.text),
    ...tables.flatMap((t) => t.rows.map((r) => r.join(' | '))),
    ...footers,
  ];

  return {
    fullText: allTextParts.join('\n'),
    paragraphs,
    tables,
    headers,
    footers,
    pageCount,
    hasImages: mediaFiles.length > 0,
    imageCount: mediaFiles.length,
    warnings,
  };
}
