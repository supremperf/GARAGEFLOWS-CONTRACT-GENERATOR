import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  CustomVariableDefinition,
  DocumentFormat,
  ExportFormat,
  ParsedDocument,
} from '../types';
import { parseDocxBuffer } from './docx-parser';
import { parseOdtBuffer } from './odt-parser';
import { parsePdfBuffer } from './pdf-parser';
import { parseSpreadsheetBuffer } from './xlsx-parser';
import {
  parseHtmlBuffer,
  parseLegacyDocBuffer,
  parsePptxBuffer,
  parseRtfBuffer,
  parseTxtBuffer,
} from './text-parser';
import { runLocalOcrOnBuffer } from '../ocr/ocr-engine';
import { detectDocumentVariables } from '../variable-detection/detector';

const SUPPORTED_FORMATS = new Set<DocumentFormat>([
  'pdf', 'docx', 'doc', 'odt', 'rtf', 'txt', 'html',
  'xlsx', 'xls', 'ods', 'csv', 'pptx',
  'png', 'jpg', 'jpeg', 'tiff',
]);

export function detectFormatFromFileName(fileName: string): DocumentFormat {
  const ext = path.extname(fileName).toLowerCase().replace('.', '') as DocumentFormat;
  if (!SUPPORTED_FORMATS.has(ext)) {
    throw new Error(
      `Format de fichier non pris en charge (.${ext || 'inconnu'}). Formats acceptés : PDF, DOCX, DOC, ODT, RTF, TXT, HTML, XLSX, XLS, ODS, CSV, PPTX, PNG, JPG, JPEG, TIFF.`
    );
  }
  return ext;
}

export function getSupportedExportsForFormat(
  format: DocumentFormat,
  isScanned: boolean
): {
  supportedExports: ExportFormat[];
  supportLevel: 'full' | 'partial' | 'ocr-assisted';
  limitations: string[];
} {
  switch (format) {
    case 'docx':
      return {
        supportedExports: ['docx', 'pdf', 'odt', 'rtf', 'html', 'txt'],
        supportLevel: 'full',
        limitations: [],
      };
    case 'odt':
      return {
        supportedExports: ['odt', 'pdf', 'docx', 'rtf', 'html', 'txt'],
        supportLevel: 'full',
        limitations: [],
      };
    case 'pdf':
      if (isScanned) {
        return {
          supportedExports: ['pdf', 'docx', 'txt'],
          supportLevel: 'ocr-assisted',
          limitations: [
            'Ce PDF est un document scanné (image). La reconnaissance optique (OCR local) extrait le texte et génère un contrat structuré ou superposé vérifié, mais ne peut pas modifier les pixels de la police scannée d’origine.',
          ],
        };
      }
      return {
        supportedExports: ['pdf', 'docx', 'html', 'txt'],
        supportLevel: 'full',
        limitations: [
          'Le remplacement direct dans un PDF conserve les positions exactes (x, y) et ajuste automatiquement la taille de police en cas de valeur plus longue.',
        ],
      };
    case 'xlsx':
      return {
        supportedExports: ['xlsx', 'pdf', 'csv', 'html'],
        supportLevel: 'full',
        limitations: [],
      };
    case 'xls':
    case 'ods':
      return {
        supportedExports: ['xlsx', 'pdf', 'csv', 'html'],
        supportLevel: 'full',
        limitations: [
          `Les tableurs .${format.toUpperCase()} sont exportables en .XLSX, .PDF, .CSV et .HTML en conservant les données et formules.`,
        ],
      };
    case 'csv':
      return {
        supportedExports: ['csv', 'xlsx', 'pdf', 'txt'],
        supportLevel: 'full',
        limitations: [],
      };
    case 'rtf':
      return {
        supportedExports: ['rtf', 'pdf', 'docx', 'odt', 'html', 'txt'],
        supportLevel: 'full',
        limitations: [],
      };
    case 'html':
      return {
        supportedExports: ['html', 'pdf', 'docx', 'odt', 'rtf', 'txt'],
        supportLevel: 'full',
        limitations: [],
      };
    case 'txt':
      return {
        supportedExports: ['txt', 'pdf', 'docx', 'odt', 'rtf', 'html'],
        supportLevel: 'full',
        limitations: [],
      };
    case 'pptx':
      return {
        supportedExports: ['pdf', 'docx', 'txt'],
        supportLevel: 'partial',
        limitations: [
          'Les présentations PPTX permettent l’analyse et le remplacement des variables dans les diapositives ainsi que l’export en PDF ou DOCX.',
        ],
      };
    case 'doc':
      return {
        supportedExports: ['docx', 'pdf', 'rtf', 'txt'],
        supportLevel: 'partial',
        limitations: [
          'Le format binaire historique .DOC (Word 97-2003) est converti localement vers .DOCX / .PDF. Pour une conservation absolue des tableaux complexes, utilisez .DOCX.',
        ],
      };
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'tiff':
      return {
        supportedExports: ['pdf', 'docx', 'txt'],
        supportLevel: 'ocr-assisted',
        limitations: [
          `Le fichier image (.${format.toUpperCase()}) est analysé par le moteur OCR local. L’export génère un contrat PDF ou DOCX exploitable à partir du texte reconnu.`,
        ],
      };
  }
}

