import { createHash } from 'crypto';
import { bindingFor, variableReplacer, variableSlots } from './variables';
import type { ClientRecord, ProfessionalProfile, SubscriptionConfig } from '../types';
import { CONTRACT_FIELD_LABELS, type ContractTerms, type EffectiveContext, type LegalModel } from './types';

export const digest = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export function cents(value: string): number {
  const normalized = value.trim().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(normalized)) throw new Error('Montant invalide : deux décimales maximum, sans symbole monétaire.');
  const [whole, decimal = ''] = normalized.split('.');
  return Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
}
export const money = (n: number): string => `${Math.floor(n / 100)},${String(n % 100).padStart(2, '0')}`;
export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
export function calendarDay(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)!.value).join('-');
}
export const frenchDate = (value: string): string => validDate(value) ? value.split('-').reverse().join('/') : '';
export const emailValid = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\[([^\x5b\]\n]{1,150})\]/g)].map(m => m[1]))];
}
export const normalizeKey = (value: string): string => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
export function validateModel(text: string, bindings: Record<string, string>): string[] {
  const errors: string[] = [];
  if (text.length < 1000 || text.length > 250000) errors.push('Le modèle intégral doit contenir entre 1 000 et 250 000 caractères.');
  const articles = new Set([...text.matchAll(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?ARTICLE\s+(\d{1,2})\b/gi)].map(m => Number(m[1])));
  const missing = Array.from({ length: 27 }, (_, i) => i + 1).filter(i => !articles.has(i));
  if (missing.length) errors.push(`Articles absents : ${missing.join(', ')}.`);
  if (!/ANNEXE\s*(?:N[°o]\s*)?1\b/i.test(text) || !/ANNEXE\s*(?:N[°o]\s*)?2\b/i.test(text)) errors.push('Les deux annexes sont obligatoires.');
  const annex1 = text.search(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?ANNEXE\s*(?:N[°o]\s*)?1\b/i);
  const annex2 = text.search(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?ANNEXE\s*(?:N[°o]\s*)?2\b/i);
  if (annex1 >= 0 && annex2 > annex1) {
    const sections = new Set([...text.slice(annex1, annex2).matchAll(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?(\d{1,2})\s*[.)–—-]/g)].map(m => Number(m[1])));
    if (Array.from({ length: 15 }, (_, i) => i + 1).some(i => !sections.has(i))) errors.push('Les 15 sections numérotées de l’annexe RGPD sont obligatoires.');
  } else errors.push('Les annexes doivent être présentes, ordonnées et identifiables comme titres.');
  if (!/SIGNATURE/i.test(text)) errors.push('La section signatures est absente.');
  const slots = variableSlots(text);
  for (const slot of slots) {
    if (!Object.hasOwn(CONTRACT_FIELD_LABELS, bindingFor(bindings, slot.token, slot.occurrence) || '')) errors.push(`Correspondance requise : [${slot.token}] occurrence ${slot.occurrence}.`);
    if (/^(DATE|NOM ET PRÉNOM|À RENSEIGNER)$/.test(slot.token) && slots.filter(s => s.token === slot.token).length > 1 && !bindings[slot.key]) errors.push(`Variable ambiguë : préciser séparément ${slot.key}.`);
  }
  return errors;
}
export function renderLegalText(model: LegalModel, fields: Record<string, string>): string {
  return variableReplacer(model.bindings, fields)(model.text);
}
export function buildEffectiveContext(client: ClientRecord, profile: ProfessionalProfile, subscription: SubscriptionConfig, terms: ContractTerms, hasSavedSettings: boolean): EffectiveContext {
  const errors: string[] = [], warnings: string[] = [];
  const requireField = (value: string, name: string) => { if (!value?.trim()) errors.push(`${name} obligatoire.`); };
  for (const [v, label] of [[client.entreprise, 'Entreprise du client'], [client.formeJuridique, 'Forme juridique client'], [client.siret, 'SIRET client'],
    [client.representantLegal, 'Représentant légal client'], [client.fonctionRepresentant, 'Fonction du représentant'], [client.email, 'E-mail client'],
    [profile.nom, 'Nom de l’exploitant'], [profile.prenom, 'Prénom de l’exploitant'], [profile.siret, 'SIRET prestataire'], [profile.formeJuridique, 'Forme juridique prestataire'],
    [profile.adresse, 'Adresse du prestataire'], [profile.codePostal, 'Code postal prestataire'], [profile.ville, 'Ville prestataire'], [profile.emailPro, 'E-mail prestataire']]) requireField(v, label);
  const clientAddress = client.adresseProfessionnelle.trim() || [client.adresse, client.complementAdresse, client.codePostal, client.ville, client.pays].filter(Boolean).join(', ');
  if (!client.adresseProfessionnelle.trim() && (!client.adresse.trim() || !client.codePostal.trim() || !client.ville.trim())) errors.push('Adresse complète du client obligatoire.');
  for (const [v, label] of [[client.siret, 'client'], [profile.siret, 'prestataire']]) if (!/^\d{14}$/.test(v.replace(/\s/g, ''))) errors.push(`SIRET ${label} invalide (14 chiffres requis ; existence non vérifiée).`);
  if (!emailValid(client.email) || !emailValid(profile.emailPro)) errors.push('E-mail client ou prestataire invalide.');
  const rawPrice = client.prixTTC?.trim() || (hasSavedSettings ? subscription.prixTTC?.trim() : '');
  const priceSource = client.prixTTC?.trim() ? 'client' : rawPrice ? 'settings' : 'missing';
  let priceCents = 0, rateBasisPoints = 0;
  try { priceCents = cents(rawPrice); if (priceCents <= 0) errors.push('Prix TTC strictement positif obligatoire.'); } catch { errors.push('Prix TTC réel manquant ou invalide ; aucun tarif de secours appliqué.'); }
  if (profile.tvaRegime && terms.taxRegime && profile.tvaRegime !== terms.taxRegime) errors.push('Régime de TVA contradictoire avec les paramètres du prestataire : corriger la source avant génération.');
  if (hasSavedSettings && subscription.devise !== 'EUR') errors.push('Devise EUR obligatoire pour ce modèle ; aucune conversion inventée.');
  if (terms.taxRegime === 'franchise' && hasSavedSettings) { try { if (cents(subscription.tvaTaux) !== 0) errors.push('Franchise de TVA : enregistrer un taux de 0 dans les paramètres pour conserver HT = TTC partout.'); } catch { errors.push('Taux de TVA invalide dans les paramètres.'); } }
  if (!terms.taxRegime) errors.push('Confirmer le régime de TVA applicable.');
  if (terms.taxRegime === 'vat') {
    try { if (!hasSavedSettings) throw new Error(); rateBasisPoints = cents(subscription.tvaTaux); if (rateBasisPoints > 10000) throw new Error(); } catch { errors.push('Taux de TVA invalide.'); }
  }
  const periodsPerYear: Record<string, number> = { mensuelle: 12, trimestrielle: 4, semestrielle: 2, annuelle: 1 };
  const htCents = Math.round(priceCents * 10000 / (10000 + rateBasisPoints)), taxCents = priceCents - htCents;
  const frequencyRaw = client.frequencePaiement?.trim() || (hasSavedSettings ? subscription.frequence?.trim() || subscription.periodicite?.trim() : '');
  const frequency = /^(mensuel(?:le)?|mois)$/i.test(frequencyRaw) ? 'mensuelle' : /^(annuel(?:le)?|an|annee|année)$/i.test(frequencyRaw) ? 'annuelle' : /^(trimestriel(?:le)?|trimestre)$/i.test(frequencyRaw) ? 'trimestrielle' : /^(semestriel(?:le)?|semestre)$/i.test(frequencyRaw) ? 'semestrielle' : '';
  if (!frequency) errors.push('Périodicité réelle non prise en charge : renseigner mensuelle, trimestrielle, semestrielle ou annuelle.');
  if (!validDate(client.dateDebut)) errors.push('Date de début client réelle obligatoire (AAAA-MM-JJ).');
  if (!validDate(terms.firstDueDate)) errors.push('Première échéance obligatoire (non déduite de la date du jour).');
  if (validDate(client.dateDebut) && validDate(terms.firstDueDate) && terms.firstDueDate < client.dateDebut) errors.push('Première échéance antérieure à la prise d’effet.');
  if (terms.endDate && (!validDate(terms.endDate) || terms.endDate < client.dateDebut)) errors.push('Date de fin invalide ou antérieure au début.');
  if (!Number.isSafeInteger(terms.discountCents) || terms.discountCents < 0 || !Number.isSafeInteger(terms.referencePriceCents) || terms.referencePriceCents < 0) errors.push('Remise et tarif de référence invalides.');
  if (terms.discountCents && (terms.referencePriceCents - terms.discountCents !== priceCents || !terms.discountDuration.trim())) errors.push('La remise doit correspondre au prix final enregistré et comporter une durée explicite.');
  if ((priceCents !== 9999 || frequency !== 'mensuelle' || terms.discountCents > 0 || terms.commitment.trim()) && (!terms.specialConditions.trim() || !terms.commercialExceptionAccepted)) errors.push('Dérogation commerciale : conditions particulières et confirmation explicites obligatoires.');
  if (!terms.legalReviewAccepted) errors.push('Vérification du texte juridique et des informations à confirmer.');
  warnings.push('Identités et SIRET non vérifiés auprès des registres ; forme EI/micro-entreprise du modèle à vérifier.', 'Cohérence juridique (préavis, TVA, responsabilité, RGPD et sous-traitants) à faire valider ; aucune certification juridique.');
  if (!hasSavedSettings) warnings.push('Paramètres d’abonnement non enregistrés : seules les valeurs explicites de la fiche client sont utilisables.');
  warnings.push('Facturation, paiements, e-mail et signature électronique non connectés. Aucune action sur ces services.');
  const effectiveCommitment = terms.commitment.trim() || (hasSavedSettings ? subscription.dureeEngagement.trim() : '');
  if (effectiveCommitment && (!terms.specialConditions.trim() || !terms.commercialExceptionAccepted) && !errors.some(e => e.startsWith('Dérogation commerciale'))) errors.push('Dérogation commerciale : engagement des paramètres à reprendre explicitement au bon de commande.');
  const none = 'Non renseigné', unsigned = 'À compléter lors de la signature';
  const fields: Record<string, string> = {
    PRESTATAIRE_NOM: `${profile.prenom} ${profile.nom}`.trim(), PRESTATAIRE_NOM_COMMERCIAL: profile.nomCommercial || none,
    PRESTATAIRE_FORME_JURIDIQUE: profile.formeJuridique, PRESTATAIRE_SIREN: profile.siret.replace(/\s/g, '').slice(0, 9), PRESTATAIRE_SIRET: profile.siret,
    PRESTATAIRE_ADRESSE: [profile.adresse, profile.codePostal, profile.ville, profile.pays].filter(Boolean).join(', '), PRESTATAIRE_EMAIL: profile.emailPro,
    PRESTATAIRE_TELEPHONE: profile.telephonePro || none, PRESTATAIRE_SITE: profile.siteInternet || none,
    PRESTATAIRE_SIGNATAIRE: profile.nomSignataire || `${profile.prenom} ${profile.nom}`.trim(), PRESTATAIRE_QUALITE: profile.fonctionSignataire || none,
    DATE_SOUSCRIPTION: frenchDate(client.dateSouscription), CLIENT_TVA_INTRACOMMUNAUTAIRE: client.tvaIntracommunautaire?.trim() || 'Non renseigné — à confirmer',
    CLIENT_ADRESSE_LIGNE: client.adresseProfessionnelle.trim() || [client.adresse, client.complementAdresse].filter(Boolean).join(', '),
    CLIENT_CODE_POSTAL_VILLE: client.codePostal.trim() && client.ville.trim() ? `${client.codePostal} – ${client.ville}` : '',
    CLIENT_RAISON_SOCIALE: client.entreprise, CLIENT_NOM_COMMERCIAL: client.customFields?.NOM_COMMERCIAL || none,
    CLIENT_FORME_JURIDIQUE: client.formeJuridique, CLIENT_SIREN: client.siret.replace(/\s/g, '').slice(0, 9), CLIENT_SIRET: client.siret,
    CLIENT_ADRESSE: clientAddress, CLIENT_EMAIL: client.email, CLIENT_TELEPHONE: client.telephone || none,
    CLIENT_REPRESENTANT: client.representantLegal, CLIENT_QUALITE: client.fonctionRepresentant,
    ABONNEMENT_NOM: client.typeAbonnement?.trim() || (hasSavedSettings ? subscription.produit : '') || '',
    PRIX_TTC: money(priceCents), PRIX_HT: money(htCents), TVA_MONTANT: money(taxCents), TVA_TAUX: money(rateBasisPoints),
    TVA_MENTION: terms.taxRegime === 'franchise' ? 'TVA non applicable, article 293 B du CGI (régime déclaré par l’opérateur)' : `TVA au taux déclaré de ${money(rateBasisPoints)} %`,
    MONTANT_ANNUEL: terms.discountCents ? 'Non calculé : remise temporaire, échéancier non connecté' : money(priceCents * (periodsPerYear[frequency] || 0)),
    PERIODICITE: frequency, DATE_EFFET: frenchDate(client.dateDebut), DATE_FIN: terms.endDate ? frenchDate(terms.endDate) : 'Non stipulée',
    PREMIERE_ECHEANCE: frenchDate(terms.firstDueDate), DUREE_ENGAGEMENT: effectiveCommitment || 'Aucun engagement particulier renseigné',
    MOYEN_PAIEMENT: client.moyenPaiement || (hasSavedSettings ? subscription.modalitesPaiement : '') || none,
    REMISE: terms.discountCents ? `${money(terms.discountCents)} € par période sur ${money(terms.referencePriceCents)} € ; ${terms.discountDuration}` : 'Aucune remise renseignée',
    CONDITIONS_PARTICULIERES: terms.specialConditions.trim() || 'Aucune condition particulière ajoutée',
    DATE_SIGNATURE: unsigned, LIEU_SIGNATURE: unsigned, SIGNATURE_CLIENT: 'Non signé', SIGNATURE_PRESTATAIRE: 'Non signé',
  };
  fields.MONTANT_MENSUEL_TOTAL = frequency === 'mensuelle' ? money(priceCents) : `Non applicable — périodicité ${frequency}, montant dû par période : ${money(priceCents)}`;
  fields.CONDITIONS_COMMERCIALES_PARTICULIERES = [`Tarif effectif : ${fields.PRIX_TTC} € TTC / périodicité ${frequency} (${fields.PRIX_HT} € HT ; TVA ${fields.TVA_MONTANT} €).`, `Engagement : ${fields.DUREE_ENGAGEMENT}.`, `Remise : ${fields.REMISE}.`, `Conditions particulières expressément renseignées : ${fields.CONDITIONS_PARTICULIERES}`].join('\n');
  requireField(fields.ABONNEMENT_NOM, 'Offre');
  return { client, profile: { ...profile, signatureDessinee: '', signatureImage: '', iban: '', bic: '', rib: '' }, subscription, terms,
    fields, errors, warnings, priceCents, htCents, taxCents, rateBasisPoints, priceSource,
    dataHash: digest(JSON.stringify({ client, profile, subscription: hasSavedSettings ? subscription : null, terms, hasSavedSettings })) };
}

