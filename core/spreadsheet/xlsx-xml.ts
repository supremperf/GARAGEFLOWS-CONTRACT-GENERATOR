/**
 * Moteur XLSX interne (lecture + génération), fondé sur JSZip et l'analyse XML
 * du format Office Open XML. Remplace SheetJS (xlsx@0.18.5, GHSA-4r6h-8v6p-xvw6
 * et GHSA-5pgg-2g8v-p4x9 sans correctif publié sur npm) :
 *  - lecture : classeurs, feuilles, cellules, formules, chaînes partagées,
 *    dates (formats numériques de date), types de base ;
 *  - écriture : génération d'un classeur valide à partir de tableaux de chaînes ;
 *  - les gardes anti zip-bomb de document-parser/guards restent appliquées
 *    par l'appelant (assertZipWithinLimits) avant toute extraction.
 */
import zlib from 'zlib';
import JSZip from 'jszip';
import { decodeXmlEntities, encodeXmlEntities } from '../document-parser/docx-parser';
import { SpreadsheetCell, SpreadsheetSheet } from '../types';

const BUILTIN_DATE_FORMATS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  45, 46, 47, 50, 57,
]);

function isDateFormatCode(code: string): boolean {
  const cleaned = code.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '');
  return /(^|[^a-zA-Z])(y{1,4}|m{1,4}|d{1,4}|h{1,2}|s{1,2})([^a-zA-Z]|$)/i.test(cleaned) || /aaaa|jj/i.test(cleaned);
}

/** Convertit un numéro de série Excel en date ISO (UTC, base 1899-12-30). */
export function excelSerialToIso(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return String(serial);
  const iso = date.toISOString();
  return serial % 1 === 0 ? iso.slice(0, 10) : iso.replace('T', ' ').slice(0, 19);
}

export function columnNameToIndex(name: string): number {
  let idx = 0;
  for (const ch of name.toUpperCase()) idx = idx * 26 + (ch.charCodeAt(0) - 64);
  return idx - 1;
}

export function indexToColumnName(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

interface SheetRef { name: string; path: string }

async function resolveSheets(zip: JSZip): Promise<SheetRef[]> {
  const workbookFile = zip.file('xl/workbook.xml');
  if (!workbookFile) throw new Error('Classeur XLSX invalide : xl/workbook.xml introuvable.');
  const workbookXml = await workbookFile.async('string');

  const rels = new Map<string, string>();
  const relsFile = zip.file('xl/_rels/workbook.xml.rels');
  if (relsFile) {
    const relsXml = await relsFile.async('string');
    for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
      const id = /\bId="([^"]+)"/.exec(m[0])?.[1];
      const target = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
      if (id && target) rels.set(id, target);
    }
  }

  const sheets: SheetRef[] = [];
  for (const m of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    const name = /\bname="([^"]*)"/.exec(m[0])?.[1] ?? `Feuille ${sheets.length + 1}`;
    const rid = /\br:id="([^"]+)"/.exec(m[0])?.[1];
    let target = rid ? rels.get(rid) : undefined;
    if (!target) target = `worksheets/sheet${sheets.length + 1}.xml`;
    const normalized = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    sheets.push({ name: decodeXmlEntities(name), path: normalized });
  }
  if (sheets.length === 0) throw new Error('Classeur XLSX invalide : aucune feuille déclarée.');
  return sheets;
}

async function readSharedStrings(zip: JSZip): Promise<string[]> {
  const file = zip.file('xl/sharedStrings.xml');
  if (!file) return [];
  const xml = await file.async('string');
  const strings: string[] = [];
  for (const si of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const parts: string[] = [];
    for (const t of si[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) parts.push(decodeXmlEntities(t[1]));
    strings.push(parts.join(''));
  }
  return strings;
}

async function readDateStyleIndexes(zip: JSZip): Promise<Set<number>> {
  const dateIndexes = new Set<number>();
  const file = zip.file('xl/styles.xml');
  if (!file) return dateIndexes;
  const xml = await file.async('string');

  const customFormats = new Map<number, string>();
  for (const m of xml.matchAll(/<numFmt\b[^>]*>/g)) {
    const id = Number(/\bnumFmtId="(\d+)"/.exec(m[0])?.[1]);
    const code = /\bformatCode="([^"]*)"/.exec(m[0])?.[1];
    if (Number.isFinite(id) && code) customFormats.set(id, decodeXmlEntities(code));
  }

  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? '';
  const xfList = [...cellXfs.matchAll(/<xf\b[^>]*>/g)].map((m) => Number(/\bnumFmtId="(\d+)"/.exec(m[0])?.[1] ?? 0));
  xfList.forEach((numFmtId, xfIndex) => {
    if (BUILTIN_DATE_FORMATS.has(numFmtId)) dateIndexes.add(xfIndex);
    else if (customFormats.has(numFmtId) && isDateFormatCode(customFormats.get(numFmtId) as string)) dateIndexes.add(xfIndex);
  });
  return dateIndexes;
}

