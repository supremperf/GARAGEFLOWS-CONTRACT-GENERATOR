import zlib from 'zlib';
import {
  PDFDocument,
  PDFName,
  PDFRawStream,
  rgb,
  StandardFonts,
} from 'pdf-lib';
import { FidelityIssue, PdfTextItem } from '../types';
import { parsePdfBuffer } from '../document-parser/pdf-parser';
import {
  computeTextSpanReplacements,
  ReplacementInstruction,
} from './docx-replacer';

export interface PdfReplacementResult {
  buffer: Buffer;
  replacementsCount: Record<string, number>;
  fidelityIssues: FidelityIssue[];
}

function escapePdfLiteralString(str: string): string {
  // Encodage WinAnsi (Latin-1) pour opérateurs PDF (Tj)
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (str[i] === '\\' || str[i] === '(' || str[i] === ')') {
      out += '\\' + str[i];
    } else if (code >= 32 && code <= 126) {
      out += str[i];
    } else if (code === 0x20ac) {
      // Symbole Euro € en WinAnsi = 0x80 (octal \200)
      out += '\\200';
    } else if (code >= 160 && code <= 255) {
      out += '\\' + code.toString(8).padStart(3, '0');
    } else if (code === 0x2019 || code === 0x2018) {
      out += "\\'";
    } else if (code === 0x2013 || code === 0x2014) {
      out += '-';
    } else {
      out += '?';
    }
  }
  return out;
}

function encodeWinAnsiHex(str: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code === 0x20ac) {
      bytes.push(0x80);
    } else if (code === 0x2019 || code === 0x2018) {
      bytes.push(0x27);
    } else if (code === 0x2013 || code === 0x2014) {
      bytes.push(0x2d);
    } else if (code <= 255) {
      bytes.push(code);
    } else {
      bytes.push(0x3f);
    }
  }
  return Buffer.from(bytes).toString('hex').toUpperCase();
}

function decodePdfContentToken(rawToken: string): string {
  if (rawToken.startsWith('<') && rawToken.endsWith('>')) {
    const hex = rawToken.slice(1, -1).replace(/\s+/g, '');
    const buf = Buffer.from(hex, 'hex');
    // Vérifier si UTF-16BE ou WinAnsi/Latin1
    if (buf.length >= 2 && buf[0] === 0 && buf[1] !== 0) {
      let s = '';
      for (let i = 0; i + 1 < buf.length; i += 2) {
        s += String.fromCharCode((buf[i] << 8) | buf[i + 1]);
      }
      return s;
    }
    let s = '';
    for (let i = 0; i < buf.length; i++) {
      const b = buf[i];
      s += b === 0x80 ? '€' : String.fromCharCode(b);
    }
    return s;
  }
  if (rawToken.startsWith('(') && rawToken.endsWith(')')) {
    return rawToken
      .slice(1, -1)
      .replace(/\\([0-7]{3})/g, (_, oct) => {
        const c = parseInt(oct, 8);
        return c === 0x80 ? '€' : String.fromCharCode(c);
      })
      .replace(/\\([()\\])/g, '$1');
  }
  return rawToken;
}

/**
 * Purger les opérateurs contenant les marqueurs originaux dans le flux binaire PDF décompressé
 * afin qu'aucune ancienne information ou variable ne reste récupérable dans le fichier PDF.
 */
function purgeAndReplaceInContentStream(
  streamText: string,
  tokensToPurge: Set<string>
): { updatedStream: string; purgedCount: number } {
  let purgedCount = 0;

  // Remplacer dans les opérateurs (...) Tj et <...> Tj et [...] TJ
  const updatedStream = streamText.replace(
    /(\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>)\s*Tj|\[((?:\\.|[^\]])*)\]\s*TJ/g,
    (fullOp, singleToken, tjArrayContent) => {
      if (singleToken) {
        const decoded = decodePdfContentToken(singleToken);
        for (const target of tokensToPurge) {
          if (decoded.includes(target)) {
            purgedCount += 1;
            return '() Tj';
          }
        }
        return fullOp;
      }
      if (tjArrayContent !== undefined) {
        const subTokens = tjArrayContent.match(/\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>/g) || [];
        const joined = subTokens.map(decodePdfContentToken).join('');
        for (const target of tokensToPurge) {
          if (joined.includes(target)) {
            purgedCount += 1;
            return '[] TJ';
          }
        }
      }
      return fullOp;
    }
  );

  return { updatedStream, purgedCount };
}

