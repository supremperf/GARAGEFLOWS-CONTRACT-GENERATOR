import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildEffectiveContext, calendarDay, cents, digest, placeholders, renderLegalText, validDate, validateModel } from '../core/contracts/context';
import { renderProfessionalPdf } from '../core/contracts/pdf';
import { createClient, deleteClient, updateClient } from '../storage/repositories/client-repo';
import { saveProfessionalProfile, saveSubscriptionConfig } from '../storage/repositories/profile-repo';
import { listContractEvents, listProfessionalContracts } from '../storage/repositories/professional-contract-repo';
import { deleteContract, getContract } from '../storage/repositories/contract-repo';
import { getSqliteDatabase, resetDatabaseConnection } from '../storage/database/sqlite-db';
import * as service from '../electron/services/professional-contract-service';
import { parsePdfBuffer } from '../core/document-parser/pdf-parser';
import { createApp } from '../electron/server';
import { exportGeneratedDocumentToDisk } from '../core/document-exporter/exporter';
import { syntheticBindings, syntheticLegalSource, testClient, testProfile, testSubscription, testTerms } from './fixtures/professional-contract';
import type { LegalModel } from '../core/contracts/types';
import type { Server } from 'node:http';

let model: LegalModel, clientId: string, server: Server, origin: string;
const capability = randomUUID() + randomUUID();
const headers = { 'X-GF-Local-Capability': capability, 'Content-Type': 'application/json' };
const fixtureContext = () => buildEffectiveContext(testClient(), testProfile(), testSubscription(), { ...testTerms }, true);
async function newDraft() { return service.createProfessionalDraft({ requestId: randomUUID(), clientId, modelId: model.id, terms: testTerms }); }
async function generated() { const draft = await newDraft(); const preview = await service.previewProfessional(draft.id); return service.generateProfessional(draft.id, preview.previewHash!); }

