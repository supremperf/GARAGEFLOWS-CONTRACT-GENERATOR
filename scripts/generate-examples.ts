import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as XLSX from 'xlsx';
import { buildDocxBufferFromStructuredContent, buildHtmlBufferFromStructuredContent, buildOdtBufferFromStructuredContent, buildRtfBufferFromStructuredContent, buildTxtBufferFromStructuredContent } from '../core/document-converter/converter';

const outDir = path.join(process.cwd(), 'examples');
fs.mkdirSync(outDir, { recursive: true });

const headers = ['GARAGEFLOWS — CONTRAT D’ABONNEMENT'];
const footers = ['Document modèle — les clauses ci-dessus ne doivent pas être altérées par le générateur.'];

const officialParagraphs = [
  'CONTRAT D’ABONNEMENT GARAGEFLOWS',
  'Entre :',
  'L’entreprise {{ENTREPRISE_NOM}}, immatriculée sous le numéro {{ENTREPRISE_SIRET}}, dont le siège est situé au {{ENTREPRISE_ADRESSE}}, représentée par {{ENTREPRISE_REPRESENTANT}}.',
  'Et :',
  '{{CLIENT_PRENOM}} {{CLIENT_NOM}}, domicilié au {{CLIENT_ADRESSE}}, {{CLIENT_CODE_POSTAL}} {{CLIENT_VILLE}}, joignable au {{CLIENT_TELEPHONE}} et à l’adresse {{CLIENT_EMAIL}}.',
  'Le client {{CLIENT_NOM}} souscrit à l’abonnement {{ABONNEMENT_NOM}} pour un montant de {{ABONNEMENT_PRIX_TTC}} TTC par {{ABONNEMENT_PERIODICITE}}.',
  'Le prix hors taxes correspondant est de {{ABONNEMENT_PRIX_HT}}, TVA {{ABONNEMENT_TVA}}.',
  'Le nom du client {{CLIENT_NOM}} est rappelé pour la facturation, le prélèvement et la correspondance. Le client {{CLIENT_NOM}} reconnaît avoir pris connaissance des conditions figurant dans le présent modèle.',
  'Coordonnées bancaires du prestataire : IBAN {{ENTREPRISE_IBAN}}, BIC {{ENTREPRISE_BIC}}.',
  'La présente souscription prend effet le {{DATE_DEBUT}}. Fait à {{ENTREPRISE_VILLE}}, le {{DATE_SIGNATURE}}.',
  'Signature du client : {{SIGNATURE_CLIENT}}.',
  'Signature de l’entreprise : {{SIGNATURE_ENTREPRISE}}.',
  'Clause de conservation : aucune condition commerciale n’est ajoutée par le logiciel. Seules les variables identifiées sont remplacées.',
];

const tables = [[
  ['Désignation', 'Montant', 'Périodicité'],
  ['{{ABONNEMENT_NOM}}', '{{ABONNEMENT_PRIX_TTC}}', '{{ABONNEMENT_PERIODICITE}}'],
  ['Client', '{{CLIENT_PRENOM}} {{CLIENT_NOM}}', '{{CLIENT_EMAIL}}'],
]];

async function writeOfficial(ext: 'docx' | 'odt' | 'rtf' | 'html' | 'txt') {
  const content = { title: 'Contrat GarageFlows', headers, paragraphs: officialParagraphs, tables, footers };
  const buffer =
    ext === 'docx' ? await buildDocxBufferFromStructuredContent(content) :
    ext === 'odt' ? await buildOdtBufferFromStructuredContent(content) :
    ext === 'rtf' ? buildRtfBufferFromStructuredContent(content) :
    ext === 'html' ? buildHtmlBufferFromStructuredContent(content) :
    buildTxtBufferFromStructuredContent(content);
  fs.writeFileSync(path.join(outDir, `contrat-abonnement-garageflows.${ext}`), buffer);
}

async function writePdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595.28, 841.89]);
  let y = 790;
  page.drawText(headers[0], { x: 50, y, size: 10, font: bold, color: rgb(0.2, 0.28, 0.4) });
  y -= 28;
  for (const paragraph of officialParagraphs) {
    const size = paragraph === officialParagraphs[0] ? 13 : 11;
    const used = paragraph === officialParagraphs[0] ? bold : font;
    const words = paragraph.split(' ');
    let line = '';
    const lines: string[] = [];
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (used.widthOfTextAtSize(candidate, size) > 490) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    if (line) lines.push(line);
    for (const textLine of lines) {
      page.drawText(textLine, { x: 50, y, size, font: used, color: rgb(0.08, 0.1, 0.14) });
      y -= size + 6;
    }
    y -= 6;
  }
  const bytes = await pdf.save();
  fs.writeFileSync(path.join(outDir, 'contrat-abonnement-garageflows.pdf'), Buffer.from(bytes));
}

function writeLegacyTxt() {
  const text = [
    'CONTRAT D’ABONNEMENT — ANCIEN MODÈLE',
    'Je soussigné XXX, né le XXX, résidant au XXX, déclare souscrire à l’abonnement GarageFlows pour un montant de XXX euros par mois.',
    'Joignable au XXX et à l’adresse e-mail XXX.',
    'Fait le XXX.',
    'Le prestataire est immatriculé sous le numéro SIRET XXX.',
    'Coordonnées bancaires : IBAN XXX.',
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'contrat-ancien-modele-xxx.txt'), text, 'utf8');
}

function writeXlsx() {
  const wb = XLSX.utils.book_new();
  const rows = [
    ['Champ', 'Valeur', 'Contrôle'],
    ['Client', '{{CLIENT_NOM}}', ''],
    ['Prénom', '{{CLIENT_PRENOM}}', ''],
    ['Adresse', '{{CLIENT_ADRESSE}}', ''],
    ['Prix TTC', '{{ABONNEMENT_PRIX_TTC}}', ''],
    ['Total formule', '', '=B5'],
    ['Mention fixe', 'Ne pas modifier cette clause de tableau.', ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 22 }, { wch: 36 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Contrat');
  const csv = XLSX.utils.sheet_to_csv(ws);
  fs.writeFileSync(path.join(outDir, 'fiche-abonnement.xlsx'), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  fs.writeFileSync(path.join(outDir, 'fiche-abonnement.csv'), csv, 'utf8');
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function writeScannedPng() {
  const width = 64;
  const height = 64;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * 4;
      raw[i] = 245; raw[i + 1] = 245; raw[i + 2] = 242; raw[i + 3] = 255;
    }
  }
  const { deflateSync } = require('zlib') as typeof import('zlib');
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const text = Buffer.concat([
    Buffer.from('Comment\0', 'latin1'),
    Buffer.from('Je soussigné XXX, résidant au XXX, joignable au XXX. Abonnement GarageFlows pour un montant de XXX euros par mois.', 'utf8'),
  ]);
  const png = Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('tEXt', text),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(path.join(outDir, 'contrat-scanne.png'), png);
}

async function main() {
  await writeOfficial('docx');
  await writeOfficial('odt');
  await writeOfficial('rtf');
  await writeOfficial('html');
  await writeOfficial('txt');
  await writePdf();
  writeLegacyTxt();
  writeXlsx();
  writeScannedPng();
  console.log('Exemples générés dans', outDir);
}

main();