function decodePdfBytes(bytes: Buffer): string {
  let out = '';
  for (const b of bytes) {
    if (b === 0x92 || b === 0x91) out += "'";
    else if (b === 0x93 || b === 0x94) out += '"';
    else if (b === 0x96 || b === 0x97) out += '-';
    else if (b === 0x80) out += '€';
    else if (b === 0x85) out += '…';
    else out += String.fromCharCode(b);
  }
  return out;
}

function encodeWinAnsi(str: string): Buffer {
  const bytes: number[] = [];
  for (const ch of str) {
    const code = ch.codePointAt(0) || 63;
    if (code === 0x20ac) bytes.push(0x80);
    else if (code === 0x2019 || code === 0x2018 || code === 0x92) bytes.push(0x92);
    else if (code === 0x201c || code === 0x201d) bytes.push(0x94);
    else if (code === 0x2013) bytes.push(0x96);
    else if (code === 0x2014) bytes.push(0x97);
    else if (code === 0x0152) bytes.push(0x8c);
    else if (code === 0x0153) bytes.push(0x9c);
    else if (code === 0x2026) bytes.push(0x85);
    else if (code <= 255) bytes.push(code);
    else bytes.push(0x3f);
  }
  return Buffer.from(bytes);
}

function decodeShowingOperator(token: string): string {
  if (token.startsWith('<') && token.endsWith('>')) {
    const hex = token.slice(1, -1).replace(/\s+/g, '');
    if (hex.length % 2 !== 0) return '';
    return decodePdfBytes(Buffer.from(hex, 'hex'));
  }
  if (token.startsWith('(') && token.endsWith(')')) {
    const raw = token.slice(1, -1).replace(/\\([0-7]{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8))).replace(/\\([()\\])/g, '$1');
    return decodePdfBytes(Buffer.from(raw, 'latin1'));
  }
  return '';
}

function encodeShowingOperator(originalToken: string, text: string): string {
  const encoded = encodeWinAnsi(text);
  if (originalToken.startsWith('<')) {
    return `<${encoded.toString('hex').toUpperCase()}>`;
  }
  let literal = '';
  for (const b of encoded) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) literal += '\\' + String.fromCharCode(b);
    else if (b >= 32 && b <= 126) literal += String.fromCharCode(b);
    else literal += '\\' + b.toString(8).padStart(3, '0');
  }
  return `(${literal})`;
}

function rewriteContentStream(
  streamText: string,
  instructions: ReplacementInstruction[],
  genericCounterRef: { count: number },
  replacementsCount: Record<string, number>,
  fidelityIssues: FidelityIssue[],
  pageLabel: string
): string {
  const opRegex = /(?:\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>)\s*Tj|\[(?:\s*(?:\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>|-?\d+(?:\.\d+)?)\s*)*\]\s*TJ/g;
  return streamText.replace(/BT[\s\S]*?ET/g, (block) => {
    let changed = false;
    let growth = 1;
    const updated = block.replace(opRegex, (fullOp) => {
      const single = /^(<(?:[0-9A-Fa-f\s]+)>|\((?:\\.|[^\\()])*\))\s*Tj$/.exec(fullOp.trim());
      const tokens = single ? [single[1]] : fullOp.match(/<(?:[0-9A-Fa-f\s]+)>|\((?:\\.|[^\\()])*\)/g) || [];
      const originalText = tokens.map(decodeShowingOperator).join('');
      if (!originalText) return fullOp;
      const result = computeTextSpanReplacements(originalText, instructions, genericCounterRef, replacementsCount);
      if (result.spanReplacements.length === 0 || result.newText === originalText) return fullOp;
      changed = true;
      growth = Math.max(growth, result.newText.length / Math.max(1, originalText.length));
      if (single) return fullOp.replace(tokens[0], encodeShowingOperator(tokens[0], result.newText));
      const encoded = encodeShowingOperator(tokens[0], result.newText);
      const emptied = tokens.slice(1).map((token) => encodeShowingOperator(token, '')).join(' ');
      return `[${encoded} ${emptied}] TJ`;
    });
    if (!changed) return block;
    if (growth > 1.25) {
      fidelityIssues.push({
        severity: growth > 2 ? 'warning' : 'info',
        type: growth > 2 ? 'overflow' : 'font_scale',
        location: pageLabel,
        description: `Texte plus long que la variable d’origine. Taille de police ajustée (facteur ${growth.toFixed(2)}) pour limiter le débordement.`,
      });
      return updated.replace(/(\d+(?:\.\d+)?)\s+Tf/, (_m, size) => {
        const next = Math.max(7, Math.round((parseFloat(size) / Math.min(growth, 1.85)) * 10) / 10);
        return `${next} Tf`;
      });
    }
    return updated;
  });
}

