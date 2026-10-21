import JSZip from 'jszip';
import { DocumentParagraph, DocumentTable } from '../types';
import { decodeXmlEntities } from './docx-parser';

export interface TextParseOutput {
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

/**
 * Décode le contenu textuel d'un fichier RTF en préservant les accents français (Windows-1252 / Unicode)
 */
export function rtfToPlainText(rtf: string): string {
  // Supprimer les groupes d'en-têtes techniques RTF (fonttbl, colortbl, stylesheet, info)
  let cleaned = rtf
    .replace(/\{\\fonttbl[\s\S]*?\}/g, '')
    .replace(/\{\\colortbl[\s\S]*?\}/g, '')
    .replace(/\{\\stylesheet[\s\S]*?\}/g, '')
    .replace(/\{\\\*\\[\s\S]*?\}/g, '');

  // Convertir les sauts de paragraphe et de ligne
  cleaned = cleaned
    .replace(/\\par\b\s*/g, '\n')
    .replace(/\\line\b\s*/g, '\n')
    .replace(/\\tab\b\s*/g, '\t');

  // Décoder les séquences Unicode \uN?
  cleaned = cleaned.replace(/\\u(-?\d+)\??/g, (_, codeStr) => {
    let code = parseInt(codeStr, 10);
    if (code < 0) code += 65536;
    return String.fromCharCode(code);
  });

  // Décoder les séquences hexadécimales Windows-1252 / Latin-1 \'xx
  cleaned = cleaned.replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => {
    const code = parseInt(hex, 16);
    return String.fromCharCode(code);
  });

  // Décoder les accolades échappées
  cleaned = cleaned
    .replace(/\\\{/g, '\uFFF0')
    .replace(/\\\}/g, '\uFFF1')
    .replace(/\\\\/g, '\\');

  // Supprimer les mots de contrôle RTF restants (\b, \fs24, \rtf1, etc.)
  cleaned = cleaned.replace(/\\[a-zA-Z]+-?\d*\s?/g, '');

  // Supprimer les accolades de structure RTF et restaurer les accolades littérales ({{VARIABLE}})
  cleaned = cleaned
    .replace(/[{}]/g, '')
    .replace(/\uFFF0/g, '{')
    .replace(/\uFFF1/g, '}');

  return cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join('\n');
}

export function parseRtfBuffer(buffer: Buffer): TextParseOutput {
  const raw = buffer.toString('latin1');
  const plain = rtfToPlainText(raw);
  const lines = plain.split('\n').filter((l) => l.trim().length > 0);
  const paragraphs: DocumentParagraph[] = lines.map((text, index) => ({
    index,
    text,
    section: 'body',
  }));
  const hasPict = /\\pict\b/.test(raw);
  return {
    fullText: plain,
    paragraphs,
    tables: [],
    headers: [],
    footers: [],
    pageCount: 1,
    hasImages: hasPict,
    imageCount: hasPict ? 1 : 0,
    warnings: [],
  };
}

export function parseHtmlBuffer(buffer: Buffer): TextParseOutput {
  const html = buffer.toString('utf8');
  const paragraphs: DocumentParagraph[] = [];
  const tables: DocumentTable[] = [];

  // Extraire les tableaux HTML
  const tableRanges: [number, number][] = [];
  const tblRegex = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let tm: RegExpExecArray | null;
  let tIdx = 0;
  while ((tm = tblRegex.exec(html)) !== null) {
    tableRanges.push([tm.index, tm.index + tm[0].length]);
    const rows: string[][] = [];
    const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let rm: RegExpExecArray | null;
    while ((rm = trRegex.exec(tm[1])) !== null) {
      const cells: string[] = [];
      const tdRegex = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let cm: RegExpExecArray | null;
      while ((cm = tdRegex.exec(rm[1])) !== null) {
        cells.push(decodeXmlEntities(cm[1].replace(/<[^>]+>/g, '').trim()));
      }
      rows.push(cells);
    }
    tables.push({ index: tIdx++, rows });
  }

  // Supprimer head/style/script pour l'extraction des paragraphes
  const bodyContent = html
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, '');

  const blockRegex = /<(?:p|h[1-6]|div|li|blockquote)\b[^>]*>([\s\S]*?)<\/(?:p|h[1-6]|div|li|blockquote)>/gi;
  let bm: RegExpExecArray | null;
  let pIdx = 0;
  while ((bm = blockRegex.exec(bodyContent)) !== null) {
    // Éviter d'extraire un div parent contenant déjà des <p>
    if (/<(?:p|h[1-6]|div)\b/i.test(bm[1])) continue;
    const text = decodeXmlEntities(
      bm[1]
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .trim()
    );
    if (text) {
      paragraphs.push({
        index: pIdx++,
        text,
        section: 'body',
      });
    }
  }

  if (paragraphs.length === 0) {
    const fallbackText = decodeXmlEntities(bodyContent.replace(/<[^>]+>/g, '')).trim();
    fallbackText.split(/\r?\n/).forEach((line) => {
      if (line.trim()) {
        paragraphs.push({ index: pIdx++, text: line.trim(), section: 'body' });
      }
    });
  }

  const imgMatches = html.match(/<img\b[^>]*>/gi) || [];
  const fullText = [
    ...paragraphs.map((p) => p.text),
    ...tables.flatMap((t) => t.rows.map((r) => r.join(' | '))),
  ].join('\n');

  return {
    fullText,
    paragraphs,
    tables,
    headers: [],
    footers: [],
    pageCount: 1,
    hasImages: imgMatches.length > 0,
    imageCount: imgMatches.length,
    warnings: [],
  };
}

