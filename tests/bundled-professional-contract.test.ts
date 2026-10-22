import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { bundledProfessionalModel } from '../core/contracts/bundled-model';
import { buildEffectiveContext, digest, renderLegalText, validateContextForModel, validateModel } from '../core/contracts/context';
import { legalBlocks, variableSlots } from '../core/contracts/variables';
import { renderProfessionalPdf } from '../core/contracts/pdf';
import { parsePdfBuffer } from '../core/document-parser/pdf-parser';
import { createClient } from '../storage/repositories/client-repo';
import { saveProfessionalProfile, saveSubscriptionConfig } from '../storage/repositories/profile-repo';
import { allocateContractNumber, listProfessionalModels } from '../storage/repositories/professional-contract-repo';
import * as service from '../electron/services/professional-contract-service';
import { testClient, testProfile, testSubscription, testTerms } from './fixtures/professional-contract';
import type { ProfessionalContract } from '../core/contracts/types';

const expectedHash = '82ff73ad47b495a9091ac9b82d3cd1ddba2305c6f2d3cf60b4f4431aa94dcf5c';
const sourcePath = path.resolve('resources/contracts/garageflows-professional-v1.0-2026-10-22.md');
const model = bundledProfessionalModel();
const clientData = () => ({ ...testClient(), dateSouscription: '2019-12-30', dateDebut: '2020-01-01', entreprise: 'SPÉCIMEN — DONNÉES SYNTHÉTIQUES — NE PAS SIGNER' });
let clientId: string;
beforeAll(async () => {
  await saveProfessionalProfile(testProfile()); await saveSubscriptionConfig(testSubscription()); clientId = (await createClient(clientData())).id;
});
async function draft(): Promise<ProfessionalContract> { return service.createProfessionalDraft({ requestId: randomUUID(), clientId, modelId: model.id, terms: testTerms }); }
const context = () => validateContextForModel(buildEffectiveContext(clientData(), testProfile(), testSubscription(), testTerms, true), model);
const fields = () => ({ ...context().fields, NUMERO_CONTRAT: '2026-000001' });
const compact = (text: string) => text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/^#{1,6}\s+/gm, '').replace(/\s/g, '');