function rewritePdfBytes(
  original: Buffer,
  instructions: ReplacementInstruction[],
  replacementsCount: Record<string, number>,
  fidelityIssues: FidelityIssue[]
): Buffer {
  const source = original.toString('latin1');
  const genericCounterRef = { count: 0 };
  const streamRe = /\/Length\s+(\d+)([\s\S]{0,240}?stream\r?\n)([\s\S]*?)(\r?\nendstream)/g;
  let match: RegExpExecArray | null;
  let cursor = 0;
  const chunks: string[] = [];
  let streamIndex = 0;

  while ((match = streamRe.exec(source)) !== null) {
    const lengthValue = match[1];
    const between = match[2];
    const rawText = match[3];
    const ending = match[4];
    const raw = Buffer.from(rawText, 'latin1');
    if (raw.length !== Number(lengthValue)) {
      continue;
    }
    chunks.push(source.slice(cursor, match.index));
    const isFlate = /\/FlateDecode/.test(between) || /\/FlateDecode/.test(source.slice(Math.max(0, match.index - 80), match.index));
    let plain = rawText;
    let compressible = false;
    try {
      if (isFlate) {
        plain = zlib.inflateSync(raw).toString('latin1');
        compressible = true;
      }
    } catch {
      chunks.push(match[0]);
      cursor = match.index + match[0].length;
      continue;
    }

    let nextPlain = plain;
    if (plain.includes('Tj') || plain.includes('TJ')) {
      streamIndex += 1;
      nextPlain = rewriteContentStream(plain, instructions, genericCounterRef, replacementsCount, fidelityIssues, `Flux PDF ${streamIndex}`);
    }
    const nextRaw = compressible ? zlib.deflateSync(Buffer.from(nextPlain, 'latin1')) : Buffer.from(nextPlain, 'latin1');
    chunks.push(`/Length ${nextRaw.length}${between}${nextRaw.toString('latin1')}${ending}`);
    cursor = match.index + match[0].length;
  }
  chunks.push(source.slice(cursor));
  return Buffer.from(chunks.join(''), 'latin1');
}