export function parseTxtBuffer(buffer: Buffer): TextParseOutput {
  const fullText = buffer.toString('utf8');
  const lines = fullText.split(/\r?\n/);
  const paragraphs: DocumentParagraph[] = [];
  lines.forEach((line) => {
    if (line.trim().length > 0) {
      paragraphs.push({
        index: paragraphs.length,
        text: line,
        section: 'body',
      });
    }
  });
  return {
    fullText,
    paragraphs,
    tables: [],
    headers: [],
    footers: [],
    pageCount: Math.max(1, Math.ceil(lines.length / 45)),
    hasImages: false,
    imageCount: 0,
    warnings: [],
  };
}

export async function parsePptxBuffer(buffer: Buffer): Promise<TextParseOutput> {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort();

  const paragraphs: DocumentParagraph[] = [];
  for (const sf of slideFiles) {
    const xml = await zip.file(sf)!.async('string');
    const pRegex = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g;
    let pm: RegExpExecArray | null;
    while ((pm = pmRegexExec(pRegex, xml)) !== null) {
      const tParts: string[] = [];
      const tRegex = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g;
      let tm: RegExpExecArray | null;
      while ((tm = tRegex.exec(pm[1])) !== null) {
        tParts.push(decodeXmlEntities(tm[1]));
      }
      const line = tParts.join('').trim();
      if (line) {
        paragraphs.push({
          index: paragraphs.length,
          text: line,
          section: 'body',
        });
      }
    }
  }

  const mediaFiles = Object.keys(zip.files).filter((f) => f.startsWith('ppt/media/') && !zip.files[f].dir);

  return {
    fullText: paragraphs.map((p) => p.text).join('\n'),
    paragraphs,
    tables: [],
    headers: [],
    footers: [],
    pageCount: Math.max(1, slideFiles.length),
    hasImages: mediaFiles.length > 0,
    imageCount: mediaFiles.length,
    warnings: [],
  };
}

function pmRegexExec(regex: RegExp, str: string): RegExpExecArray | null {
  return regex.exec(str);
}

export function parseLegacyDocBuffer(buffer: Buffer): TextParseOutput {
  const rawUtf8 = buffer.toString('utf8');
  const rawLatin1 = buffer.toString('latin1');
  const extractedLines: string[] = [];

  // Si le fichier .doc est en réalité un RTF ou texte renommé, le traiter proprement
  if (rawLatin1.startsWith('{\\rtf')) {
    return parseRtfBuffer(buffer);
  }

  const matches = rawUtf8.match(/[A-Za-zÀ-ÿ0-9\{\}\[\]«»'’,.;:!?€\/\-\s]{12,}/g) || [];
  for (const m of matches) {
    const clean = m.trim();
    if (clean.length >= 12 && !/^(?:Root Entry|WordDocument|CompObj|SummaryInformation)/.test(clean)) {
      extractedLines.push(clean);
    }
  }

  const paragraphs: DocumentParagraph[] = extractedLines.map((text, index) => ({
    index,
    text,
    section: 'body',
  }));

  return {
    fullText: extractedLines.join('\n'),
    paragraphs,
    tables: [],
    headers: [],
    footers: [],
    pageCount: 1,
    hasImages: false,
    imageCount: 0,
    warnings: [
      'Format binaire hérité (.DOC Word 97-2003) détecté : prise en charge partielle par extraction de flux. Pour une conservation 100 % garantie des tableaux et styles complexes, privilégiez l’enregistrement en .DOCX ou .ODT.',
    ],
  };
}
