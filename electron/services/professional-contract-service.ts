import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { PDFDocument } from 'pdf-lib';
import type { GeneratedContractRecord } from '../../core/types';
import { buildEffectiveContext, calendarDay, digest, emailValid, frenchDate, renderLegalText, validDate, validateContextForModel, validateModel } from '../../core/contracts/context';
import { EMPTY_TERMS, TRANSITIONS, type ContractState, type ContractTerms, type LegalModel, type ProfessionalContract } from '../../core/contracts/types';
import { bindingFor, variableSlots } from '../../core/contracts/variables';
import { renderProfessionalPdf } from '../../core/contracts/pdf';
import { getClient } from '../../storage/repositories/client-repo';
import { getProfessionalProfile, getSubscriptionConfig } from '../../storage/repositories/profile-repo';
import { allocateContractNumber, appendContractEvent, getProfessionalContract, hasSavedSubscription, listProfessionalModels, listProfessionalContracts, localActor, saveProfessionalContract, saveProfessionalModel } from '../../storage/repositories/professional-contract-repo';
import { getSqliteDatabase, persistDatabaseToDisk } from '../../storage/database/sqlite-db';
import { saveContract } from '../../storage/repositories/contract-repo';
import { ensureStorageDirectories } from '../../storage/storage-paths';