describe('Source intégrale fournie : intégration réelle, sans import manuel', () => {
  it('conserve les octets UTF-8 versionnés et leur empreinte figée', () => { expect(digest(fs.readFileSync(sourcePath))).toBe(expectedHash); expect(model.sha256).toBe(expectedHash); expect(model.text).toBe(fs.readFileSync(sourcePath, 'utf8')); expect(model.version).toBe('1.0'); expect(validateModel(model.text, model.bindings)).toEqual([]); });
  it('installe automatiquement une seule version canonique sans toucher aux autres modèles', async () => { const first = await listProfessionalModels(), next = await listProfessionalModels(); expect(first.filter(m => m.id === model.id)).toHaveLength(1); expect(next).toEqual(first); expect(first.find(m => m.id === model.id)?.bundled).toBe(true); });
  it('distingue les 32 occurrences et les quatre usages DATE', () => { expect(variableSlots(model.text)).toHaveLength(32); expect(model.bindings['DATE#1']).toBe('DATE_SOUSCRIPTION'); expect(model.bindings['DATE#2']).toBe('DATE_EFFET'); expect(model.bindings['DATE#3']).toBe('PREMIERE_ECHEANCE'); expect(model.bindings['DATE#4']).toBe('DATE_SIGNATURE'); });
  it('date réellement souscription, activation et première échéance, sans dater une signature', () => { const rendered = renderLegalText(model, fields()); expect(rendered).toContain('**Date de souscription :** 30/12/2019'); expect(rendered).toContain("**Date d'activation :** 01/01/2020"); expect(rendered).toContain('| Date de facturation | 02/01/2020 |'); expect(rendered).toContain('Le : À compléter lors de la signature'); expect(rendered).not.toMatch(/\[(?:DATE|NUMÉRO|À RENSEIGNER)\]/); });
  it('ne confond pas le fournisseur signataire avec le représentant du client', () => { const rendered = renderLegalText(model, fields()); expect(rendered).toContain('Nom : Camille EXPLOITANT_TEST'); expect(rendered).toContain('Nom du représentant : Élodie d’Œuvre'); expect(rendered).toContain('**Nom du représentant légal :** Élodie d’Œuvre'); });
  it('ne confond pas le tarif particulier et le mode de paiement', () => { const rendered = renderLegalText(model, fields()); expect(rendered).toContain('| Mode de paiement | Prélèvement SEPA |'); expect(rendered).toContain('| Tarif particulier éventuel | Tarif effectif : 99,99 € TTC'); expect(rendered).toContain('**Montant mensuel total dû :** 99,99 €'); expect(rendered).toContain('Non renseigné — à confirmer'); });
  it('refuse une correspondance globale ambiguë pour les DATE répétées', () => { const mappings = { ...model.bindings, DATE: 'DATE_EMISSION' }; delete mappings['DATE#2']; expect(validateModel(model.text, mappings).join()).toContain('Variable ambiguë'); });
  it('bloque la source si la vraie date de souscription manque', () => { const c = validateContextForModel(buildEffectiveContext({ ...clientData(), dateSouscription: '' }, testProfile(), testSubscription(), testTerms, true), model); expect(c.errors.join()).toContain('Date de souscription enregistrée obligatoire'); });
  it('bloque une souscription ultérieure à l’activation déclarée', () => { const c = validateContextForModel(buildEffectiveContext({ ...clientData(), dateSouscription: '2020-01-03' }, testProfile(), testSubscription(), testTerms, true), model); expect(c.errors.join()).toContain('postérieure'); });
  it('signale les clauses à valider sans les modifier', () => { expect(context().warnings.join()).toContain('préavis de trente jours'); expect(model.text).toContain('au moins trente jours avant la prochaine date de renouvellement'); expect(model.text).toContain('délai maximal de 48 heures'); expect(model.text).toContain('articles 1366 et 1367'); });
  it('un engagement central n’est pas ignoré par un appel direct au serveur', () => { const c = buildEffectiveContext(clientData(), testProfile(), { ...testSubscription(), dureeEngagement: '12 mois' }, testTerms, true); expect(c.fields.DUREE_ENGAGEMENT).toBe('12 mois'); expect(c.errors.join()).toContain('engagement des paramètres'); });
  it('les conditions tarifaires dérogatoires sont dans le bon de commande et non seulement la couverture', () => { const t = { ...testTerms, specialConditions: 'Tarif négocié 89,99 € TTC mensuel pendant trois mois, remise 10 € puis 99,99 €.', commercialExceptionAccepted: true, referencePriceCents: 9999, discountCents: 1000, discountDuration: 'trois mois' }; const c = validateContextForModel(buildEffectiveContext({ ...clientData(), prixTTC: '89,99' }, testProfile(), testSubscription(), t, true), model); expect(c.errors).toEqual([]); const rendered = renderLegalText(model, { ...c.fields, NUMERO_CONTRAT: '2026-000002' }); expect(rendered.slice(rendered.indexOf('# ANNEXE 2'))).toContain(t.specialConditions); expect(rendered).toContain('**99,99 € par mois.**'); expect(rendered).toContain('**Montant mensuel total dû :** 89,99 €'); });
  it('les pipes et retours à la ligne d’une condition ne détruisent pas la structure du tableau', () => { const data = fields(); data.CONDITIONS_COMMERCIALES_PARTICULIERES = 'Texte $& | valeur réelle\nDEUXIÈME_LIGNE'; const table = legalBlocks(model.text, model.bindings, data).find(b => b.kind === 'table'); expect(table?.kind).toBe('table'); if (table?.kind === 'table') { expect(table.header).toEqual(['Désignation', 'Conditions']); expect(table.rows.find(r => r[0] === 'Tarif particulier éventuel')?.[1]).toBe(data.CONDITIONS_COMMERCIALES_PARTICULIERES); expect(table.rows.every(r => r.length === 2)).toBe(true); } });
  it('le PDF contient chaque paragraphe original non variable et toutes les signatures/fins de document', async () => {
    const d = await draft(), pdf = await renderProfessionalPdf(d), parsed = await parsePdfBuffer(pdf.bytes, 'modele-fourni-specimen.pdf');
    const actual = compact(parsed.fullText);
    for (const paragraph of model.text.split(/\n\s*\n/)) {
      if (paragraph.includes('[') || paragraph.trim() === '---' || /^\|/.test(paragraph)) continue;
      expect(actual, paragraph.slice(0, 120)).toContain(compact(paragraph));
    }
    for (let i = 1; i <= 27; i++) expect(actual).toContain(`ARTICLE${i}–`);
    expect(actual).toContain('FIN DU CONTRAT'.replace(/ /g, '')); expect(actual).not.toContain('Espacesdesignature—aucunesignatureapposée');
    expect(parsed.pageCount).toBeGreaterThan(15); expect(pdf.lines.every(l => l.x + l.width <= 548 && l.y >= 58)).toBe(true);
  });
  it('le vrai modèle suit aperçu, génération, hash et historique existant sans différence d’octets', async () => { const d = await draft(), p = await service.previewProfessional(d.id); const preview = await service.readProfessionalPdf(d.id, 'preview'); const g = await service.generateProfessional(d.id, p.previewHash!); expect(g.model.sha256).toBe(expectedHash); expect((await service.readProfessionalPdf(d.id, 'original')).bytes.equals(preview.bytes)).toBe(true); });
  it('la cellule longue du bon de commande se poursuit sur plusieurs pages sans perte', async () => { const d = await draft(); const value = 'Condition de contrôle longue, à conserver entièrement | 99,99 € et $&.\n'.repeat(180) + 'FIN_CELLULE_MODELE_FOURNI'; d.context.fields.CONDITIONS_COMMERCIALES_PARTICULIERES = value; const pdf = await renderProfessionalPdf(d), parsed = await parsePdfBuffer(pdf.bytes, 'stress-table-source.pdf'); expect(parsed.fullText).toContain('FIN_CELLULE_MODELE_FOURNI'); expect(parsed.fullText).toContain('FIN DU CONTRAT'); expect(pdf.lines.every(l => l.x + l.width <= 548 && l.y >= 58)).toBe(true); const annexeHeaders = parsed.fullText.match(/Désignation/g) || []; expect(annexeHeaders.length).toBeGreaterThan(1); });
  it('les noms, adresses et signataires longs conservent leurs fins et leurs zones de signature', async () => {
    const d = await draft(), values = {
      CLIENT_REPRESENTANT: 'Élodie Première ; André Deuxième ; '.repeat(35) + 'FIN_REPRESENTANTS_SOURCE',
      CLIENT_ADRESSE_LIGNE: 'Adresse française très longue d’Œuvre '.repeat(35) + 'FIN_ADRESSE_SOURCE',
      PRESTATAIRE_SIGNATAIRE: 'Camille EXPLOITANT_TEST '.repeat(35) + 'FIN_SIGNATAIRE_SOURCE',
    };
    Object.assign(d.context.fields, values);
    const pdf = await renderProfessionalPdf(d), parsed = await parsePdfBuffer(pdf.bytes, 'source-noms-longs.pdf');
    for (const value of Object.values(values)) expect(compact(pdf.lines.map(l => l.text).join(''))).toContain(compact(value));
    for (const marker of ['FIN_REPRESENTANTS_SOURCE', 'FIN_ADRESSE_SOURCE', 'FIN_SIGNATAIRE_SOURCE', 'FIN DU CONTRAT']) expect(parsed.fullText).toContain(marker);
    const signatures = pdf.lines.filter(l => l.text === 'Signature :'), mentions = pdf.lines.filter(l => l.text.startsWith('Mention :'));
    expect(signatures).toHaveLength(2); expect(mentions).toHaveLength(2);
    signatures.forEach((line, i) => { expect(mentions[i].page).toBe(line.page); expect(line.y - mentions[i].y).toBeGreaterThan(80); });
    expect(pdf.lines.every(l => l.x + l.width <= 548 && l.y >= 58)).toBe(true);
  });
  it('le millésime du numéro suit la date Europe/Paris, même à la frontière de l’année UTC', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try { vi.setSystemTime(new Date('2026-12-31T23:30:00Z')); expect(await allocateContractNumber()).toMatch(/^GF-ABO-2027-/); } finally { vi.useRealTimers(); }
  });
  it('les ressources contractuelles sont incluses dans la distribution Windows', () => { expect(fs.readFileSync('electron-builder.yml', 'utf8')).toContain('from: resources/contracts\n    to: contracts'); });
  it('l’original PDF refuse l’import à l’identique comme prétendue pièce signée', async () => { const d = await draft(), p = await service.previewProfessional(d.id), g = await service.generateProfessional(d.id, p.previewHash!); const original = await service.readProfessionalPdf(d.id, 'original'); const pages = (await PDFDocument.load(original.bytes)).getPageCount(); expect(pages).toBe(g.pageCount); await expect(service.recordManualSignature(g.id, { base64: original.bytes.toString('base64'), signatory: 'TEST_MANUEL', email: 'test@example.test', signedAt: new Date().toISOString().slice(0, 10), consent: true, attested: true, expectedHash: g.pdfHash! })).rejects.toThrow(/non signé/); });
});