export async function readXlsxSheets(zip: JSZip): Promise<SpreadsheetSheet[]> {
  const [sheetRefs, sharedStrings, dateStyleIndexes] = await Promise.all([
    resolveSheets(zip),
    readSharedStrings(zip),
    readDateStyleIndexes(zip),
  ]);

  const sheets: SpreadsheetSheet[] = [];
  for (const ref of sheetRefs) {
    const file = zip.file(ref.path);
    if (!file) continue;
    const xml = await file.async('string');
    const cells: SpreadsheetCell[] = [];
    let maxRow = 0;
    let maxCol = 0;

    for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
      const rowInner = rowMatch[2] ?? '';
      let fallbackCol = 0;
      for (const cellMatch of rowInner.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cellMatch[1];
        const inner = cellMatch[2] ?? '';
        const address = /\br="([A-Z]+\d+)"/i.exec(attrs)?.[1]?.toUpperCase();
        const colFromAddr = address ? columnNameToIndex(address.replace(/\d+/g, '')) : fallbackCol;
        const rowFromAddr = address ? Number(address.replace(/\D+/g, '')) - 1 : 0;
        const col = Number.isFinite(colFromAddr) ? colFromAddr : fallbackCol;
        const row = Number.isFinite(rowFromAddr) ? rowFromAddr : 0;
        fallbackCol = col + 1;

        const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? '';
        const styleIdx = Number(/\bs="(\d+)"/.exec(attrs)?.[1] ?? -1);
        const formulaRaw = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(inner)?.[1];
        const formula = formulaRaw !== undefined ? decodeXmlEntities(formulaRaw) : undefined;
        const vRaw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];

        let value = '';
        let dataType = type || 's';
        if (type === 's' && vRaw !== undefined) {
          value = sharedStrings[Number(vRaw)] ?? '';
        } else if (type === 'inlineStr' || /<is\b/.test(inner)) {
          const parts: string[] = [];
          for (const t of inner.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) parts.push(decodeXmlEntities(t[1]));
          value = parts.join('');
        } else if (type === 'b') {
          value = vRaw === '1' ? 'TRUE' : 'FALSE';
        } else if (vRaw !== undefined) {
          const decoded = decodeXmlEntities(vRaw);
          const numeric = Number(decoded);
          if (type !== 'str' && decoded.trim() !== '' && Number.isFinite(numeric) && dateStyleIndexes.has(styleIdx)) {
            value = excelSerialToIso(numeric);
            dataType = 'd';
          } else {
            value = decoded;
            if (type === '') dataType = 'n';
          }
        }

        if (value || formula) {
          cells.push({
            address: address ?? `${indexToColumnName(col)}${row + 1}`,
            row,
            col,
            value,
            formula,
            dataType,
          });
        }
        if (row + 1 > maxRow) maxRow = row + 1;
        if (col + 1 > maxCol) maxCol = col + 1;
      }
    }

    sheets.push({ name: ref.name, cells, rowCount: maxRow, colCount: maxCol });
  }
  return sheets;
}

// ---------------- Génération d'un classeur XLSX minimal valide ----------------

function crc32(buf: Buffer): number {
  let table = (crc32 as { table?: Int32Array }).table;
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    (crc32 as { table?: Int32Array }).table = table;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Assemble un zip synchrone (compression DEFLATE) — suffisant pour un XLSX valide. */
export function buildZipSync(entries: { name: string; data: Buffer }[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const compressed = zlib.deflateRawSync(entry.data, { level: 6 });
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8
    local.writeUInt16LE(8, 8); // DEFLATE
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, compressed);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(entry.data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cd, nameBuf]));

    offset += local.length + nameBuf.length + compressed.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, end]);
}

function sanitizeSheetName(name: string, index: number): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, '_').slice(0, 31).trim();
  return cleaned || `Feuille_${index + 1}`;
}

function sheetXml(rows: string[][]): string {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          const ref = `${indexToColumnName(c)}${r + 1}`;
          if (value === '') return `<c r="${ref}"/>`;
          const numeric = Number(value);
          if (value.trim() !== '' && Number.isFinite(numeric) && !/^[+]-/.test(value)) {
            return `<c r="${ref}"><v>${numeric}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${encodeXmlEntities(value)}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

/** Génère un classeur XLSX valide depuis des feuilles de tableaux de chaînes. */
export function buildXlsxFromSheets(sheets: { name: string; rows: string[][] }[]): Buffer {
  const names = sheets.map((s, i) => sanitizeSheetName(s.name, i));
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${encodeXmlEntities(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`;

  return buildZipSync([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rootRels, 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(workbook, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRels, 'utf8') },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: Buffer.from(sheetXml(s.rows), 'utf8') })),
  ]);
}
