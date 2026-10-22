// Exercise emitted CommonJS with the real runtime modules, no TS loader/Vite.
const { Buffer } = require('node:buffer');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-compiled-'));
process.env.GARAGEFLOWS_DATA_DIR = temp;

async function main() {
  const { PDFDocument, StandardFonts } = require('pdf-lib');
  const { parsePdfBuffer } = require('../dist-electron/core/document-parser/pdf-parser');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage().drawText('GarageFlows CLIENT_NOM Martin Contrat abonnement 99,99 EUR', { x: 40, y: 700, font });
  const parsed = await parsePdfBuffer(Buffer.from(await doc.save()), 'runtime.pdf');
  assert.match(parsed.fullText, /Martin/);
  assert.equal(parsed.isScanned, false, 'Compiled PDF.js ESM extraction failed');
  assert.ok(parsed.pdfItems.length > 0, 'No positioned PDF.js text: swallowed ESM import failure');
  const { createClient, listClients } = require('../dist-electron/storage/repositories/client-repo');
  const { resetDatabaseConnection } = require('../dist-electron/storage/database/sqlite-db');
  await createClient({ nom: 'TEST_RUNTIME_ISOLE', prenom: 'Martin' });
  resetDatabaseConnection();
  assert.equal((await listClients())[0].nom, 'TEST_RUNTIME_ISOLE');
  const { parseDocumentFile } = require('../dist-electron/core/document-parser');
  const { generateContractDocument } = require('../dist-electron/core/replacement-engine');
  const sourcePath = path.join(root, 'examples/contrat-abonnement-garageflows.docx');
  const original = fs.readFileSync(sourcePath);
  const template = await parseDocumentFile(sourcePath);
  const generated = await generateContractDocument({ templateId: 'runtime-test', templateName: 'Runtime', originalBuffer: original, originalFilePath: sourcePath, originalFileName: path.basename(sourcePath), variables: template.detectedVariables, valuesByVariableId: Object.fromEntries(template.detectedVariables.map(v => [v.id, ({ ENTREPRISE_SIRET: '12345678901234', CLIENT_EMAIL: 'test@example.test', ENTREPRISE_IBAN: 'FR1420041010050500013M02606', ABONNEMENT_PRIX_TTC: '99,99', ABONNEMENT_PRIX_MONTANT: '99,99', ABONNEMENT_PRIX_HT: '83,33', ABONNEMENT_TVA: '20' })[v.canonicalField] || 'TEST RUNTIME'])), targetFormat: 'docx' });
  assert.ok(generated.buffer.length > 100);
  assert.ok(original.equals(fs.readFileSync(sourcePath)), 'Original template modified');
  const { runLocalOcrOnBuffer } = require('../dist-electron/core/ocr/ocr-engine');
  const sharp = require('sharp');
  const image = await sharp(Buffer.from('<svg width="1200" height="200"><rect width="100%" height="100%" fill="white"/><text x="40" y="125" font-family="sans-serif" font-size="65" fill="black">GARAGEFLOWS CLIENT MARTIN</text></svg>')).png().toBuffer();
  const recognized = await runLocalOcrOnBuffer(image, 'runtime.png');
  assert.match(recognized.text, /MARTIN/i, `Real local OCR failed: ${JSON.stringify(recognized.warnings)}`);
  const invalid = await runLocalOcrOnBuffer(Buffer.from('not a decodable image'), 'invalid.png');
  assert.ok(invalid.warnings.some(w => w.includes('Avertissement moteur Tesseract local')), 'Worker rejection must be returned as a warning');
  await require('./test-ocr-worker-runtime.cjs')(root, temp, image);
  const corruptPdf = await runLocalOcrOnBuffer(Buffer.from('%PDF-1.4\ninvalid\n%%EOF'), 'corrupt.pdf');
  assert.ok(corruptPdf.warnings.some(w => w.includes('rasterisation')));
  console.log(`[runtime] Node ${process.versions.node}: compiled ESM PDF.js + positions, SQLite/WASM persistence, DOCX generation, real offline image OCR, worker rejection/termination, raw-PDF guard: PASS. Isolated data only.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  require('../dist-electron/storage/database/sqlite-db').resetDatabaseConnection();
  fs.rmSync(temp, { recursive: true, force: true });
});