export async function replaceInPdfBuffer(
  originalBuffer: Buffer,
  instructions: ReplacementInstruction[],
  fileName: string = 'document.pdf'
): Promise<PdfReplacementResult> {
  const workingBuffer = Buffer.from(originalBuffer);
  const parsed = await parsePdfBuffer(workingBuffer, fileName);
  const replacementsCount: Record<string, number> = {};
  const fidelityIssues: FidelityIssue[] = [];

  if (parsed.isScanned) {
    fidelityIssues.push({
      severity: 'warning',
      type: 'format_limitation',
      location: 'Document complet',
      description:
        'PDF scanné détecté : génération d’un document PDF vectoriel haute lisibilité à partir du texte reconnu par OCR local. Les pixels de la police scannée d’origine ne peuvent pas être réécrits.',
    });
    return generateVectorPdfFromParagraphs(
      parsed.paragraphs.map((p) => p.text),
      instructions,
      replacementsCount,
      fidelityIssues
    );
  }

  let rewritten = rewritePdfBytes(workingBuffer, instructions, replacementsCount, fidelityIssues);
  const needsSignature = instructions.some((inst) => inst.canonicalField.startsWith('SIGNATURE_') && inst.value.startsWith('data:image/'));
  const hasForm = (parsed.pdfFormFields || []).length > 0;

  if (needsSignature || hasForm || Object.keys(replacementsCount).length === 0) {
    const pdfDoc = await PDFDocument.load(rewritten, { ignoreEncryption: true });
    try {
      const form = pdfDoc.getForm();
      for (const field of form.getFields()) {
        const fName = field.getName();
        const matched = instructions.find((i) => i.canonicalField === fName.toUpperCase() || i.originalText.includes(fName));
        if (matched && typeof (field as any).setText === 'function') {
          (field as any).setText(matched.value);
          replacementsCount[matched.variableId] = (replacementsCount[matched.variableId] || 0) + 1;
        }
      }
    } catch {
      // Pas de formulaire.
    }

    if (needsSignature) {
      const pages = pdfDoc.getPages();
      for (const inst of instructions) {
        if (!inst.canonicalField.startsWith('SIGNATURE_') || !inst.value.startsWith('data:image/')) continue;
        const item = (parsed.pdfItems || []).find((it) => it.text.includes(inst.originalText));
        if (!item) continue;
        try {
          const imgBuf = Buffer.from(inst.value.replace(/^data:image\/\w+;base64,/, ''), 'base64');
          const image = inst.value.startsWith('data:image/jpeg') ? await pdfDoc.embedJpg(imgBuf) : await pdfDoc.embedPng(imgBuf);
          pages[Math.max(0, item.page - 1)].drawImage(image, {
            x: item.x,
            y: Math.max(24, item.y - 40),
            width: 110,
            height: 36,
          });
        } catch {
          fidelityIssues.push({
            severity: 'warning',
            type: 'format_limitation',
            location: `Page ${item.page}`,
            description: 'La signature image n’a pas pu être incorporée ; le libellé textuel est conservé.',
          });
        }
      }
    }

    if (Object.keys(replacementsCount).length === 0 && (parsed.pdfItems || []).length > 0) {
      fidelityIssues.push({
        severity: 'warning',
        type: 'format_limitation',
        location: 'Contenu PDF',
        description:
          'Le texte vectoriel n’a pas pu être réécrit dans le flux d’origine. Un PDF vectoriel de secours est généré à partir du texte extrait, sans prétendre à une fidélité pixel par pixel.',
      });
      return generateVectorPdfFromParagraphs(
        parsed.paragraphs.map((p) => p.text),
        instructions,
        replacementsCount,
        fidelityIssues,
        { headers: parsed.headers, footers: parsed.footers, tables: parsed.tables.map((t) => t.rows) }
      );
    }

    rewritten = Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
  }

  return { buffer: rewritten, replacementsCount, fidelityIssues };
}

/**
 * Génère un document PDF vectoriel multi-pages propre à partir d'une liste de paragraphes/tableaux
 * (utilisé pour l'export PDF depuis DOCX, ODT, RTF, HTML, TXT, XLSX ou PDF scanné OCR).
 */
