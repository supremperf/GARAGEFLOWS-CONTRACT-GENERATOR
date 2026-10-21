import JSZip from 'jszip';
import { decodeXmlEntities, encodeXmlEntities } from '../document-parser/docx-parser';
import {
  computeTextSpanReplacements,
  ReplacementInstruction,
} from './docx-replacer';

export interface OdtReplacementResult {
  buffer: Buffer;
  replacementsCount: Record<string, number>;
}

function replaceInOdtParagraphXml(
  pXml: string,
  instructions: ReplacementInstruction[],
  genericCounterRef: { count: number },
  replacementsCount: Record<string, number>
): string {
  // Remplacer dans les segments textuels situés entre les balises XML ODT
  // Si aucune sous-balise <text:span> ne coupe la variable, ou si elle est en texte direct :
  const textSegments: { start: number; end: number; decoded: string; charStart: number; charEnd: number }[] = [];
  const tagRegex = /<[^>]+>/g;
  let lastIdx = 0;
  let charCursor = 0;
  let m: RegExpExecArray | null;

  while ((m = tagRegex.exec(pXml)) !== null) {
    if (m.index > lastIdx) {
      const rawText = pXml.slice(lastIdx, m.index);
      const decoded = decodeXmlEntities(rawText);
      textSegments.push({
        start: lastIdx,
        end: m.index,
        decoded,
        charStart: charCursor,
        charEnd: charCursor + decoded.length,
      });
      charCursor += decoded.length;
    }
    lastIdx = m.index + m[0].length;
  }

  if (textSegments.length === 0) return pXml;

  const fullPlainText = textSegments.map((s) => s.decoded).join('');
  const { spanReplacements } = computeTextSpanReplacements(
    fullPlainText,
    instructions,
    genericCounterRef,
    replacementsCount
  );

  if (spanReplacements.length === 0) return pXml;

  const segChars: string[][] = textSegments.map((s) => Array.from(s.decoded));
  const sortedSpans = [...spanReplacements].sort((a, b) => b.start - a.start);

  for (const span of sortedSpans) {
    let firstPlaced = false;
    for (let sIdx = 0; sIdx < textSegments.length; sIdx++) {
      const seg = textSegments[sIdx];
      const overlapStart = Math.max(span.start, seg.charStart);
      const overlapEnd = Math.min(span.end, seg.charEnd);
      if (overlapStart < overlapEnd) {
        const localStart = overlapStart - seg.charStart;
        const localLen = overlapEnd - overlapStart;
        if (!firstPlaced) {
          segChars[sIdx].splice(localStart, localLen, span.replacement);
          firstPlaced = true;
        } else {
          segChars[sIdx].splice(localStart, localLen);
        }
      }
    }
  }

  let updatedXml = pXml;
  for (let sIdx = textSegments.length - 1; sIdx >= 0; sIdx--) {
    const seg = textSegments[sIdx];
    const encoded = encodeXmlEntities(segChars[sIdx].join(''));
    updatedXml = updatedXml.slice(0, seg.start) + encoded + updatedXml.slice(seg.end);
  }

  return updatedXml;
}

export async function replaceInOdtBuffer(
  originalBuffer: Buffer,
  instructions: ReplacementInstruction[]
): Promise<OdtReplacementResult> {
  const workingCopy = Buffer.from(originalBuffer);
  const zip = await JSZip.loadAsync(workingCopy);
  const replacementsCount: Record<string, number> = {};
  const genericCounterRef = { count: 0 };

  const stylesFile = zip.file('styles.xml');
  let stylesXml = stylesFile ? await stylesFile.async('string') : '';

  // 1. En-têtes dans styles.xml
  if (stylesXml) {
    stylesXml = stylesXml.replace(/<style:header\b[^>]*>[\s\S]*?<\/style:header>/g, (headerXml) =>
      headerXml.replace(/<text:(?:p|h)\b[^>]*>[\s\S]*?<\/text:(?:p|h)>/g, (pXml) =>
        replaceInOdtParagraphXml(pXml, instructions, genericCounterRef, replacementsCount)
      )
    );
  }

  // 2. Corps et tableaux dans content.xml
  const contentFile = zip.file('content.xml');
  if (contentFile) {
    const contentXml = await contentFile.async('string');
    const tableRanges: [number, number][] = [];
    const tblRegex = /<table:table\b[^>]*>[\s\S]*?<\/table:table>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tblRegex.exec(contentXml)) !== null) {
      tableRanges.push([tm.index, tm.index + tm[0].length]);
    }
    const isInsideTable = (pos: number) => tableRanges.some(([s, e]) => pos >= s && pos < e);

    let updatedContentXml = contentXml.replace(
      /<text:(?:p|h)\b[^>]*>[\s\S]*?<\/text:(?:p|h)>/g,
      (pXml, offset: number) => {
        if (isInsideTable(offset)) return pXml;
        return replaceInOdtParagraphXml(pXml, instructions, genericCounterRef, replacementsCount);
      }
    );

    updatedContentXml = updatedContentXml.replace(
      /<table:table\b[^>]*>[\s\S]*?<\/table:table>/g,
      (tblXml) =>
        tblXml.replace(/<text:(?:p|h)\b[^>]*>[\s\S]*?<\/text:(?:p|h)>/g, (pXml) =>
          replaceInOdtParagraphXml(pXml, instructions, genericCounterRef, replacementsCount)
        )
    );

    zip.file('content.xml', updatedContentXml);
  }

  // 3. Pieds de page dans styles.xml
  if (stylesXml && stylesFile) {
    stylesXml = stylesXml.replace(/<style:footer\b[^>]*>[\s\S]*?<\/style:footer>/g, (footerXml) =>
      footerXml.replace(/<text:(?:p|h)\b[^>]*>[\s\S]*?<\/text:(?:p|h)>/g, (pXml) =>
        replaceInOdtParagraphXml(pXml, instructions, genericCounterRef, replacementsCount)
      )
    );
    zip.file('styles.xml', stylesXml);
  }

  const outBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });

  return {
    buffer: outBuffer,
    replacementsCount,
  };
}
