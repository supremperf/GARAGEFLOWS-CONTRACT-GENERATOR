import type { ClientRecord, ProfessionalProfile, SubscriptionConfig } from '../types';

export const CONTRACT_STATES = ['draft', 'review', 'generated', 'pending_signature', 'signed', 'active', 'terminated', 'expired', 'archived'] as const;
export type ContractState = typeof CONTRACT_STATES[number];
export const STATE_LABELS: Record<ContractState, string> = {
  draft: 'Brouillon', review: 'À vérifier', generated: 'Généré — non signé', pending_signature: 'En attente de signature',
  signed: 'Signé — manuscrit déclaré', active: 'Actif', terminated: 'Résilié', expired: 'Expiré', archived: 'Archivé',
};
export interface LegalModel {
  id: string; title: string; version: string; date: string; text: string; sha256: string;
  bindings: Record<string, string>; createdAt: string;
  bundled?: boolean; requiredFields?: string[]; reviewNotes?: string[];
}
export interface ContractTerms {
  specialConditions: string; firstDueDate: string; endDate: string; commitment: string;
  discountCents: number; referencePriceCents: number; discountDuration: string;
  taxRegime: '' | 'vat' | 'franchise'; legalReviewAccepted: boolean; commercialExceptionAccepted: boolean;
}
export const EMPTY_TERMS: ContractTerms = {
  specialConditions: '', firstDueDate: '', endDate: '', commitment: '', discountCents: 0,
  referencePriceCents: 0, discountDuration: '', taxRegime: '', legalReviewAccepted: false, commercialExceptionAccepted: false,
};
export interface EffectiveContext {
  client: ClientRecord; profile: ProfessionalProfile; subscription: SubscriptionConfig;
  terms: ContractTerms; fields: Record<string, string>; errors: string[]; warnings: string[];
  priceCents: number; htCents: number; taxCents: number; rateBasisPoints: number;
  priceSource: 'client' | 'settings' | 'missing'; dataHash: string;
}
export interface ContractEvent {
  id: string; contractId: string; at: string; actor: string; action: string;
  detail: string; previousHash: string; hash: string;
}
export interface ProfessionalContract {
  id: string; number: string; clientId: string; clientName: string; parentId?: string;
  creationRequestId: string; creationHash: string;
  revision: number; kind: 'contract' | 'revision' | 'amendment'; state: ContractState;
  model: LegalModel; context: EffectiveContext; createdAt: string; updatedAt: string;
  previewHash?: string; pdfHash?: string; pageCount?: number; generatedAt?: string; terminatedAt?: string;
  acceptedAt?: string; acceptanceEmail?: string; signature?: SignatureEvidence;
}
export interface SignatureEvidence {
  kind: 'manual_attested'; signatory: string; email: string; signedAt: string;
  recordedAt: string; actor: string; sourcePdfHash: string; evidenceHash: string;
  consent: string; qualification: 'not_verified';
}
export const CONTRACT_FIELD_LABELS: Record<string, string> = {
  REFERENCE_CONTRAT: 'Référence complète GF-ABO-…', NUMERO_CONTRAT: 'Numéro sans préfixe GF-ABO-', VERSION_MODELE: 'Version du modèle', DATE_EMISSION: 'Date d’émission',
  PRESTATAIRE_NOM: 'Exploitant : prénom et nom', PRESTATAIRE_NOM_COMMERCIAL: 'Nom commercial du prestataire',
  PRESTATAIRE_FORME_JURIDIQUE: 'Forme juridique du prestataire', PRESTATAIRE_SIREN: 'SIREN prestataire', PRESTATAIRE_SIRET: 'SIRET prestataire',
  PRESTATAIRE_ADRESSE: 'Adresse complète du prestataire', PRESTATAIRE_EMAIL: 'E-mail du prestataire', PRESTATAIRE_TELEPHONE: 'Téléphone du prestataire',
  PRESTATAIRE_SITE: 'Site du prestataire', PRESTATAIRE_SIGNATAIRE: 'Signataire du prestataire', PRESTATAIRE_QUALITE: 'Qualité du signataire du prestataire',
  CLIENT_RAISON_SOCIALE: 'Entreprise du client', CLIENT_NOM_COMMERCIAL: 'Nom commercial client (champ personnalisé)',
  CLIENT_FORME_JURIDIQUE: 'Forme juridique client', CLIENT_SIREN: 'SIREN client', CLIENT_SIRET: 'SIRET client', CLIENT_ADRESSE: 'Adresse complète client',
  CLIENT_TVA_INTRACOMMUNAUTAIRE: 'TVA intracommunautaire client (ou mention explicite)', CLIENT_ADRESSE_LIGNE: 'Adresse du siège hors code postal/ville', CLIENT_CODE_POSTAL_VILLE: 'Code postal et ville client',
  DATE_SOUSCRIPTION: 'Date de souscription enregistrée', CONDITIONS_COMMERCIALES_PARTICULIERES: 'Conditions et tarif particulier du bon de commande', MONTANT_MENSUEL_TOTAL: 'Montant mensuel (ou non-applicabilité explicite)',
  CLIENT_EMAIL: 'E-mail client', CLIENT_TELEPHONE: 'Téléphone client', CLIENT_REPRESENTANT: 'Représentant légal client', CLIENT_QUALITE: 'Fonction du représentant',
  ABONNEMENT_NOM: 'Offre', PRIX_TTC: 'Prix TTC par période', PRIX_HT: 'Prix HT par période', TVA_MONTANT: 'Montant TVA', TVA_TAUX: 'Taux TVA',
  TVA_MENTION: 'Mention du régime fiscal', MONTANT_ANNUEL: 'Montant annuel indicatif', PERIODICITE: 'Périodicité effective',
  DATE_EFFET: 'Date de début réelle', DATE_FIN: 'Date de fin (facultative)', PREMIERE_ECHEANCE: 'Première échéance renseignée',
  DUREE_ENGAGEMENT: 'Engagement renseigné', MOYEN_PAIEMENT: 'Mode de paiement renseigné', REMISE: 'Remise documentée',
  CONDITIONS_PARTICULIERES: 'Conditions particulières explicites', DATE_SIGNATURE: 'Date à compléter lors de la signature (jamais la date du jour)',
  LIEU_SIGNATURE: 'Lieu à compléter lors de la signature', SIGNATURE_CLIENT: 'Zone non signée', SIGNATURE_PRESTATAIRE: 'Zone non signée',
};
export const INTEGRATIONS = {
  invoices: { available: false, message: 'Facturation non connectée : aucun contrôle de factures externes.' },
  payments: { available: false, message: 'Paiements non connectés : aucun prélèvement ni encaissement exécuté.' },
  email: { available: false, message: 'E-mail non connecté : aucun message envoyé.' },
  signature: { available: false, message: 'Signature électronique non connectée : aucune signature avancée ou qualifiée.' },
} as const;

export const TRANSITIONS: Record<ContractState, ContractState[]> = {
  draft: ['review', 'archived'], review: ['draft', 'archived'], generated: ['pending_signature', 'archived'],
  pending_signature: ['generated', 'archived'], signed: ['active', 'terminated', 'expired'], active: ['terminated', 'expired'],
  terminated: ['archived'], expired: ['archived'], archived: [],
};