export class ContractError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
let queue: Promise<unknown> = Promise.resolve();
export function serialized<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work); queue = result.catch(() => undefined); return result;
}
function assert(condition: unknown, message: string, status = 400): asserts condition { if (!condition) throw new ContractError(message, status); }
function termsOf(value: Partial<ContractTerms>): ContractTerms {
  const terms = { ...EMPTY_TERMS, ...value };
  for (const key of ['specialConditions', 'firstDueDate', 'endDate', 'commitment', 'discountDuration'] as const) assert(typeof terms[key] === 'string' && terms[key].length <= (key === 'specialConditions' ? 40000 : 1000), `Champ ${key} invalide.`);
  assert(['', 'vat', 'franchise'].includes(terms.taxRegime), 'Régime fiscal invalide.');
  assert(typeof terms.legalReviewAccepted === 'boolean' && typeof terms.commercialExceptionAccepted === 'boolean', 'Consentements invalides.');
  assert(Number.isSafeInteger(terms.discountCents) && Number.isSafeInteger(terms.referencePriceCents), 'Remise invalide.');
  return terms;
}
async function effective(clientId: string, terms: ContractTerms, model?: LegalModel) {
  const client = await getClient(clientId); assert(client, 'Client introuvable.', 404);
  const context = buildEffectiveContext(client, await getProfessionalProfile(), await getSubscriptionConfig(), terms, await hasSavedSubscription());
  return model ? validateContextForModel(context, model) : context;
}
export async function contextFor(clientId: string, terms: Partial<ContractTerms>) { return effective(clientId, termsOf(terms)); }
export async function requireProfessional(id: string): Promise<ProfessionalContract> {
  assert(/^[a-f0-9-]{36}$/.test(id), 'Identifiant invalide.');
  const item = await getProfessionalContract(id); assert(item, 'Contrat introuvable.', 404); return item;
}
function artifact(id: string, suffix: string): string {
  assert(/^[a-f0-9-]{36}$/.test(id) && /^(?:preview-[a-f0-9]{64}|original|signed)\.pdf$/.test(suffix), 'Chemin interdit.');
  const dirs = ensureStorageDirectories(), root = fs.realpathSync(dirs.root);
  const targetDir = path.join(dirs.generated, 'professional');
  fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });
  const canonical = fs.realpathSync(targetDir), relative = path.relative(root, canonical);
  assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Stockage professionnel hors du profil : accès interdit.', 403);
  const file = path.join(canonical, `${id}-${suffix}`);
  if (fs.existsSync(file)) assert(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink(), 'Document non régulier ou lien symbolique interdit.', 403);
  return file;
}
function writeImmutable(file: string, bytes: Buffer) {
  if (fs.existsSync(file)) { assert(digest(fs.readFileSync(file)) === digest(bytes), 'Écrasement interdit : fichier existant différent.', 409); return; }
  fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
}
export async function importLegalModel(input: { text: string; title: string; version: string; date: string; bindings: Record<string, string>; confirmed: boolean }): Promise<LegalModel> {
  assert(input && typeof input.text === 'string' && input.confirmed === true, 'Texte intégral et confirmation de fidélité obligatoires.');
  assert(typeof input.title === 'string' && input.title.trim().length > 5 && input.title.length < 300, 'Titre invalide.');
  assert(typeof input.version === 'string' && /^[\w.-]{1,40}$/.test(input.version) && validDate(input.date), 'Version ou date du modèle invalide.');
  assert(input.bindings && typeof input.bindings === 'object' && !Array.isArray(input.bindings) && Object.keys(input.bindings).length <= 200 && Object.values(input.bindings).every(v => typeof v === 'string'), 'Correspondances invalides.');
  const errors = validateModel(input.text, input.bindings); assert(!errors.length, errors.join(' '));
  const id = digest(JSON.stringify({ title: input.title, text: input.text, version: input.version, date: input.date, bindings: input.bindings }));
  const existing = (await listProfessionalModels()).find(m => m.id === id); if (existing) return existing;
  const model: LegalModel = { id, title: input.title, version: input.version, date: input.date, text: input.text, sha256: digest(input.text), bindings: input.bindings, createdAt: new Date().toISOString() };
  await saveProfessionalModel(model); return model;
}
export async function createProfessionalDraft(input: { requestId: string; clientId: string; modelId: string; terms: Partial<ContractTerms>; parentId?: string; kind?: 'revision' | 'amendment' }): Promise<ProfessionalContract> {
  assert(typeof input.requestId === 'string' && /^[a-f0-9-]{36}$/.test(input.requestId), 'Clé d’idempotence obligatoire.');
  const creationHash = digest(JSON.stringify({ clientId: input.clientId, modelId: input.modelId, terms: termsOf(input.terms || {}), parentId: input.parentId || '', kind: input.kind || 'contract' }));
  const existing = (await listProfessionalContracts()).find(c => c.creationRequestId === input.requestId);
  if (existing) { assert(existing.creationHash === creationHash, 'Clé d’idempotence réutilisée avec un contenu différent.', 409); persistDatabaseToDisk(); return existing; }
  assert(!input.kind || ['revision', 'amendment'].includes(input.kind), 'Type de version invalide.');
  assert(typeof input.clientId === 'string' && typeof input.modelId === 'string', 'Client et modèle obligatoires.');
  const model = (await listProfessionalModels()).find(m => m.id === input.modelId); assert(model, 'Modèle intégral non installé.', 404);
  const context = await effective(input.clientId, termsOf(input.terms || {}), model);
  const parent = input.parentId ? await requireProfessional(input.parentId) : null;
  if (parent) {
    assert(parent.clientId === input.clientId, 'Le client d’une version ne peut pas changer.');
    assert(parent.generatedAt, 'Générer la version initiale avant de créer une révision.');
    if (parent.signature) assert(input.kind === 'amendment', 'Un original signé ne peut être modifié : créer une proposition d’avenant.');
  }
  const now = new Date().toISOString(), number = await allocateContractNumber();
  const item: ProfessionalContract = { id: randomUUID(), creationRequestId: input.requestId, creationHash, number, clientId: input.clientId, clientName: context.client.entreprise, context, model,
    createdAt: now, updatedAt: now, state: 'draft', revision: 1, parentId: parent?.id, kind: parent ? input.kind || 'revision' : 'contract' };
  await saveProfessionalContract(item, 'draft_created', parent ? `Nouvelle proposition liée à ${parent.number}. Aucun original écrasé.` : 'Création du brouillon avec données réelles.');
  return item;
}
export async function updateProfessionalDraft(id: string, revision: number, terms: Partial<ContractTerms>): Promise<ProfessionalContract> {
  const item = await requireProfessional(id);
  assert(['draft', 'review'].includes(item.state), 'Modification interdite : créer une nouvelle version.', 409);
  assert(item.revision === revision, 'Version modifiée dans une autre fenêtre. Recharger.', 409);
  item.context = await effective(item.clientId, termsOf(terms), item.model); item.state = 'draft'; delete item.previewHash;
  item.updatedAt = new Date().toISOString(); item.revision++;
  await saveProfessionalContract(item, 'draft_updated', 'Contexte client/paramètres rechargé ; aperçu précédent invalidé.'); return item;
}
async function validateFresh(item: ProfessionalContract) {
  assert(!item.context.errors.length, item.context.errors.join(' '));
  const fresh = await effective(item.clientId, item.context.terms, item.model);
  assert(fresh.dataHash === item.context.dataHash, 'Données client ou paramètres modifiés : actualiser et vérifier le brouillon.', 409);
  if (/Entrepreneur individuel[\s\S]{0,80}Micro[-–— ]entreprise/i.test(item.model.text)) {
    assert(/(?:entrepreneur individuel|entreprise individuelle|\bEI\b)/i.test(item.context.profile.formeJuridique) && /micro/i.test(item.context.profile.formeJuridique), 'La forme juridique du prestataire ne correspond pas au modèle EI / micro-entreprise. Corriger les données ou faire valider un nouveau modèle.');
  }
  assert(digest(item.model.text) === item.model.sha256, 'Source juridique altérée.', 409);
}
export async function previewProfessional(id: string): Promise<ProfessionalContract> {
  const item = await requireProfessional(id);
  if (item.generatedAt) return item;
  assert(['draft', 'review'].includes(item.state), 'Aperçu modifiable interdit pour ce statut.', 409);
  await validateFresh(item);
  const pdf = await renderProfessionalPdf(item), hash = digest(pdf.bytes);
  writeImmutable(artifact(item.id, `preview-${hash}.pdf`), pdf.bytes);
  item.previewHash = hash; item.pageCount = pdf.pages; item.state = 'review'; item.updatedAt = new Date().toISOString(); item.revision++;
  await saveProfessionalContract(item, 'pdf_previewed', `PDF de ${pdf.pages} pages ; SHA-256 ${hash}.`); return item;
}
export async function generateProfessional(id: string, expectedHash: string): Promise<ProfessionalContract> {
  const item = await requireProfessional(id);
  if (item.generatedAt) { assert(item.pdfHash === expectedHash, 'Ce contrat possède déjà un original différent.', 409); persistDatabaseToDisk(); return item; }
  assert(item.state === 'review' && item.previewHash && item.previewHash === expectedHash, 'Aperçu exact à vérifier avant génération.', 409);
  await validateFresh(item);
  const bytes = readVerified(artifact(id, `preview-${item.previewHash}.pdf`), item.previewHash);
  const filePath = artifact(id, 'original.pdf'); writeImmutable(filePath, bytes);
  const at = new Date().toISOString();
  const fields: Record<string, string> = { ...item.context.fields, REFERENCE_CONTRAT: item.number, NUMERO_CONTRAT: item.number.replace(/^GF-ABO-/, ''), VERSION_MODELE: item.model.version, DATE_EMISSION: frenchDate(calendarDay(new Date(item.createdAt))) };
  // Report factual source substitution only; no invented 100/100 visual/legal fidelity score.
  const fidelity = { originalFormat: 'txt' as const, targetFormat: 'pdf' as const, originalPageCount: 0, generatedPageCount: item.pageCount || 0,
    pageCountPreserved: false, dimensionsPreserved: false, stylesPreserved: false, tablesPreserved: false, imagesPreserved: false,
    clausesIntegrityVerified: true, noInventedClausesVerified: true, originalFileUntouchedVerified: true, issues: [], fidelityScore: 0,
    summary: 'Source texte conservée et substitutions explicites. Mise en page nouvelle ; aucun score de fidélité visuelle ou validation juridique revendiqué.' };
  const record: GeneratedContractRecord = { id, templateId: `professional:${item.model.id}`, templateName: item.model.title, clientId: item.clientId, clientName: item.clientName,
    exportFormat: 'pdf', fileName: `${item.number}.pdf`, filePath, fileSize: bytes.length, sha256: item.previewHash, valuesUsed: fields, createdAt: at,
    report: { id: randomUUID(), timestamp: at, templateId: item.model.id, templateName: item.model.title, clientId: item.clientId, clientDisplayName: item.clientName,
      totalDetectedFields: variableSlots(item.model.text).length, replacedFieldsCount: variableSlots(item.model.text).length, remainingEmptyFieldsCount: 0,
      ambiguousFieldsCount: 0, unreplacedMandatoryFields: [], replacementsApplied: variableSlots(item.model.text).map(slot => {
        const key = bindingFor(item.model.bindings, slot.token, slot.occurrence)!;
        return { variableId: slot.key, originalText: `[${slot.token}]`, canonicalField: key, insertedValue: fields[key], occurrencesReplaced: 1 };
      }),
      anomalies: item.context.warnings, fidelityReport: fidelity,
      legalRecap: { fournisseurIdentite: fields.PRESTATAIRE_NOM, clientIdentite: item.clientName, clientCoordonnees: fields.CLIENT_ADRESSE,
        abonnementNom: fields.ABONNEMENT_NOM, prixTTC: fields.PRIX_TTC, prixHT: fields.PRIX_HT, periodicite: fields.PERIODICITE,
        datePriseEffet: fields.DATE_EFFET, dateSignature: 'Non signé', ibanUtilise: 'Non utilisé', signaturesPresentes: { client: false, entreprise: false },
        missingMandatoryFields: [], legalDisclaimerAccepted: true } } };
  item.pdfHash = item.previewHash; item.generatedAt = at; item.updatedAt = at; item.state = 'generated'; item.revision++;
  // One SQL transaction for document/history + lifecycle + event. Files are immutable and recoverable on failure.
  const db = await getSqliteDatabase(); db.run('BEGIN');
  try {
    await saveContract(record, false);
    await saveProfessionalContract(item, 'generated', `Original identique à l’aperçu ; SHA-256 ${item.pdfHash}.`, false);
    db.run('COMMIT');
  } catch (e) { db.run('ROLLBACK'); throw e; }
  persistDatabaseToDisk();
  return item;
}
function readVerified(file: string, hash: string): Buffer {
  assert(fs.existsSync(file), 'Document introuvable sur disque.', 404);
  const bytes = fs.readFileSync(file); assert(digest(bytes) === hash, 'Intégrité SHA-256 incorrecte : accès bloqué.', 409); return bytes;
}
export async function readProfessionalPdf(id: string, variant: 'preview' | 'original' | 'signed'): Promise<{ bytes: Buffer; name: string }> {
  const item = await requireProfessional(id);
  const hash = variant === 'signed' ? item.signature?.evidenceHash : variant === 'original' ? item.pdfHash : item.pdfHash || item.previewHash;
  assert(hash, 'Document demandé indisponible.', 404);
  const suffix = variant === 'signed' ? 'signed.pdf' : variant === 'original' || item.pdfHash ? 'original.pdf' : `preview-${hash}.pdf`;
  const bytes = readVerified(artifact(id, suffix), hash);
  await appendContractEvent(id, 'document_accessed', `${variant} ; SHA-256 ${hash}.`); persistDatabaseToDisk();
  return { bytes, name: `${item.number}${variant === 'signed' ? '-preuve-manuelle' : ''}.pdf` };
}
export async function transitionProfessional(id: string, revision: number, to: ContractState, reason: string): Promise<ProfessionalContract> {
  const item = await requireProfessional(id);
  assert(item.revision === revision, 'Version modifiée. Recharger.', 409);
  assert(TRANSITIONS[item.state]?.includes(to), 'Transition interdite.', 409);
  assert(typeof reason === 'string' && reason.trim().length >= 5 && reason.length < 2000, 'Motif explicite obligatoire (5 à 1 999 caractères).');
  assert(to !== 'review', 'Utiliser la vérification PDF pour passer à vérifier.');
  const today = calendarDay();
  if (to === 'active') assert(item.signature && item.context.client.dateDebut <= today && (!item.context.terms.endDate || item.context.terms.endDate >= today), 'Signature documentée et date d’effet atteinte obligatoires.');
  if (to === 'expired') assert(item.context.terms.endDate && item.context.terms.endDate < today, 'Date de fin non atteinte ou non stipulée.');
  if (to === 'terminated') item.terminatedAt = new Date().toISOString();
  const previous = item.state; item.state = to; item.updatedAt = new Date().toISOString(); item.revision++;
  await saveProfessionalContract(item, 'status_changed', `${previous} → ${to} ; ${reason.trim()} Aucun service externe actionné.`); return item;
}
export async function recordAcceptance(id: string, email: string, consent: boolean): Promise<ProfessionalContract> {
  const item = await requireProfessional(id);
  assert(['generated', 'pending_signature'].includes(item.state) && item.pdfHash, 'Original généré obligatoire.');
  assert(emailValid(email) && consent === true, 'E-mail et consentement explicite obligatoires.');
  assert(email === item.context.client.email, 'L’e-mail doit correspondre au client du document.');
  assert(!item.acceptedAt, 'Une déclaration d’acceptation est déjà enregistrée.', 409);
  item.acceptedAt = new Date().toISOString(); item.acceptanceEmail = email; item.updatedAt = new Date().toISOString(); item.revision++;
  await saveProfessionalContract(item, 'acceptance_declared', `Acceptation déclarée par l’opérateur local pour ${email} ; document ${item.pdfHash}. Ce n’est pas une signature ni une identification distante vérifiée.`); return item;
}
export async function recordManualSignature(id: string, input: { base64: string; signatory: string; email: string; signedAt: string; consent: boolean; attested: boolean; expectedHash: string }): Promise<ProfessionalContract> {
  const item = await requireProfessional(id);
  assert(['generated', 'pending_signature'].includes(item.state) && item.pdfHash && input.expectedHash === item.pdfHash, 'Original généré et empreinte correspondante obligatoires.');
  assert(input.attested === true && input.consent === true && typeof input.signatory === 'string' && input.signatory.trim().length >= 3 && input.signatory.length < 500 && emailValid(input.email), 'Identité, e-mail, consentement et attestation de contrôle obligatoires.');
  assert(validDate(input.signedAt) && input.signedAt >= calendarDay(new Date(item.createdAt)) && input.signedAt <= calendarDay(), 'Date réelle de signature invalide.');
  assert(typeof input.base64 === 'string' && input.base64.length < 14_000_000 && /^[A-Za-z0-9+/]+={0,2}$/.test(input.base64), 'Pièce PDF trop volumineuse ou invalide.');
  const bytes = Buffer.from(input.base64, 'base64'); assert(bytes.subarray(0, 5).toString() === '%PDF-', 'Un PDF signé manuscrit est requis.');
  const evidence = await PDFDocument.load(bytes);
  assert(evidence.getPageCount() >= (item.pageCount || 1), 'Pièce incomplète : nombre de pages inférieur à l’original.'); // Reject corrupt/encrypted PDF, do not alter signed evidence bytes.
  const hash = digest(bytes); assert(hash !== item.pdfHash, 'La preuve ne peut être le PDF généré non signé.');
  writeImmutable(artifact(id, 'signed.pdf'), bytes);
  item.signature = { kind: 'manual_attested', signatory: input.signatory.trim(), email: input.email, signedAt: input.signedAt,
    recordedAt: new Date().toISOString(), actor: localActor(), sourcePdfHash: item.pdfHash, evidenceHash: hash,
    consent: 'L’opérateur atteste avoir vérifié les signatures manuscrites, le consentement et la correspondance du document complet.', qualification: 'not_verified' };
  item.state = 'signed'; item.updatedAt = new Date().toISOString(); item.revision++;
  await saveProfessionalContract(item, 'manual_signature_attested', `Pièce originale préservée ; preuve ${hash} ; attestation locale uniquement, authenticité non vérifiée par prestataire.`); return item;
}
// Adapters intentionally fail closed until a real provider/transport is implemented.
export async function unavailableIntegration(kind: string): Promise<never> {
  throw new ContractError(`Intégration ${kind} non connectée : aucune opération exécutée.`, 501);
}
export async function fullRenderedSource(id: string): Promise<string> {
  const item = await requireProfessional(id);
  return renderLegalText(item.model, { ...item.context.fields, REFERENCE_CONTRAT: item.number, NUMERO_CONTRAT: item.number.replace(/^GF-ABO-/, ''), VERSION_MODELE: item.model.version, DATE_EMISSION: frenchDate(calendarDay(new Date(item.createdAt))) });
}
