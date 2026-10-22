// Synthetic layout/flow fixture only. NOT the user's legal model, NOT a usable contract.
import { CONTRACT_FIELD_LABELS, EMPTY_TERMS, type ContractTerms } from '../../core/contracts/types';
import { getDefaultProfessionalProfile, getDefaultSubscriptionConfig } from '../../storage/repositories/profile-repo';
import { emptyClient } from '../../storage/repositories/client-repo';

export const syntheticLegalSource = [
  '# SCÉNARIO TECHNIQUE SYNTHÉTIQUE — NE PAS UTILISER COMME CONTRAT',
  'Référence GF-ABO-[NUMÉRO_CONTRAT] — [CLIENT_RAISON_SOCIALE]',
  '[PRESTATAIRE_NOM] — [PRESTATAIRE_SIRET] — [PRESTATAIRE_ADRESSE]',
  'Client : [CLIENT_REPRESENTANT], [CLIENT_ADRESSE], [CLIENT_EMAIL]',
  'Prix : [PRIX_TTC] € TTC ; [PRIX_HT] € HT ; TVA [TVA_MONTANT] € ; [PERIODICITE]. Effet [DATE_EFFET].',
  'Signature : [DATE_SIGNATURE] — [SIGNATURE_CLIENT].',
  ...Array.from({ length: 27 }, (_, i) => `## ARTICLE ${i + 1} — MARQUEUR_ARTICLE_${String(i + 1).padStart(2, '0')}\n\nTexte synthétique de contrôle de pagination : Élodie, l’entreprise, cœur, confidentialité et montant 99,99 €. Ce texte n’est pas une clause juridique.\n`),
  '# ANNEXE 1 — DONNÉES SYNTHÉTIQUES RGPD',
  ...Array.from({ length: 15 }, (_, i) => `## ${i + 1}. MARQUEUR_RGPD_${String(i + 1).padStart(2, '0')}\n\nSection synthétique non juridique : donnée à conserver intégralement.\n`),
  '# ANNEXE 2 — BON DE COMMANDE SYNTHÉTIQUE',
  'Conditions expressément saisies : [CONDITIONS_PARTICULIERES]',
  '# SIGNATURES', '## Pour le prestataire', 'Nom et qualité à vérifier. Signature non apposée.', '## Pour le client',
  'Nom et qualité à vérifier. Signature non apposée.',
  'AVERTISSEMENT FINAL SYNTHÉTIQUE : document de test, aucune valeur juridique. MARQUEUR_FIN_INTEGRAL',
].join('\n\n');
export const syntheticBindings = { ...Object.fromEntries(Object.keys(CONTRACT_FIELD_LABELS).map(k => [k, k])), NUMÉRO_CONTRAT: 'NUMERO_CONTRAT' };
export const testTerms: ContractTerms = { ...EMPTY_TERMS, taxRegime: 'vat', firstDueDate: '2020-01-02', legalReviewAccepted: true };
export const testProfile = () => ({ ...getDefaultProfessionalProfile(), nom: 'EXPLOITANT_TEST', prenom: 'Camille', formeJuridique: 'Entrepreneur individuel — Micro-entreprise', siret: '12345678901234', adresse: '1 rue de la Simulation', codePostal: '67000', ville: 'Strasbourg', emailPro: 'exploitant@example.test', nomSignataire: 'Camille EXPLOITANT_TEST', fonctionSignataire: 'Exploitant' });
export const testClient = () => ({ ...emptyClient(), nom: 'CLIENT_TEST', prenom: 'Élodie', entreprise: 'ATELIER_SYNTHÉTIQUE_TEST', formeJuridique: 'SAS', siret: '98765432101234', representantLegal: 'Élodie d’Œuvre', fonctionRepresentant: 'Présidente', email: 'elodie@example.test', adresse: '2 rue du Test', codePostal: '67000', ville: 'Strasbourg', dateSouscription: '2019-12-30', dateDebut: '2020-01-01' });
export const testSubscription = () => ({ ...getDefaultSubscriptionConfig(), prixTTC: '99,99', tvaTaux: '20' });
