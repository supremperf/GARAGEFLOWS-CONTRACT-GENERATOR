import JSZip from 'jszip';
import { decodeXmlEntities, encodeXmlEntities } from '../document-parser/docx-parser';

export interface ReplacementInstruction {
  variableId: string;
  originalText: string;
  isGenericPositional: boolean;
  occurrenceIndex?: number; // 1-based index among generic positional variables
  value: string;
  canonicalField: string;
}

export interface DocxReplacementResult {
  buffer: Buffer;
  replacementsCount: Record<string, number>;
}

interface WtNode {
  fullMatchStart: number;
  fullMatchEnd: number;
  openTag: string;
  innerXml: string;
  decodedText: string;
  charStart: number;
  charEnd: number;
}

/**
 * Remplace du texte dans un paragraphe XML Word (<w:p>...</w:p>) même si une variable
 * ({{CLIENT_NOM}} ou XXX) est coupée sur plusieurs balises <w:r><w:t> par Word,
 * tout en préservant intégralement les styles <w:rPr>, polices, couleurs et mises en forme.
 */
function replaceInParagraphXml(
  pXml: string,
  replacerFn: (paragraphPlainText: string) => { newText: string; spanReplacements: { start: number; end: number; replacement: string }[] }
): string {
  const wtRegex = /(<w:t(?:\s+[^>]*)?>)([\s\S]*?)<\/w:t>/g;
  const nodes: WtNode[] = [];
  let match: RegExpExecArray | null;
  let charCursor = 0;

  while ((match = wtRegex.exec(pXml)) !== null) {
    const openTag = match[1];
    const innerXml = match[2];
    const decoded = decodeXmlEntities(innerXml);
    nodes.push({
      fullMatchStart: match.index,
      fullMatchEnd: match.index + match[0].length,
      openTag,
      innerXml,
      decodedText: decoded,
      charStart: charCursor,
      charEnd: charCursor + decoded.length,
    });
    charCursor += decoded.length;
  }

  if (nodes.length === 0) return pXml;

  const fullPlainText = nodes.map((n) => n.decodedText).join('');
  const { spanReplacements } = replacerFn(fullPlainText);
  if (spanReplacements.length === 0) return pXml;

  // Construire le nouveau texte de chaque noeud <w:t>
  const nodeChars: string[][] = nodes.map((n) => Array.from(n.decodedText));

  // Appliquer les remplacements de la fin vers le début pour préserver les indices de caractères
  const sortedSpans = [...spanReplacements].sort((a, b) => b.start - a.start);
  for (const span of sortedSpans) {
    let firstPlaced = false;
    for (let nIdx = 0; nIdx < nodes.length; nIdx++) {
      const node = nodes[nIdx];
      const overlapStart = Math.max(span.start, node.charStart);
      const overlapEnd = Math.min(span.end, node.charEnd);
      if (overlapStart < overlapEnd) {
        const localStart = overlapStart - node.charStart;
        const localLen = overlapEnd - overlapStart;
        if (!firstPlaced) {
          nodeChars[nIdx].splice(localStart, localLen, span.replacement);
          firstPlaced = true;
        } else {
          nodeChars[nIdx].splice(localStart, localLen);
        }
      }
    }
  }

  // Reconstruire le XML du paragraphe de la fin vers le début
  let updatedPXml = pXml;
  for (let nIdx = nodes.length - 1; nIdx >= 0; nIdx--) {
    const node = nodes[nIdx];
    const updatedDecoded = nodeChars[nIdx].join('');
    const encoded = encodeXmlEntities(updatedDecoded);
    const hasSpacePreserve = /xml:space="preserve"/.test(node.openTag);
    const openTag = hasSpacePreserve ? node.openTag : '<w:t xml:space="preserve">';
    const replacementTag = `${openTag}${encoded}</w:t>`;
    updatedPXml =
      updatedPXml.slice(0, node.fullMatchStart) +
      replacementTag +
      updatedPXml.slice(node.fullMatchEnd);
  }

  return updatedPXml;
}

export function formatSignatureDisplayValue(rawVal: string, labelFallback: string): string {
  if (!rawVal) return '';
  if (rawVal.startsWith('data:image/')) {
    return `[Signature électronique apposée — ${labelFallback}]`;
  }
  return rawVal;
}

/**
 * Moteur de remplacement ciblé pour un segment de texte, gérant à la fois :
 * - les variables nommées répétées ({{CLIENT_NOM}}, [NOM], {NOM})
 * - les variables génériques positionnelles (XXX n°1, XXX n°2...) dans l'ordre exact de lecture
 */
