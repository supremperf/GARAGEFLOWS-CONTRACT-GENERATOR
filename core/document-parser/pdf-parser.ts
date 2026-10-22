import { PDFDocument } from 'pdf-lib';
import { DocumentParagraph, DocumentTable, PdfTextItem } from '../types';
import { runLocalOcrOnBuffer } from '../ocr/ocr-engine';

export interface PdfParseOutput {
  fullText: string;
  paragraphs: DocumentParagraph[];
  tables: DocumentTable[];
  headers: string[];
  footers: string[];
  pdfItems: PdfTextItem[];
  pdfFormFields: string[];
  pageDimensions: { width: number; height: number }[];
  pageCount: number;
  isScanned: boolean;
  ocrApplied: boolean;
  ocrConfidence?: number;
  hasImages: boolean;
  imageCount: number;
  warnings: string[];
}

function ensurePdfJsPolyfills(): void {
  const g = globalThis as any;
  if (!g.DOMMatrix) {
    g.DOMMatrix = class DOMMatrix {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
      constructor(init?: number[]) {
        if (Array.isArray(init) && init.length >= 6) {
          [this.a, this.b, this.c, this.d, this.e, this.f] = init;
        }
      }
    };
  }
  if (!g.Path2D) g.Path2D = class Path2D {};
  if (!g.ImageData) {
    g.ImageData = class ImageData {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.data = new Uint8ClampedArray(width * height * 4);
      }
    };
  }
}