beforeAll(async () => {
  await getSqliteDatabase();
  await saveProfessionalProfile(testProfile()); await saveSubscriptionConfig(testSubscription());
  clientId = (await createClient(testClient())).id;
  model = await service.importLegalModel({ title: 'SCÉNARIO SYNTHÉTIQUE — NON JURIDIQUE', text: syntheticLegalSource, version: 'test-1', date: '2026-10-22', bindings: syntheticBindings, confirmed: true });
  await new Promise<void>(resolve => { server = createApp({ localCapability: capability }).listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address(); origin = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); resetDatabaseConnection(); });

describe('Contexte professionnel : montants, dates, absence de valeurs inventées', () => {
  it.each([['99,99', 9999], ['0.01', 1], ['1 000,50', 100050], ['999999999.99', 99999999999]])('centimes exacts %s', (value, expected) => { expect(cents(value)).toBe(expected); });
  it.each(['', '-1', '99.999', '99,99 €', 'NaN', '1e3', '0x10'])('rejette montant %s', v => expect(() => cents(v)).toThrow());
  it('réconcilie exactement TTC = HT + TVA', () => { const c = fixtureContext(); expect(c.errors).toEqual([]); expect([c.priceCents, c.htCents, c.taxCents]).toEqual([9999, 8333, 1666]); });
  it('ne déduit jamais un tarif absent du défaut 99,99', () => { const cl = testClient(); cl.prixTTC = ''; const c = buildEffectiveContext(cl, testProfile(), testSubscription(), testTerms, false); expect(c.priceSource).toBe('missing'); expect(c.errors.join()).toMatch(/Prix TTC réel manquant/); });
  it('n’utilise pas un taux de TVA non enregistré', () => { expect(buildEffectiveContext(testClient(), testProfile(), testSubscription(), testTerms, false).errors.join()).toMatch(/TVA invalide/); });
  it('la franchise donne HT=TTC sans TVA fictive de 20 %', () => { const c = buildEffectiveContext(testClient(), testProfile(), { ...testSubscription(), tvaTaux: '0' }, { ...testTerms, taxRegime: 'franchise' }, true); expect(c.htCents).toBe(9999); expect(c.taxCents).toBe(0); expect(c.fields.TVA_MENTION).toContain('293 B'); });
  it('ne date pas une signature lors de l’émission', () => { expect(fixtureContext().fields.DATE_SIGNATURE).toBe('À compléter lors de la signature'); expect(fixtureContext().fields.SIGNATURE_CLIENT).toBe('Non signé'); });
  it.each([['trimestre', 39996], ['semestre', 19998]])('périodicité enregistrée %s : annuel cohérent', (frequency, annual) => { const c = buildEffectiveContext({ ...testClient(), frequencePaiement: String(frequency) }, testProfile(), testSubscription(), { ...testTerms, commercialExceptionAccepted: true, specialConditions: 'Paiement à la périodicité explicitement indiquée.' }, true); expect(c.errors).toEqual([]); expect(c.fields.MONTANT_ANNUEL).toBe(`${Math.floor(Number(annual) / 100)},${String(Number(annual) % 100).padStart(2, '0')}`); });
  it('les champs facultatifs vides ne bloquent pas', () => { const c = fixtureContext(); expect(c.fields.CLIENT_TELEPHONE).toBe('Non renseigné'); expect(c.errors).toEqual([]); });
  it('les identités obligatoires manquantes bloquent', () => { const p = testProfile(); p.nom = ''; const c = buildEffectiveContext({ ...testClient(), representantLegal: '', entreprise: '' }, p, testSubscription(), testTerms, true); expect(c.errors.join()).toMatch(/Entreprise du client obligatoire/); expect(c.errors.join()).toMatch(/exploitant/); });
  it.each(['2026-02-30', '2026-13-01', '', '22/10/2026'])('rejette date %s', date => expect(validDate(date)).toBe(false));
  it('rejette échéance ou fin avant effet', () => { const c = buildEffectiveContext(testClient(), testProfile(), testSubscription(), { ...testTerms, firstDueDate: '2019-12-31', endDate: '2019-12-30' }, true); expect(c.errors.join()).toMatch(/antérieure/); });
  it('ne masque pas une remise incohérente', () => { const c = buildEffectiveContext(testClient(), testProfile(), testSubscription(), { ...testTerms, discountCents: 1000, referencePriceCents: 9999, discountDuration: '3 mois' }, true); expect(c.errors.join()).toMatch(/remise doit correspondre/); });
  it('réconcilie remise effective sans inventer un échéancier annuel', () => { const c = buildEffectiveContext({ ...testClient(), prixTTC: '89,99' }, testProfile(), testSubscription(), { ...testTerms, discountCents: 1000, referencePriceCents: 9999, discountDuration: '3 mois', specialConditions: 'Remise 10 € pendant 3 mois puis tarif normal 99,99 €.', commercialExceptionAccepted: true }, true); expect(c.errors).toEqual([]); expect(c.fields.MONTANT_ANNUEL).toContain('Non calculé'); });
  it('tarif annuel explicitement dérogatoire et non reconverti en prix mensuel facturé', () => { const c = buildEffectiveContext({ ...testClient(), prixTTC: '1099,99', frequencePaiement: 'an' }, testProfile(), testSubscription(), { ...testTerms, specialConditions: 'Paiement annuel 1099,99 € TTC.', commercialExceptionAccepted: true }, true); expect(c.errors).toEqual([]); expect(c.fields.MONTANT_ANNUEL).toBe('1099,99'); });
});

describe('Source juridique : import intégral immuable et substitutions littérales', () => {
  it('conserve exactement les caractères source et leur empreinte', () => { expect(model.text).toBe(syntheticLegalSource); expect(model.sha256).toBe(digest(syntheticLegalSource)); expect(validateModel(model.text, model.bindings)).toEqual([]); });
  it('refuse article manquant, annexe tronquée et correspondance manquante', () => { expect(validateModel(syntheticLegalSource.replace('ARTICLE 27', 'ARTICLE MANQUANT'), syntheticBindings).join()).toMatch(/27/); expect(validateModel(syntheticLegalSource.replace('## 15. MARQUEUR_RGPD_15', 'SECTION MANQUANTE'), syntheticBindings).join()).toMatch(/15 sections/); expect(validateModel(syntheticLegalSource, {}).join()).toMatch(/Correspondance requise/); });
  it('un réimport exact est idempotent', async () => { const imported = await service.importLegalModel({ ...model, confirmed: true }); expect(imported.id).toBe(model.id); });
  it('ne traite pas $& ni les crochets d’une valeur comme une nouvelle variable', () => { const fields = { ...fixtureContext().fields, NUMERO_CONTRAT: '2026-000001', CONDITIONS_PARTICULIERES: 'Texte $& et [valeur réelle]' }; expect(renderLegalText(model, fields)).toContain('Texte $& et [valeur réelle]'); expect(placeholders(model.text)).toContain('NUMÉRO_CONTRAT'); });
  it('le texte intégral rendu conserve 27 articles, 15 sections et la fin', async () => { const draft = await newDraft(); const source = await service.fullRenderedSource(draft.id); expect(source).toContain('GF-ABO-2026-'); expect(source).not.toContain('GF-ABO-GF-ABO'); expect(source).toContain('MARQUEUR_FIN_INTEGRAL'); expect(source.match(/MARQUEUR_ARTICLE_/g)).toHaveLength(27); expect(source.match(/MARQUEUR_RGPD_/g)).toHaveLength(15); });
});

describe('PDF réel et conservation de toutes les pages', () => {
  it('PDF lisible, paginé, clauses finales présentes et coordonnées sans débordement', async () => {
    const draft = await newDraft(), pdf = await renderProfessionalPdf(draft), parsed = await parsePdfBuffer(pdf.bytes, 'test-synthetique.pdf');
    expect(pdf.pages).toBeGreaterThan(5); expect(parsed.fullText).toContain('MARQUEUR_FIN_INTEGRAL');
    for (let i = 1; i <= 27; i++) expect(parsed.fullText).toContain(`MARQUEUR_ARTICLE_${String(i).padStart(2, '0')}`);
    for (let i = 1; i <= 15; i++) expect(parsed.fullText).toContain(`MARQUEUR_RGPD_${String(i).padStart(2, '0')}`);
    for (const line of pdf.lines) { expect(line.x + line.width).toBeLessThanOrEqual(548); expect(line.y).toBeGreaterThanOrEqual(58); expect(line.y).toBeLessThan(842); }
    expect(parsed.fullText).toContain('Élodie'); expect(parsed.fullText).toContain('99,99');
  });
  it('noms, adresses, représentants et conditions très longs ne sont jamais tronqués', async () => {
    const draft = await newDraft();
    draft.clientName = 'ATELIER_'.repeat(120); draft.context.fields.CLIENT_RAISON_SOCIALE = draft.clientName;
    draft.context.fields.CLIENT_ADRESSE = 'Adresse très longue d’Œuvre '.repeat(80);
    draft.context.fields.CLIENT_REPRESENTANT = 'Élodie Première ; André Deuxième ; '.repeat(40);
    draft.context.fields.CONDITIONS_PARTICULIERES = ('Texte long à conserver intégralement, coût 99,99 € et apostrophes d’Alsace.\n').repeat(120) + 'FIN_CONDITIONS_LONGUES';
    const pdf = await renderProfessionalPdf(draft), parsed = await parsePdfBuffer(pdf.bytes, 'stress-synthetique.pdf');
    expect(parsed.fullText).toContain('FIN_CONDITIONS_LONGUES'); expect(parsed.fullText).toContain('MARQUEUR_FIN_INTEGRAL');
    expect(pdf.pages).toBeGreaterThan(10); expect(pdf.lines.every(line => line.x + line.width < 548 && line.y >= 58)).toBe(true);
  });
  it('l’aperçu et l’original sont identiques octet pour octet', async () => { const draft = await newDraft(), preview = await service.previewProfessional(draft.id); const a = await service.readProfessionalPdf(draft.id, 'preview'); const final = await service.generateProfessional(draft.id, preview.previewHash!); const b = await service.readProfessionalPdf(draft.id, 'original'); expect(a.bytes.equals(b.bytes)).toBe(true); expect(digest(b.bytes)).toBe(final.pdfHash); expect((await getContract(draft.id))?.sha256).toBe(final.pdfHash); });
  it('échoue explicitement sur un caractère non représentable plutôt que le supprimer', async () => { const draft = await newDraft(); draft.context.fields.CLIENT_RAISON_SOCIALE = '姓名'; await expect(renderProfessionalPdf(draft)).rejects.toThrow(); });
});

describe('Cycle de vie, accès, preuves et persistance', () => {
  it('brouillon et génération sont idempotents', async () => { const input = { requestId: randomUUID(), clientId, modelId: model.id, terms: testTerms }; const a = await service.createProfessionalDraft(input), b = await service.createProfessionalDraft(input); expect(a.id).toBe(b.id); await expect(service.createProfessionalDraft({ ...input, terms: { ...testTerms, commitment: 'modifié' } })).rejects.toThrow(/idempotence/); const p = await service.previewProfessional(a.id); const x = await service.generateProfessional(a.id, p.previewHash!); expect((await service.generateProfessional(a.id, p.previewHash!)).pdfHash).toBe(x.pdfHash); });
  it('interdit une génération sans aperçu ou avec hash différent', async () => { const d = await newDraft(); await expect(service.generateProfessional(d.id, 'bad')).rejects.toThrow(/Aperçu/); });
  it('détecte une modification des données depuis la vérification', async () => { const d = await newDraft(), p = await service.previewProfessional(d.id); await updateClient(clientId, { notes: 'modification concurrente' }); await expect(service.generateProfessional(d.id, p.previewHash!)).rejects.toThrow(/Données client/); await updateClient(clientId, { notes: '' }); });
  it('verrouille les modifications après génération et préserve l’historique après mise à jour du tarif', async () => { const d = await generated(); await expect(service.updateProfessionalDraft(d.id, d.revision, testTerms)).rejects.toThrow(/Modification interdite/); await saveSubscriptionConfig({ prixTTC: '129,99' }); expect((await service.requireProfessional(d.id)).context.subscription.prixTTC).toBe('99,99'); await saveSubscriptionConfig(testSubscription()); });
  it('protège suppression générique, suppression client et export générique vers le dossier protégé', async () => { const d = await generated(); await expect(deleteContract(d.id, true)).rejects.toThrow(/Suppression interdite/); await expect(deleteClient(clientId)).rejects.toThrow(/contrats professionnels/); const record = (await getContract(d.id))!; await expect(exportGeneratedDocumentToDisk({ buffer: Buffer.from('malicious'), destinationDir: path.dirname(record.filePath), fileName: path.basename(record.filePath), format: 'pdf', overwriteConfirmed: true })).rejects.toThrow(/protégé/); });
  it('refuse signature sans preuve et transition directe généré → actif', async () => { const d = await generated(); await expect(service.transitionProfessional(d.id, d.revision, 'active', 'Test négatif')).rejects.toThrow(/Transition interdite/); await expect(service.recordManualSignature(d.id, { base64: '', signatory: '', email: '', signedAt: '', consent: false, attested: false, expectedHash: d.pdfHash! })).rejects.toThrow(); });
  it('acceptation déclarée ne change pas le statut en signé', async () => { const d = await generated(); const a = await service.recordAcceptance(d.id, d.context.client.email, true); expect(a.state).toBe('generated'); expect(a.signature).toBeUndefined(); expect(a.acceptedAt).toBeTruthy(); });
  it('l’absence de transport e-mail et signature électronique est une erreur explicite', async () => { await expect(service.unavailableIntegration('e-mail')).rejects.toMatchObject({ status: 501 }); });
  it('pièce manuscrite attestée : original préservé, aucun niveau qualifié inventé, avenant séparé', async () => {
    const d = await generated(), original = await service.readProfessionalPdf(d.id, 'original');
    const proof = await PDFDocument.load(original.bytes); proof.getPages()[proof.getPageCount() - 1].drawText('ATTESTATION SYNTHETIQUE DE TEST - PAS UNE VRAIE SIGNATURE', { x: 48, y: 90, size: 8 });
    const signed = await service.recordManualSignature(d.id, { base64: Buffer.from(await proof.save()).toString('base64'), signatory: 'SIGNATAIRE_SYNTHETIQUE', email: 'test@example.test', signedAt: calendarDay(), consent: true, attested: true, expectedHash: d.pdfHash! });
    expect(signed.signature?.qualification).toBe('not_verified'); expect((await service.readProfessionalPdf(d.id, 'original')).bytes.equals(original.bytes)).toBe(true);
    await expect(service.createProfessionalDraft({ requestId: randomUUID(), clientId, modelId: model.id, terms: testTerms, parentId: d.id, kind: 'revision' })).rejects.toThrow(/avenant/);
    const amendment = await service.createProfessionalDraft({ requestId: randomUUID(), clientId, modelId: model.id, terms: testTerms, parentId: d.id, kind: 'amendment' }); expect(amendment.id).not.toBe(d.id); expect(amendment.parentId).toBe(d.id);
    const active = await service.transitionProfessional(d.id, signed.revision, 'active', 'Début contractuel vérifié'); expect(active.state).toBe('active');
    const terminated = await service.transitionProfessional(d.id, active.revision, 'terminated', 'Résiliation déclarée reçue'); const archived = await service.transitionProfessional(d.id, terminated.revision, 'archived', 'Conservation historique'); expect(archived.state).toBe('archived');
  });
  it('journal chaîné avec acteur réel du poste et persistance SQLite après reconnexion', async () => { const d = await generated(); const events = await listContractEvents(d.id); for (let i = 0; i < events.length; i++) { const { hash, ...rest } = events[i]; expect(digest(JSON.stringify(rest))).toBe(hash); expect(events[i].previousHash).toBe(events[i - 1]?.hash || ''); expect(events[i].actor).toContain('Utilisateur du poste'); } resetDatabaseConnection(); expect((await service.requireProfessional(d.id)).pdfHash).toBe(d.pdfHash); expect((await listContractEvents(d.id)).length).toBe(events.length); });
  it('refuse API et PDF sans capacité, capacité incorrecte et origine étrangère', async () => { const d = await generated(); for (const url of ['/api/clients', '/api/professional/contracts', `/api/contracts/${d.id}/download`, `/api/professional/contracts/${d.id}/pdf`]) expect((await fetch(origin + url)).status).toBe(403); expect((await fetch(origin + '/api/professional/models', { headers: { ...headers, 'X-GF-Local-Capability': 'bad' } })).status).toBe(403); expect((await fetch(origin + '/api/professional/models', { headers: { ...headers, Origin: 'https://evil.example' } })).status).toBe(403); expect((await fetch(origin + '/api/professional/models', { headers })).status).toBe(200); });
  it('ne divulgue pas de PDF altéré par l’ancienne route de téléchargement', async () => { const d = await generated(), record = (await getContract(d.id))!; const original = fs.readFileSync(record.filePath); fs.writeFileSync(record.filePath, 'CORRUPTION_TEST'); try { expect((await fetch(origin + `/api/contracts/${d.id}/download`, { headers })).status).not.toBe(200); await expect(service.readProfessionalPdf(d.id, 'original')).rejects.toThrow(/Intégrité/); } finally { fs.writeFileSync(record.filePath, original); } });
  it('la migration additive se réexécute sans perdre clients ni contrats', async () => { const before = (await listProfessionalContracts()).length; resetDatabaseConnection(); await getSqliteDatabase(); expect((await listProfessionalContracts()).length).toBe(before); });
  it('un brouillon archivé ne peut pas être réactivé par la route aperçu', async () => { const d = await newDraft(); await service.transitionProfessional(d.id, d.revision, 'archived', 'Archivage du brouillon de test'); await expect(service.previewProfessional(d.id)).rejects.toThrow(/statut/); });
  it('un fichier manquant ne produit ni succès ni PDF vide', async () => { const d = await generated(), record = (await getContract(d.id))!; fs.renameSync(record.filePath, record.filePath + '.test-backup'); try { await expect(service.readProfessionalPdf(d.id, 'original')).rejects.toMatchObject({ status: 404 }); } finally { fs.renameSync(record.filePath + '.test-backup', record.filePath); } });
  it('la TVA déclarée ne contredit pas silencieusement les paramètres centraux', () => { const c = buildEffectiveContext(testClient(), { ...testProfile(), tvaRegime: 'franchise' }, testSubscription(), testTerms, true); expect(c.errors.join()).toMatch(/contradictoire/); });
  it('une ouverture SQLite concurrente partage une seule connexion', async () => { resetDatabaseConnection(); const dbs = await Promise.all(Array.from({ length: 8 }, () => getSqliteDatabase())); expect(dbs.every(db => db === dbs[0])).toBe(true); });
  it('date d’émission et contrôles calendaires utilisent le fuseau français', () => { expect(calendarDay(new Date('2026-10-22T23:30:00Z'))).toBe('2026-10-23'); });
  it('numéros uniques et conflit de modification concurrente refusé', async () => { const a = await newDraft(), b = await newDraft(); expect(a.number).not.toBe(b.number); await service.updateProfessionalDraft(a.id, a.revision, testTerms); await expect(service.updateProfessionalDraft(a.id, a.revision, testTerms)).rejects.toThrow(/autre fenêtre/); });
});
