/**
 * Moteur ODS interne (lecture du contenu tabulaire), fondé sur JSZip et
 * l'analyse de `content.xml` (OpenDocument). Remplace la partie ODS de
 * SheetJS (xlsx@0.18.5 vulnérable, sans correctif npm) :
 * feuilles, lignes, cellules, formules (attribut table:formula) et valeurs
 * typées (office:value / date-value / string-value / boolean-value).
 */
import JSZip from 'jszip';
import { decodeXmlEntities } from '../document-parser/docx-parser';
import { SpreadsheetCell, SpreadsheetSheet } from '../types';
import { indexToColumnName } from './xlsx-xml';

const MAX_EXPANDED_ROWS = 5000;
const MAX_EXPANDED_COLS = 256;

function stripTags(xml: string): string {
  return decodeXmlEntities(xml.replace(/<[^>]+>/g, ''));
}

function cellText(cellInner: string): string {
  const paragraphs: string[] = [];
  for (const p of cellInner.matchAll(/<text:p\b[^>]*>([\s\S]*?)<\/text:p>/g)) {
    paragraphs.push(stripTags(p[1]));
  }
  if (paragraphs.length === 0 && cellInner.trim()) return stripTags(cellInner);
  return paragraphs.join(' ');
}

function repeatCount(attrs: string, attr: string): number {
  const n = Number(new RegExp(`${attr}="(\\d+)"`).exec(attrs)?.[1] ?? 1);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export async function readOdsSheets(zip: JSZip): Promise<SpreadsheetSheet[]> {
  const contentFile = zip.file('content.xml');
  if (!contentFile) throw new Error('Classeur ODS invalide : content.xml introuvable.');
  const xml = await contentFile.async('string');

  const sheets: SpreadsheetSheet[] = [];
  for (const tableMatch of xml.matchAll(/<table:table\b([^>]*)>([\s\S]*?)<\/table:table>/g)) {
    const name = decodeXmlEntities(/\btable:name="([^"]*)"/.exec(tableMatch[1])?.[1] ?? `Feuille ${sheets.length + 1}`);
    const cells: SpreadsheetCell[] = [];
    let maxRow = 0;
    let maxCol = 0;
    let rowIdx = 0;

    for (const rowMatch of tableMatch[2].matchAll(/<table:table-row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:table-row>)/g)) {
      const rowRepeat = Math.min(repeatCount(rowMatch[1], 'table:number-rows-repeated'), MAX_EXPANDED_ROWS);
      const rowInner = rowMatch[2] ?? '';
      const parsedRow: Omit<SpreadsheetCell, 'row' | 'address'>[] = [];

      for (const cellMatch of rowInner.matchAll(/<table:table-cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:table-cell>)|<table:covered-table-cell\b[^>]*?(?:\/>|>[\s\S]*?<\/table:covered-table-cell>)/g)) {
        const attrs = cellMatch[1] ?? '';
        const inner = cellMatch[2] ?? '';
        const colRepeat = Math.min(repeatCount(attrs, 'table:number-columns-repeated'), MAX_EXPANDED_COLS);

        const formulaAttr = /\btable:formula="([^"]*)"/.exec(attrs)?.[1];
        const formula = formulaAttr ? decodeXmlEntities(formulaAttr).replace(/^(of:|oooc:)?=/, '') : undefined;
        const dateValue = /\boffice:date-value="([^"]*)"/.exec(attrs)?.[1];
        const numValue = /\boffice:value="([^"]*)"/.exec(attrs)?.[1];
        const strValue = /\boffice:string-value="([^"]*)"/.exec(attrs)?.[1];
        const boolValue = /\boffice:boolean-value="([^"]*)"/.exec(attrs)?.[1];
        const valueType = /\boffice:value-type="([^"]*)"/.exec(attrs)?.[1] ?? '';

        const value = dateValue ?? numValue ?? strValue ?? (boolValue ? (boolValue === 'true' ? 'TRUE' : 'FALSE') : cellText(inner));
        const dataType = valueType === 'date' ? 'd' : valueType === 'float' || valueType === 'percentage' || valueType === 'currency' ? 'n' : valueType === 'boolean' ? 'b' : 's';

        for (let k = 0; k < colRepeat; k++) {
          parsedRow.push({ col: 0, value: k === 0 ? value : value, formula: k === 0 ? formula : undefined, dataType });
        }
      }

      for (let r = 0; r < rowRepeat && rowIdx + r < MAX_EXPANDED_ROWS; r++) {
        parsedRow.forEach((cell, c) => {
          if (cell.value || cell.formula) {
            cells.push({
              address: `${indexToColumnName(c)}${rowIdx + r + 1}`,
              row: rowIdx + r,
              col: c,
              value: cell.value,
              formula: cell.formula,
              dataType: cell.dataType,
            });
          }
          if (c + 1 > maxCol) maxCol = c + 1;
        });
        if (parsedRow.length > 0 && rowIdx + r + 1 > maxRow) maxRow = rowIdx + r + 1;
      }
      rowIdx += rowRepeat;
      if (rowIdx >= MAX_EXPANDED_ROWS) break;
    }

    sheets.push({ name, cells, rowCount: maxRow, colCount: maxCol });
  }
  if (sheets.length === 0) throw new Error('Classeur ODS invalide : aucune table trouvée.');
  return sheets;
}
