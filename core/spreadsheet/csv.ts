/**
 * CSV minimal mais correct (RFC 4180) : guillemets, virgules/points-virgules,
 * retours à la ligne dans les champs entre guillemets, échappement par doublement.
 * Détection du délimiteur adaptée aux exports Excel français (`;`).
 */

export function detectCsvDelimiter(text: string): ',' | ';' | '\t' {
  const firstLine = text.split(/\r\n|\r|\n/, 1)[0] ?? '';
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  if (semicolons > commas && semicolons >= tabs) return ';';
  if (tabs > commas) return '\t';
  return ',';
}

export function parseCsv(text: string, delimiter?: ',' | ';' | '\t'): string[][] {
  const delim = delimiter ?? detectCsvDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, '');

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === delim) { pushField(); continue; }
    if (ch === '\r') { if (src[i + 1] === '\n') i++; pushRow(); continue; }
    if (ch === '\n') { pushRow(); continue; }
    field += ch;
  }
  if (inQuotes) throw new Error('Fichier CSV invalide : guillemet fermant manquant.');
  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

export function serializeCsv(rows: string[][], delimiter: ',' | ';' | '\t' = ','): string {
  const escape = (value: string): string => {
    if (value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };
  return rows.map((r) => r.map(escape).join(delimiter)).join('\r\n');
}