export async function parsePdfBuffer(buffer: Buffer, fileName: string): Promise<PdfParseOutput> {
  const warnings: string[] = [];
  const headerProbe = buffer.subarray(0, Math.min(1024, buffer.length)).toString('ascii');
  if (!headerProbe.includes('%PDF-')) {
    throw new Error('Document PDF invalide ou corrompu : en-tête %PDF- manquant.');
  }
  const pdfItems: PdfTextItem[] = [];
  const pageDimensions: { width: number; height: number }[] = [];
  const pdfFormFields: string[] = [];
  let pageCount = 1;
  let hasImages = false;
  let imageCount = 0;

  // 1. Inspection via pdf-lib (dimensions de page, champs AcroForm, objets XObject Image)
  try {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    pageCount = pdfDoc.getPageCount();
    for (let i = 0; i < pageCount; i++) {
      const p = pdfDoc.getPage(i);
      const { width, height } = p.getSize();
      pageDimensions.push({ width, height });
    }
    try {
      const form = pdfDoc.getForm();
      const fields = form.getFields();
      for (const f of fields) {
        pdfFormFields.push(f.getName());
      }
    } catch {
      // Pas de formulaire AcroForm
    }

    const rawPdfStr = buffer.toString('latin1');
    const imgMatches = rawPdfStr.match(/\/Subtype\s*\/Image\b/g);
    if (imgMatches && imgMatches.length > 0) {
      hasImages = true;
      imageCount = imgMatches.length;
    }
  } catch (err: any) {
    warnings.push(`Avertissement structure PDF : ${err?.message || 'lecture partielle'}`);
  }

  // 2. Extraction positionnelle haute précision via pdfjs-dist
  try {
    ensurePdfJsPolyfills();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- interop CJS requis pour pdfjs-dist legacy (Electron/Node)
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    if (pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    }
    const uint8 = new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({
      data: uint8,
      disableWorker: true,
      useSystemFonts: true,
      disableFontFace: true,
      verbosity: 0,
      isEvalSupported: false,
    });
    const doc = await loadingTask.promise;
    pageCount = doc.numPages;

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      if (!pageDimensions[pageNum - 1]) {
        pageDimensions[pageNum - 1] = { width: viewport.width, height: viewport.height };
      }
      const pageWidth = pageDimensions[pageNum - 1].width;
      const textContent = await page.getTextContent();

      const rawPageItems: {
        str: string;
        x: number;
        y: number;
        width: number;
        height: number;
        fontSize: number;
        fontName: string;
      }[] = [];

      for (const item of textContent.items as any[]) {
        if (typeof item.str !== 'string' || item.str.length === 0) continue;
        const tx = item.transform || [12, 0, 0, 12, 0, 0];
        const fontSize = Math.max(6, Math.round(Math.hypot(tx[0], tx[1]) * 10) / 10);
        const x = Math.round(tx[4] * 100) / 100;
        const y = Math.round(tx[5] * 100) / 100;
        const width = Math.round((item.width || item.str.length * fontSize * 0.52) * 100) / 100;
        const height = Math.round((item.height || fontSize) * 100) / 100;
        rawPageItems.push({
          str: item.str,
          x,
          y,
          width,
          height,
          fontSize,
          fontName: item.fontName || 'Helvetica',
        });
      }

      // Trier du haut vers le bas (y décroissant en coordonnées PDF) puis de gauche à droite (x croissant)
      rawPageItems.sort((a, b) => {
        if (Math.abs(b.y - a.y) > 3) return b.y - a.y;
        return a.x - b.x;
      });

      for (let i = 0; i < rawPageItems.length; i++) {
        const current = rawPageItems[i];
        // Calculer la largeur disponible jusqu'au prochain bloc sur la même ligne ou jusqu'à la marge droite (40pt)
        let availableWidth = Math.max(60, pageWidth - current.x - 40);
        for (let j = i + 1; j < rawPageItems.length; j++) {
          const next = rawPageItems[j];
          if (Math.abs(next.y - current.y) <= 3 && next.x > current.x + current.width + 4) {
            availableWidth = next.x - current.x - 4;
            break;
          }
        }
        pdfItems.push({
          page: pageNum,
          text: current.str,
          x: current.x,
          y: current.y,
          width: current.width,
          height: current.height,
          fontSize: current.fontSize,
          fontName: current.fontName,
          availableWidth: Math.round(availableWidth * 100) / 100,
        });
      }
    }
  } catch (err: any) {
    warnings.push(`Avertissement extraction PDF.js : ${err?.message || 'fallback flux PDF'}`);
  }

  // 3. Regroupement des PdfTextItem en lignes et paragraphes
  const paragraphs: DocumentParagraph[] = [];
  const headers: string[] = [];
  const footers: string[] = [];
  const tables: DocumentTable[] = [];

  if (pdfItems.length > 0) {
    let pIndex = 0;
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const itemsOnPage = pdfItems.filter((it) => it.page === pageNum);
      const pageHeight = pageDimensions[pageNum - 1]?.height || 842;

      const lines: { y: number; items: PdfTextItem[] }[] = [];
      for (const item of itemsOnPage) {
        const existingLine = lines.find((l) => Math.abs(l.y - item.y) <= 3.5);
        if (existingLine) {
          existingLine.items.push(item);
        } else {
          lines.push({ y: item.y, items: [item] });
        }
      }

      lines.sort((a, b) => b.y - a.y);

      for (const line of lines) {
        line.items.sort((a, b) => a.x - b.x);
        let lineText = '';
        for (let k = 0; k < line.items.length; k++) {
          const cur = line.items[k];
          if (k > 0) {
            const prev = line.items[k - 1];
            const gap = cur.x - (prev.x + prev.width);
            if (gap > 2 && !prev.text.endsWith(' ') && !cur.text.startsWith(' ')) {
              lineText += ' ';
            }
          }
          lineText += cur.text;
        }
        const trimmed = lineText.trim();
        if (!trimmed) continue;

        if (line.y > pageHeight - 45) {
          headers.push(trimmed);
        } else if (line.y < 45) {
          footers.push(trimmed);
        } else {
          paragraphs.push({
            index: pIndex++,
            text: trimmed,
            section: 'body',
          });
        }
      }
    }
  }

  // 4. Détection de PDF scanné (aucun texte vectoriel ou moins de 15 caractères)
  const totalExtractedChars = paragraphs.reduce((acc, p) => acc + p.text.length, 0) + headers.join('').length;
  const isScanned = totalExtractedChars < 15 && pdfFormFields.length === 0;
  let ocrApplied = false;
  let ocrConfidence: number | undefined;

  if (isScanned) {
    const ocrRes = await runLocalOcrOnBuffer(buffer, fileName);
    ocrApplied = true;
    ocrConfidence = ocrRes.confidence;
    warnings.push(...ocrRes.warnings);

    ocrRes.lines.forEach((line, idx) => {
      paragraphs.push({
        index: idx,
        text: line,
        section: 'body',
      });
    });
  }

  const fullText = [
    ...headers,
    ...paragraphs.map((p) => p.text),
    ...footers,
  ].join('\n');

  return {
    fullText,
    paragraphs,
    tables,
    headers,
    footers,
    pdfItems,
    pdfFormFields,
    pageDimensions,
    pageCount,
    isScanned,
    ocrApplied,
    ocrConfidence,
    hasImages,
    imageCount,
    warnings,
  };
}