export function validateContextForModel(context: EffectiveContext, model: LegalModel): EffectiveContext {
  for (const key of model.requiredFields || []) if (!context.fields[key]?.trim() || context.fields[key] === 'Non renseigné') context.errors.push(`${CONTRACT_FIELD_LABELS[key] || key} obligatoire pour ce modèle.`);
  if (model.bundled) {
    if (context.client.dateSouscription && (!validDate(context.client.dateSouscription) || context.client.dateSouscription > context.client.dateDebut)) context.errors.push('Date de souscription invalide ou postérieure à la date d’activation prévue.');
    if (context.profile.nomCommercial.trim().toLowerCase() !== 'garageflows') context.errors.push('Le nom commercial du prestataire ne correspond pas au modèle GarageFlows.');
    if (context.profile.siteInternet && !/^https:\/\/garageflows\.fr\/?$/.test(context.profile.siteInternet)) context.errors.push('Le site du profil contredit le site littéral du modèle : vérifier avant génération.');
    if (context.fields.PERIODICITE !== 'mensuelle' && !new RegExp(context.fields.PERIODICITE === 'annuelle' ? 'annuel' : context.fields.PERIODICITE === 'trimestrielle' ? 'trimestr' : 'semestr', 'i').test(context.terms.specialConditions)) context.errors.push('Décrire explicitement la périodicité dérogatoire dans les conditions particulières du bon de commande.');
  }
  context.warnings.push(...(model.reviewNotes || []));
  return context;
}