export function computeTextSpanReplacements(
  plainText: string,
  instructions: ReplacementInstruction[],
  genericCounterRef: { count: number },
  replacementsCount: Record<string, number>
): { newText: string; spanReplacements: { start: number; end: number; replacement: string }[] } {
  const spanReplacements: { start: number; end: number; replacement: string }[] = [];
  const occupied: [number, number][] = [];

  const isOccupied = (s: number, e: number) => occupied.some(([os, oe]) => s < oe && e > os);

  // 1. Variables nommées (non génériques) : triées de la plus longue à la plus courte pour éviter les collisions
  const namedInstructions = instructions
    .filter((i) => !i.isGenericPositional && i.originalText.length > 0)
    .sort((a, b) => b.originalText.length - a.originalText.length);

  for (const inst of namedInstructions) {
    let searchPos = 0;
    while (searchPos < plainText.length) {
      const idx = plainText.indexOf(inst.originalText, searchPos);
      if (idx === -1) break;
      const end = idx + inst.originalText.length;
      if (!isOccupied(idx, end)) {
        occupied.push([idx, end]);
        const formattedVal =
          inst.canonicalField.startsWith('SIGNATURE_')
            ? formatSignatureDisplayValue(inst.value, inst.canonicalField === 'SIGNATURE_CLIENT' ? 'Client' : 'GarageFlows')
            : inst.value;
        spanReplacements.push({
          start: idx,
          end,
          replacement: formattedVal,
        });
        replacementsCount[inst.variableId] = (replacementsCount[inst.variableId] || 0) + 1;
      }
      searchPos = end;
    }
  }

  // 2. Variables génériques positionnelles (XXX, XXXX, XXXXX, « À compléter », À compléter, [À compléter])
  const genericInstructions = instructions.filter((i) => i.isGenericPositional);
  if (genericInstructions.length > 0) {
    const genericRegex =
      /(?:«\s*À\s+compl[ée]ter\s*»|\[\s*À\s+compl[ée]ter\s*\]|À\s+compl[ée]ter|\[\s*X{2,}\s*\]|\{\s*X{2,}\s*\}|\bX{3,12}\b)/gi;
    let m: RegExpExecArray | null;
    while ((m = genericRegex.exec(plainText)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (isOccupied(start, end)) continue;

      genericCounterRef.count += 1;
      const currentIdx = genericCounterRef.count;
      const matchingInst = genericInstructions.find((gi) => gi.occurrenceIndex === currentIdx);
      if (matchingInst && matchingInst.value !== undefined && matchingInst.value !== '') {
        occupied.push([start, end]);
        const formattedVal =
          matchingInst.canonicalField.startsWith('SIGNATURE_')
            ? formatSignatureDisplayValue(matchingInst.value, 'Signataire')
            : matchingInst.value;
        spanReplacements.push({
          start,
          end,
          replacement: formattedVal,
        });
        replacementsCount[matchingInst.variableId] = (replacementsCount[matchingInst.variableId] || 0) + 1;
      }
    }
  }

  spanReplacements.sort((a, b) => a.start - b.start);
  let newText = plainText;
  for (let i = spanReplacements.length - 1; i >= 0; i--) {
    const sp = spanReplacements[i];
    newText = newText.slice(0, sp.start) + sp.replacement + newText.slice(sp.end);
  }

  return { newText, spanReplacements };
}

export async function replaceInDocxBuffer(
  originalBuffer: Buffer,
  instructions: ReplacementInstruction[]
): Promise<DocxReplacementResult> {
  // Toujours travailler sur une copie du buffer en mémoire
  const workingCopy = Buffer.from(originalBuffer);
  const zip = await JSZip.loadAsync(workingCopy);
  const replacementsCount: Record<string, number> = {};
  const genericCounterRef = { count: 0 };

  const processXmlParagraphs = (xmlContent: string): string => {
    return xmlContent.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (pXml) => {
      return replaceInParagraphXml(pXml, (plainText) =>
        computeTextSpanReplacements(plainText, instructions, genericCounterRef, replacementsCount)
      );
    });
  };

  // 1. En-têtes (dans le même ordre que le parseur)
  const headerFiles = Object.keys(zip.files).filter((f) => /^word\/header\d*\.xml$/.test(f));
  for (const hf of headerFiles) {
    const xml = await zip.file(hf)!.async('string');
    zip.file(hf, processXmlParagraphs(xml));
  }

  // 2. Document principal (d'abord paragraphes hors tableaux, puis paragraphes dans tableaux pour respecter l'ordre exact du parseur)
  const docFile = zip.file('word/document.xml');
  if (docFile) {
    const docXml = await docFile.async('string');

    // Repérer les plages des <w:tbl>
    const tableRanges: [number, number][] = [];
    const tblRegex = /<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tblRegex.exec(docXml)) !== null) {
      tableRanges.push([tm.index, tm.index + tm[0].length]);
    }
    const isInsideTable = (pos: number) => tableRanges.some(([s, e]) => pos >= s && pos < e);

    // Passe 2a : Paragraphes du corps (hors tableaux)
    let updatedDocXml = docXml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (pXml, offset: number) => {
      if (isInsideTable(offset)) return pXml;
      return replaceInParagraphXml(pXml, (plainText) =>
        computeTextSpanReplacements(plainText, instructions, genericCounterRef, replacementsCount)
      );
    });

    // Passe 2b : Paragraphes à l'intérieur des tableaux <w:tbl>
    updatedDocXml = updatedDocXml.replace(/<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g, (tblXml) => {
      return processXmlParagraphs(tblXml);
    });

    zip.file('word/document.xml', updatedDocXml);
  }

  // 3. Pieds de page
  const footerFiles = Object.keys(zip.files).filter((f) => /^word\/footer\d*\.xml$/.test(f));
  for (const ff of footerFiles) {
    const xml = await zip.file(ff)!.async('string');
    zip.file(ff, processXmlParagraphs(xml));
  }

  const outBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return {
    buffer: outBuffer,
    replacementsCount,
  };
}
