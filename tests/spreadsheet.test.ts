import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { parseCsv, serializeCsv, detectCsvDelimiter } from '../core/spreadsheet/csv';
import { buildXlsxFromSheets, buildZipSync, excelSerialToIso, readXlsxSheets } from '../core/spreadsheet/xlsx-xml';
import { parseSpreadsheetBuffer } from '../core/document-parser/xlsx-parser';
import { replaceInSpreadsheetBuffer } from '../core/replacement-engine/xlsx-replacer';
import type { ReplacementInstruction } from '../core/replacement-engine/docx-replacer';

const instructions: ReplacementInstruction[] = [
  { variableId: 'CLIENT_NOM', originalText: '{{CLIENT_NOM}}', isGenericPositional: false, value: 'Durand', canonicalField: 'CLIENT_NOM' },
  { variableId: 'ABONNEMENT_PRIX_TTC', originalText: '{{ABONNEMENT_PRIX_TTC}}', isGenericPositional: false, value: '99,99 €', canonicalField: 'ABONNEMENT_PRIX_TTC' },
];

describe('moteur tableur interne — CSV', () => {
  it('analyse le CSV français (point-virgule, guillemets, accents)', () => {
    const rows = parseCsv('Nom;Ville;Note\r\n"Durand; Fils";Châlons;"dit ""bonjour"""\r\nMartin;Reims;');
    expect(rows[0]).toEqual(['Nom', 'Ville', 'Note']);
    expect(rows[1]).toEqual(['Durand; Fils', 'Châlons', 'dit "bonjour"']);
    expect(detectCsvDelimiter('a;b;c')).toBe(';');
  });

  it('aller-retour CSV sans perte', () => {
    const rows = [['A', 'B;2', 'C"D'], ['é', '100', '']];
    expect(parseCsv(serializeCsv(rows, ';'), ';')).toEqual(rows);
  });

  it('rejette un CSV malformé (guillemet non fermé)', () => {
    expect(() => parseCsv('"abc')).toThrow(/CSV invalide/);
  });
});

describe('moteur tableur interne — XLSX', () => {
  it('génère puis relit un classeur (texte, nombres, accents)', async () => {
    const buf = buildXlsxFromSheets([
      { name: 'Contrat', rows: [['Client', 'Montant'], ['{{CLIENT_NOM}}', '99.99'], ['Café — Châlons', '']] },
    ]);
    const zip = await JSZip.loadAsync(buf);
    const sheets = await readXlsxSheets(zip);
    expect(sheets[0].name).toBe('Contrat');
    const values = sheets[0].cells.map((c) => c.value);
    expect(values).toContain('{{CLIENT_NOM}}');
    expect(values).toContain('Café — Châlons');
    expect(sheets[0].cells.find((c) => c.address === 'B2')?.value).toBe('99.99');
  });

  it('parse via le parseur applicatif et reconstruit le texte', async () => {
    const buf = buildXlsxFromSheets([{ name: 'F1', rows: [['Nom', '{{CLIENT_NOM}}']] }]);
    const out = await parseSpreadsheetBuffer(buf, 'xlsx');
    expect(out.fullText).toContain('{{CLIENT_NOM}}');
    expect(out.sheets[0].cells.length).toBeGreaterThan(0);
  });

  it('convertit les dates Excel (numéro de série) en ISO', () => {
    expect(excelSerialToIso(44927)).toBe('2023-01-01');
  });

  it('préserve formules et mise en forme lors du remplacement (chaînes partagées)', async () => {
    const contentTypes = `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`;
    const wb = `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="F1" sheetId="1" r:id="rId1"/></sheets></workbook>`;
    const rels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
    const rootRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
    const ss = `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="1"><si><t>Client : {{CLIENT_NOM}}</t></si></sst>`;
    const sheet = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s" s="3"><v>0</v></c><c r="B1"><f>SUM(1,2)</f><v>3</v></c></row></sheetData></worksheet>`;
    const original = buildZipSync([
      { name: '[Content_Types].xml', data: Buffer.from(contentTypes) },
      { name: '_rels/.rels', data: Buffer.from(rootRels) },
      { name: 'xl/workbook.xml', data: Buffer.from(wb) },
      { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(rels) },
      { name: 'xl/sharedStrings.xml', data: Buffer.from(ss) },
      { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheet) },
    ]);

    // Lecture : la formule est détectée et conservée dans les métadonnées.
    const parsed = await parseSpreadsheetBuffer(original, 'xlsx');
    const formulaCell = parsed.sheets[0].cells.find((c) => c.address === 'B1');
    expect(formulaCell?.formula).toBe('SUM(1,2)');

    // Remplacement : variable substituée, formule intacte.
    const { buffer, replacementsCount } = await replaceInSpreadsheetBuffer(original, 'xlsx', instructions);
    expect(Object.values(replacementsCount).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    const outZip = await JSZip.loadAsync(buffer);
    const outSheet = await outZip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(outSheet).toContain('Client : Durand');
    expect(outSheet).toContain('<f>SUM(1,2)</f>');
    expect(outSheet).toContain('s="3"'); // style de la cellule texte préservé
  });

  it('rejette explicitement le XLS binaire hérité', async () => {
    await expect(parseSpreadsheetBuffer(Buffer.from('fake'), 'xls')).rejects.toThrow(/XLS.*plus pris en charge/);
    await expect(replaceInSpreadsheetBuffer(Buffer.from('fake'), 'xls', instructions)).rejects.toThrow(/XLS.*plus pris en charge/);
  });
});

describe('moteur tableur interne — ODS', () => {
  async function makeOds(): Promise<Buffer> {
    const zip = new JSZip();
    zip.file('mimetype', 'application/vnd.oasis.opendocument.spreadsheet');
    zip.file('content.xml', `<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:spreadsheet><table:table table:name="Clients"><table:table-row><table:table-cell><text:p>Client {{CLIENT_NOM}} — Châlons</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="42"><text:p>42</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>`);
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  it('lit feuilles, cellules et valeurs typées', async () => {
    const out = await parseSpreadsheetBuffer(await makeOds(), 'ods');
    expect(out.sheets[0].name).toBe('Clients');
    expect(out.fullText).toContain('{{CLIENT_NOM}}');
    expect(out.sheets[0].cells.find((c) => c.address === 'B1')?.value).toBe('42');
  });

  it('remplace les variables dans content.xml sans toucher au reste', async () => {
    const { buffer, replacementsCount } = await replaceInSpreadsheetBuffer(await makeOds(), 'ods', instructions);
    expect(Object.values(replacementsCount).reduce((a, b) => a + b, 0)).toBe(1);
    const out = await parseSpreadsheetBuffer(buffer, 'ods');
    expect(out.fullText).toContain('Client Durand');
    expect(out.fullText).not.toContain('{{CLIENT_NOM}}');
  });
});