export function computeStructuralFingerprint(fullText: string, tableCount: number, format: DocumentFormat): string {
  const skeleton = fullText
    .replace(/\{\{[^}]+\}\}/g, '{{VAR}}')
    .replace(/\bX{3,12}\b/g, 'XXX')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return crypto
    .createHash('sha256')
    .update(`${format}::tables=${tableCount}::${skeleton}`)
    .digest('hex')
    .slice(0, 32);
}

export async function parseDocumentFile(
  filePath: string,
  customDefinitions: CustomVariableDefinition[] = []
): Promise<ParsedDocument> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fichier introuvable ou inaccessible : ${filePath}`);
  }
  const stat = fs.statSync(filePath);
  if (stat.size === 0) {
    throw new Error(`Le document importé est vide (0 octet) : ${path.basename(filePath)}`);
  }
  if (stat.size > 100 * 1024 * 1024) {
    throw new Error(`Le fichier dépasse la taille maximale autorisée de 100 Mo.`);
  }

  const buffer = fs.readFileSync(filePath);
  return parseDocumentBuffer(buffer, path.basename(filePath), filePath, customDefinitions);
}

export async function parseDocumentBuffer(
  buffer: Buffer,
  fileName: string,
  filePath: string = fileName,
  customDefinitions: CustomVariableDefinition[] = []
): Promise<ParsedDocument> {
  if (!buffer || buffer.length === 0) {
    throw new Error(`Document illisible ou vide : ${fileName}`);
  }

  const format = detectFormatFromFileName(fileName);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  let fullText = '';
  let paragraphs: ParsedDocument['paragraphs'] = [];
  let tables: ParsedDocument['tables'] = [];
  let headers: string[] = [];
  let footers: string[] = [];
  let sheets: ParsedDocument['sheets'] = undefined;
  let pdfItems: ParsedDocument['pdfItems'] = undefined;
  let pdfFormFields: string[] | undefined = undefined;
  let pageDimensions: { width: number; height: number }[] | undefined = undefined;
  let pageCount = 1;
  let isScanned = false;
  let ocrApplied = false;
  let ocrConfidence: number | undefined = undefined;
  let hasImages = false;
  let imageCount = 0;
  const warnings: string[] = [];

  try {
    if (format === 'docx') {
      const res = await parseDocxBuffer(buffer);
      fullText = res.fullText;
      paragraphs = res.paragraphs;
      tables = res.tables;
      headers = res.headers;
      footers = res.footers;
      pageCount = res.pageCount;
      hasImages = res.hasImages;
      imageCount = res.imageCount;
      warnings.push(...res.warnings);
    } else if (format === 'odt') {
      const res = await parseOdtBuffer(buffer);
      fullText = res.fullText;
      paragraphs = res.paragraphs;
      tables = res.tables;
      headers = res.headers;
      footers = res.footers;
      pageCount = res.pageCount;
      hasImages = res.hasImages;
      imageCount = res.imageCount;
      warnings.push(...res.warnings);
    } else if (format === 'pdf') {
      const res = await parsePdfBuffer(buffer, fileName);
      fullText = res.fullText;
      paragraphs = res.paragraphs;
      tables = res.tables;
      headers = res.headers;
      footers = res.footers;
      pdfItems = res.pdfItems;
      pdfFormFields = res.pdfFormFields;
      pageDimensions = res.pageDimensions;
      pageCount = res.pageCount;
      isScanned = res.isScanned;
      ocrApplied = res.ocrApplied;
      ocrConfidence = res.ocrConfidence;
      hasImages = res.hasImages;
      imageCount = res.imageCount;
      warnings.push(...res.warnings);
    } else if (format === 'xlsx' || format === 'xls' || format === 'ods' || format === 'csv') {
      const res = await parseSpreadsheetBuffer(buffer, format);
      fullText = res.fullText;
      paragraphs = res.paragraphs;
      tables = res.tables;
      sheets = res.sheets;
      hasImages = res.hasImages;
      imageCount = res.imageCount;
      warnings.push(...res.warnings);
    } else if (format === 'rtf') {
      const res = parseRtfBuffer(buffer);
      fullText = res.fullText;
      paragraphs = res.paragraphs;
      hasImages = res.hasImages;
      imageCount = res.imageCount;
      warnings.push(...res.warnings);
    } else if (format === 'html') {
      const res = parseHtmlBuffer(buffer);
      fullText = res.fullText;
      paragraphs = res.paragraphs;
      tables = res.tables;
      hasImages = res.hasImages;
      imageCount = res.imageCount;
      warnings.push(...res.warnings);
    } else if (format === 'txt') {
      const res = parseTxtBuffer(buffer);
      fullText = res.fullText;
      paragraphs = res.paragraphs;
      pageCount = res.pageCount;
      warnings.push(...res.warnings);
    } else if (format === 'pptx') {
      const res = await parsePptxBuffer(buffer);
      fullText = res.fullText;
      paragraphs = res.paragraphs;
      pageCount = res.pageCount;
      hasImages = res.hasImages;
      imageCount = res.imageCount;
      warnings.push(...res.warnings);
    } else if (format === 'doc') {
      const res = parseLegacyDocBuffer(buffer);
      fullText = res.fullText;
      paragraphs = res.paragraphs;
      warnings.push(...res.warnings);
    } else if (format === 'png' || format === 'jpg' || format === 'jpeg' || format === 'tiff') {
      isScanned = true;
      ocrApplied = true;
      hasImages = true;
      imageCount = 1;
      const ocrRes = await runLocalOcrOnBuffer(buffer, fileName);
      fullText = ocrRes.text;
      ocrConfidence = ocrRes.confidence;
      paragraphs = ocrRes.lines.map((line, index) => ({
        index,
        text: line,
        section: 'body',
      }));
      warnings.push(...ocrRes.warnings);
    }
  } catch (err: any) {
    throw new Error(`Document illisible ou corrompu (${fileName}) : ${err?.message || 'Erreur interne de lecture'}`, { cause: err });
  }

  const detectedVariables = detectDocumentVariables({
    paragraphs: sheets ? [] : paragraphs,
    tables: sheets ? [] : tables,
    headers,
    footers,
    sheets,
    pdfItems,
    customDefinitions,
  });

  if (detectedVariables.length === 0) {
    warnings.push(
      'Aucune variable automatique détectée dans ce document. Vous pouvez ajouter des règles de remplacement manuelles dans l’éditeur de variables.'
    );
  }

  const { supportedExports, supportLevel, limitations } = getSupportedExportsForFormat(format, isScanned);
  const structuralFingerprint = computeStructuralFingerprint(fullText, tables.length, format);

  return {
    format,
    fileName,
    filePath,
    fileSize: buffer.length,
    sha256,
    structuralFingerprint,
    pageCount,
    isScanned,
    ocrApplied,
    ocrConfidence,
    fullText,
    paragraphs,
    tables,
    headers,
    footers,
    sheets,
    pdfItems,
    pdfFormFields,
    pageDimensions,
    hasImages,
    imageCount,
    detectedVariables,
    supportedExports,
    supportLevel,
    warnings,
    limitations,
  };
}