export async function generateVectorPdfFromParagraphs(
  paragraphs: string[],
  instructions: ReplacementInstruction[],
  replacementsCount: Record<string, number> = {},
  fidelityIssues: FidelityIssue[] = [],
  options?: {
    title?: string;
    tables?: string[][][];
    headers?: string[];
    footers?: string[];
    alreadyReplaced?: boolean;
    signatures?: { client?: string; entreprise?: string };
  }
): Promise<PdfReplacementResult> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28; // A4
  const pageHeight = 841.89;
  const marginX = 50;
  const maxLineWidth = pageWidth - marginX * 2;
  const genericCounterRef = { count: 0 };

  let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let cursorY = pageHeight - 55;

  const addNewPage = () => {
    currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
    cursorY = pageHeight - 55;
  };

  const wrapText = (text: string, font: typeof fontRegular, size: number, maxWidth: number): string[] => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';
    for (const w of words) {
      const candidate = currentLine ? `${currentLine} ${w}` : w;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        currentLine = candidate;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = w;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines.length > 0 ? lines : [''];
  };

  // En-tête éventuel
  if (options?.headers && options.headers.length > 0) {
    for (const h of options.headers) {
      const processed = options?.alreadyReplaced
        ? h
        : computeTextSpanReplacements(h, instructions, genericCounterRef, replacementsCount).newText;
      currentPage.drawText(processed, {
        x: marginX,
        y: cursorY,
        size: 9,
        font: fontBold,
        color: rgb(0.35, 0.4, 0.5),
      });
      cursorY -= 16;
    }
    cursorY -= 6;
  }

  for (const rawP of paragraphs) {
    const processed = options?.alreadyReplaced
      ? rawP
      : computeTextSpanReplacements(rawP, instructions, genericCounterRef, replacementsCount).newText;

    const isHeading =
      processed.toUpperCase() === processed &&
      processed.length > 3 &&
      processed.length < 90 &&
      /[A-ZÀ-Ÿ]/.test(processed);

    const fontSize = isHeading ? 12.5 : 10.5;
    const font = isHeading ? fontBold : fontRegular;
    const lineHeight = isHeading ? 18 : 15;

    if (isHeading) cursorY -= 6;

    const subLines = processed.split(/\r?\n/);
    for (const sub of subLines) {
      const wrapped = wrapText(sub, font, fontSize, maxLineWidth);
      for (const line of wrapped) {
        if (cursorY < 65) {
          addNewPage();
        }
        currentPage.drawText(line, {
          x: marginX,
          y: cursorY,
          size: fontSize,
          font,
          color: isHeading ? rgb(0.05, 0.12, 0.28) : rgb(0.1, 0.12, 0.16),
        });
        cursorY -= lineHeight;
      }
    }
    cursorY -= 6;
  }

  // Tableaux éventuels
  if (options?.tables && options.tables.length > 0) {
    for (const tbl of options.tables) {
      cursorY -= 8;
      for (let rIdx = 0; rIdx < tbl.length; rIdx++) {
        const row = tbl[rIdx];
        const colCount = Math.max(1, row.length);
        const colWidth = maxLineWidth / colCount;
        const rowHeight = 22;

        if (cursorY - rowHeight < 65) {
          addNewPage();
        }

        for (let cIdx = 0; cIdx < row.length; cIdx++) {
          const cellX = marginX + cIdx * colWidth;
          const cellText = options?.alreadyReplaced
            ? row[cIdx]
            : computeTextSpanReplacements(row[cIdx] || '', instructions, genericCounterRef, replacementsCount).newText;

          currentPage.drawRectangle({
            x: cellX,
            y: cursorY - rowHeight + 5,
            width: colWidth,
            height: rowHeight,
            borderColor: rgb(0.75, 0.78, 0.84),
            borderWidth: 0.7,
            color: rIdx === 0 ? rgb(0.94, 0.96, 0.99) : rgb(1, 1, 1),
          });

          const clipped = cellText.slice(0, 48);
          currentPage.drawText(clipped, {
            x: cellX + 5,
            y: cursorY - 10,
            size: 9,
            font: rIdx === 0 ? fontBold : fontRegular,
            color: rgb(0.1, 0.12, 0.16),
          });
        }
        cursorY -= rowHeight;
      }
      cursorY -= 10;
    }
  }

  // Signatures images éventuelles en bas de contrat
  if (options?.signatures && (options.signatures.client || options.signatures.entreprise)) {
    if (cursorY < 130) {
      addNewPage();
    }
    cursorY -= 15;
    if (options.signatures.entreprise && options.signatures.entreprise.startsWith('data:image/')) {
      try {
        const b64 = options.signatures.entreprise.replace(/^data:image\/\w+;base64,/, '');
        const img = await pdfDoc.embedPng(Buffer.from(b64, 'base64'));
        currentPage.drawText('Signature GarageFlows :', { x: marginX, y: cursorY, size: 9, font: fontBold });
        currentPage.drawImage(img, { x: marginX, y: cursorY - 48, width: 120, height: 42 });
      } catch {
        // ignore
      }
    }
    if (options.signatures.client && options.signatures.client.startsWith('data:image/')) {
      try {
        const b64 = options.signatures.client.replace(/^data:image\/\w+;base64,/, '');
        const img = await pdfDoc.embedPng(Buffer.from(b64, 'base64'));
        currentPage.drawText('Signature du Client :', { x: marginX + 260, y: cursorY, size: 9, font: fontBold });
        currentPage.drawImage(img, { x: marginX + 260, y: cursorY - 48, width: 120, height: 42 });
      } catch {
        // ignore
      }
    }
  }

  // Pieds de page
  if (options?.footers && options.footers.length > 0) {
    const pagesAll = pdfDoc.getPages();
    const footerJoined = options.footers.join(' — ');
    const processedFooter = options?.alreadyReplaced
      ? footerJoined
      : computeTextSpanReplacements(footerJoined, instructions, genericCounterRef, replacementsCount).newText;

    pagesAll.forEach((p, idx) => {
      p.drawText(`${processedFooter}  |  Page ${idx + 1}/${pagesAll.length}`, {
        x: marginX,
        y: 28,
        size: 8.5,
        font: fontRegular,
        color: rgb(0.45, 0.48, 0.54),
      });
    });
  }

  const outBytes = await pdfDoc.save({ useObjectStreams: false });
  return {
    buffer: Buffer.from(outBytes),
    replacementsCount,
    fidelityIssues,
  };
}
