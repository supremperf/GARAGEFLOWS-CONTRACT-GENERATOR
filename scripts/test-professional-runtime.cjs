// Compiled CommonJS + HTTP owner access + actual PDF round-trip. Synthetic data only.
const fs = require('node:fs');
const { Buffer } = require('node:buffer');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-professional-runtime-'));
process.env.GARAGEFLOWS_DATA_DIR = temp;
let server;
async function main() {
  const service = require('../dist-electron/electron/services/professional-contract-service');
  const { createClient } = require('../dist-electron/storage/repositories/client-repo');
  const { saveProfessionalProfile, saveSubscriptionConfig } = require('../dist-electron/storage/repositories/profile-repo');
  await saveProfessionalProfile({ nom: 'RUNTIME_TEST', prenom: 'Camille', formeJuridique: 'Entrepreneur individuel — Micro-entreprise', siret: '12345678901234', adresse: '1 rue SYNTHETIQUE', codePostal: '67000', ville: 'Strasbourg', emailPro: 'runtime@example.test' });
  await saveSubscriptionConfig({ prixTTC: '99,99', tvaTaux: '20' });
  const client = await createClient({ nom: 'RUNTIME_CLIENT_TEST', entreprise: 'ENTREPRISE SYNTHETIQUE', email: 'client@example.test', formeJuridique: 'SAS', siret: '98765432101234', adresse: '2 rue du TEST', codePostal: '67000', ville: 'Strasbourg', representantLegal: 'Camille TEST', fonctionRepresentant: 'Présidence', dateSouscription: '2019-12-30', dateDebut: '2020-01-01', prixTTC: '99,99' });
  const source = [
    '# DOCUMENT SYNTHETIQUE DE TEST — AUCUNE VALEUR CONTRACTUELLE', 'Référence GF-ABO-[NUMERO_CONTRAT]',
    ...Array.from({ length: 27 }, (_, i) => `## ARTICLE ${i + 1} — TEST\n\nTexte synthétique non juridique avec caractères français : Élodie, d’Alsace, 99,99 €.\n`),
    '# ANNEXE 1', ...Array.from({ length: 15 }, (_, i) => `## ${i + 1}. TEST DONNEES\n\nTexte synthétique non juridique.`),
    '# ANNEXE 2', 'Bon de commande synthétique.', '# SIGNATURES', 'Aucune signature réelle. FIN_SYNTHESE_RUNTIME',
  ].join('\n\n');
  const model = await service.importLegalModel({ text: source, title: 'RUNTIME SYNTHETIQUE — NON JURIDIQUE', version: 'runtime-test', date: '2026-10-22', bindings: { NUMERO_CONTRAT: 'NUMERO_CONTRAT' }, confirmed: true });
  const draft = await service.createProfessionalDraft({ requestId: crypto.randomUUID(), clientId: client.id, modelId: model.id, terms: { taxRegime: 'vat', firstDueDate: '2020-01-02', legalReviewAccepted: true } });
  const preview = await service.previewProfessional(draft.id);
  const before = await service.readProfessionalPdf(draft.id, 'preview');
  const final = await service.generateProfessional(draft.id, preview.previewHash);
  const after = await service.readProfessionalPdf(draft.id, 'original');
  assert(before.bytes.equals(after.bytes));
  const parsed = await require('../dist-electron/core/document-parser/pdf-parser').parsePdfBuffer(after.bytes, 'synthetic-runtime.pdf');
  assert.match(parsed.fullText, /FIN_SYNTHESE_RUNTIME/);
  // The authoritative bundled source, not just the synthetic regression fixture.
  const bundled = require('../dist-electron/core/contracts/bundled-model').bundledProfessionalModel();
  assert.equal(bundled.sha256, '82ff73ad47b495a9091ac9b82d3cd1ddba2305c6f2d3cf60b4f4431aa94dcf5c');
  const actualDraft = await service.createProfessionalDraft({ requestId: crypto.randomUUID(), clientId: client.id, modelId: bundled.id, terms: { taxRegime: 'vat', firstDueDate: '2020-01-02', legalReviewAccepted: true } });
  const actualPreview = await service.previewProfessional(actualDraft.id);
  const actualBefore = await service.readProfessionalPdf(actualDraft.id, 'preview');
  await service.generateProfessional(actualDraft.id, actualPreview.previewHash);
  const actualAfter = await service.readProfessionalPdf(actualDraft.id, 'original');
  assert(actualBefore.bytes.equals(actualAfter.bytes));
  const actualParsed = await require('../dist-electron/core/document-parser/pdf-parser').parsePdfBuffer(actualAfter.bytes, 'source-fourni-runtime.pdf');
  assert(actualParsed.pageCount > 15); assert.match(actualParsed.fullText, /FIN DU CONTRAT/);
  assert.match(actualParsed.fullText, /Désignation/); assert.match(actualParsed.fullText, /30\/12\/2019/);
  console.log(`[professional runtime] Authoritative bundled source ${bundled.sha256}, ${actualParsed.pageCount} pages, real SQLite/service/preview/original/extraction: PASS.`);
  const capability = crypto.randomBytes(32).toString('hex');
  await new Promise(resolve => { server = require('../dist-electron/electron/server').createApp({ localCapability: capability }).listen(0, '127.0.0.1', resolve); });
  const url = `http://127.0.0.1:${server.address().port}/api/professional/contracts/${final.id}/pdf?variant=original`;
  assert.equal((await globalThis.fetch(url)).status, 403);
  const response = await globalThis.fetch(url, { headers: { 'X-GF-Local-Capability': capability } });
  assert.equal(response.status, 200); assert(Buffer.from(await response.arrayBuffer()).equals(after.bytes));
  console.log('[professional runtime] Compiled CommonJS, SQLite, full synthetic source, exact preview/PDF, extraction and actual HTTP 403/200: PASS. No Electron/native signature/printing claim.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  require('../dist-electron/storage/database/sqlite-db').resetDatabaseConnection();
  fs.rmSync(temp, { recursive: true, force: true });
});
