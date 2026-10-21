import {
  ClientRecord,
  CustomVariableDefinition,
  ProfessionalProfile,
  SubscriptionConfig,
  VariableCategory,
  VariableDataType,
} from '../types';

export interface DictionaryFieldEntry {
  key: string;
  variable: string;
  label: string;
  category: VariableCategory;
  dataType: VariableDataType;
  required: boolean;
  defaultValue: string;
  synonyms: string[];
  description: string;
}

export const OFFICIAL_VARIABLE_DICTIONARY: DictionaryFieldEntry[] = [
  // --- CLIENT ---
  {
    key: 'CLIENT_NOM',
    variable: '{{CLIENT_NOM}}',
    label: 'Nom du client',
    category: 'client',
    dataType: 'text',
    required: true,
    defaultValue: '',
    synonyms: ['nom', 'nom_client', 'client_nom', 'nom du client', 'nom de famille', 'patronyme'],
    description: 'Nom de famille du client souscripteur (ex: DUPONT)',
  },
  {
    key: 'CLIENT_PRENOM',
    variable: '{{CLIENT_PRENOM}}',
    label: 'Prénom du client',
    category: 'client',
    dataType: 'text',
    required: true,
    defaultValue: '',
    synonyms: ['prenom', 'prénom', 'prenom_client', 'client_prenom', 'prénom du client', 'prenom du client'],
    description: 'Prénom du client souscripteur (ex: Jean)',
  },
  {
    key: 'CLIENT_NOM_COMPLET',
    variable: '{{CLIENT_NOM_COMPLET}}',
    label: 'Nom et prénom du client',
    category: 'client',
    dataType: 'text',
    required: true,
    defaultValue: '',
    synonyms: ['nom_complet', 'nom et prenom', 'nom et prénom', 'identite_client', 'je soussigne', 'je soussigné'],
    description: 'Prénom et Nom complets du client (ex: Jean DUPONT)',
  },
  {
    key: 'CLIENT_CIVILITE',
    variable: '{{CLIENT_CIVILITE}}',
    label: 'Civilité du client',
    category: 'client',
    dataType: 'text',
    required: false,
    defaultValue: 'M.',
    synonyms: ['civilite', 'civilité', 'titre'],
    description: 'Civilité (M., Mme)',
  },
  {
    key: 'CLIENT_ADRESSE',
    variable: '{{CLIENT_ADRESSE}}',
    label: 'Adresse du client',
    category: 'client',
    dataType: 'text',
    required: true,
    defaultValue: '',
    synonyms: ['adresse', 'adresse_client', 'client_adresse', 'adresse du client', 'rue', 'voie'],
    description: 'Numéro et rue du domicile ou siège client (ex: 12 rue de Paris)',
  },
  {
    key: 'CLIENT_ADRESSE_COMPLETE',
    variable: '{{CLIENT_ADRESSE_COMPLETE}}',
    label: 'Adresse complète du client',
    category: 'client',
    dataType: 'text',
    required: true,
    defaultValue: '',
    synonyms: ['adresse_complete', 'adresse complète', 'domicile', 'residant au', 'résidant au', 'demeurant au'],
    description: 'Adresse complète incluant code postal et ville (ex: 12 rue de Paris, 57000 Metz)',
  },
  {
    key: 'CLIENT_COMPLEMENT_ADRESSE',
    variable: '{{CLIENT_COMPLEMENT_ADRESSE}}',
    label: "Complément d'adresse client",
    category: 'client',
    dataType: 'text',
    required: false,
    defaultValue: '',
    synonyms: ['complement_adresse', "complément d'adresse", 'batiment', 'appartement'],
    description: 'Bâtiment, étage, porte ou boîte postale',
  },
  {
    key: 'CLIENT_CODE_POSTAL',
    variable: '{{CLIENT_CODE_POSTAL}}',
    label: 'Code postal du client',
    category: 'client',
    dataType: 'postal_code',
    required: true,
    defaultValue: '',
    synonyms: ['code_postal', 'cp', 'code postal', 'code_postal_client', 'cp_client'],
    description: 'Code postal du client (ex: 57000)',
  },
  {
    key: 'CLIENT_VILLE',
    variable: '{{CLIENT_VILLE}}',
    label: 'Ville du client',
    category: 'client',
    dataType: 'text',
    required: true,
    defaultValue: '',
    synonyms: ['ville', 'ville_client', 'commune', 'localite', 'localité'],
    description: 'Ville de résidence ou du siège du client (ex: Metz)',
  },
  {
    key: 'CLIENT_PAYS',
    variable: '{{CLIENT_PAYS}}',
    label: 'Pays du client',
    category: 'client',
    dataType: 'text',
    required: false,
    defaultValue: 'France',
    synonyms: ['pays', 'pays_client'],
    description: 'Pays du client (ex: France)',
  },
  {
    key: 'CLIENT_TELEPHONE',
    variable: '{{CLIENT_TELEPHONE}}',
    label: 'Téléphone du client',
    category: 'client',
    dataType: 'phone',
    required: true,
    defaultValue: '',
    synonyms: [
      'telephone',
      'téléphone',
      'tel',
      'tél',
      'numero de telephone',
      'numéro de téléphone',
      'portable',
      'mobile',
      'joignable au',
    ],
    description: 'Numéro de téléphone du client (ex: 06 00 00 00 00)',
  },
  {
    key: 'CLIENT_EMAIL',
    variable: '{{CLIENT_EMAIL}}',
    label: 'E-mail du client',
    category: 'client',
    dataType: 'email',
    required: true,
    defaultValue: '',
    synonyms: ['email', 'e-mail', 'mail', 'courriel', 'adresse email', 'adresse e-mail', 'email_client'],
    description: 'Adresse électronique du client (ex: jean.dupont@email.fr)',
  },
  {
    key: 'CLIENT_DATE_NAISSANCE',
    variable: '{{CLIENT_DATE_NAISSANCE}}',
    label: 'Date de naissance du client',
    category: 'client',
    dataType: 'date',
    required: false,
    defaultValue: '',
    synonyms: ['date_naissance', 'date de naissance', 'ne le', 'né le', 'née le', 'naissance'],
    description: 'Date de naissance au format JJ/MM/AAAA (ex: 15/04/1995)',
  },
  {
    key: 'CLIENT_LIEU_NAISSANCE',
    variable: '{{CLIENT_LIEU_NAISSANCE}}',
    label: 'Lieu de naissance du client',
    category: 'client',
    dataType: 'text',
    required: false,
    defaultValue: '',
    synonyms: ['lieu_naissance', 'lieu de naissance', 'ne a', 'né à'],
    description: 'Ville de naissance du client',
  },
  {
    key: 'CLIENT_ENTREPRISE',
    variable: '{{CLIENT_ENTREPRISE}}',
    label: 'Entreprise du client',
    category: 'client',
    dataType: 'text',
    required: false,
    defaultValue: '',
    synonyms: ['entreprise_client', 'societe_client', 'société du client', 'raison_sociale_client', 'garage_client'],
    description: "Raison sociale ou nom commercial de l'entreprise cliente",
  },
  {
    key: 'CLIENT_FORME_JURIDIQUE',
    variable: '{{CLIENT_FORME_JURIDIQUE}}',
    label: 'Forme juridique du client',
    category: 'client',
    dataType: 'text',
    required: false,
    defaultValue: '',
    synonyms: ['forme_juridique_client', 'statut_client'],
    description: 'Forme juridique du client (SAS, SARL, EURL, Auto-entrepreneur...)',
  },
  {
    key: 'CLIENT_SIRET',
    variable: '{{CLIENT_SIRET}}',
    label: 'SIRET du client',
    category: 'client',
    dataType: 'siret',
    required: false,
    defaultValue: '',
    synonyms: ['siret_client', 'siret du client', 'numero_siret_client'],
    description: "Numéro SIRET à 14 chiffres de l'entreprise cliente",
  },
  {
    key: 'CLIENT_TVA_INTRA',
    variable: '{{CLIENT_TVA_INTRA}}',
    label: 'TVA intracommunautaire du client',
    category: 'client',
    dataType: 'text',
    required: false,
    defaultValue: '',
    synonyms: ['tva_intra_client', 'tva intracommunautaire client'],
    description: 'Numéro de TVA intracommunautaire du client',
  },
  {
    key: 'CLIENT_REPRESENTANT',
    variable: '{{CLIENT_REPRESENTANT}}',
    label: 'Représentant légal du client',
    category: 'client',
    dataType: 'text',
    required: false,
    defaultValue: '',
    synonyms: ['representant_client', 'représentant du client', 'gerant_client'],
    description: "Nom et prénom du représentant légal de l'entreprise cliente",
  },
  {
    key: 'CLIENT_FONCTION_REPRESENTANT',
    variable: '{{CLIENT_FONCTION_REPRESENTANT}}',
    label: 'Fonction du représentant client',
    category: 'client',
    dataType: 'text',
    required: false,
    defaultValue: '',
    synonyms: ['fonction_representant_client', 'qualite_representant_client'],
    description: 'Fonction du représentant légal du client (ex: Gérant, Président)',
  },

  // --- ENTREPRISE (GARAGEFLOWS) ---
  {
    key: 'ENTREPRISE_NOM',
    variable: '{{ENTREPRISE_NOM}}',
    label: 'Nom GarageFlows (Entreprise)',
    category: 'entreprise',
    dataType: 'text',
    required: true,
    defaultValue: 'GarageFlows',
    synonyms: ['entreprise_nom', 'nom_entreprise', 'fournisseur', 'prestataire', 'nom garageflows'],
    description: 'Raison sociale ou nom commercial de votre structure GarageFlows',
  },
  {
    key: 'ENTREPRISE_ADRESSE',
    variable: '{{ENTREPRISE_ADRESSE}}',
    label: 'Adresse GarageFlows',
    category: 'entreprise',
    dataType: 'text',
    required: true,
    defaultValue: '',
    synonyms: ['entreprise_adresse', 'adresse_entreprise', 'siege_social', 'siège social', 'adresse garageflows'],
    description: 'Adresse complète du siège social GarageFlows',
  },
  {
    key: 'ENTREPRISE_CODE_POSTAL',
    variable: '{{ENTREPRISE_CODE_POSTAL}}',
    label: 'Code postal GarageFlows',
    category: 'entreprise',
    dataType: 'postal_code',
    required: false,
    defaultValue: '',
    synonyms: ['entreprise_cp', 'code_postal_entreprise'],
    description: 'Code postal de GarageFlows',
  },
  {
    key: 'ENTREPRISE_VILLE',
    variable: '{{ENTREPRISE_VILLE}}',
    label: 'Ville GarageFlows',
    category: 'entreprise',
    dataType: 'text',
    required: false,
    defaultValue: '',
    synonyms: ['entreprise_ville', 'ville_entreprise', 'fait a', 'fait à'],
    description: 'Ville du siège social GarageFlows',
  },
  {
    key: 'ENTREPRISE_SIRET',
    variable: '{{ENTREPRISE_SIRET}}',
    label: 'SIRET GarageFlows',
    category: 'entreprise',
    dataType: 'siret',
    required: true,
    defaultValue: '',
    synonyms: ['entreprise_siret', 'siret_entreprise', 'siret garageflows', 'siret', 'immatriculee sous le numero'],
    description: 'Numéro SIRET officiel de GarageFlows',
  },
  {
    key: 'ENTREPRISE_FORME_JURIDIQUE',
    variable: '{{ENTREPRISE_FORME_JURIDIQUE}}',
    label: 'Forme juridique GarageFlows',
    category: 'entreprise',
    dataType: 'text',
    required: false,
    defaultValue: '',
    synonyms: ['forme_juridique_entreprise', 'statut_entreprise'],
    description: 'Forme juridique de GarageFlows (ex: SAS, Micro-entreprise)',
  },
  {
    key: 'ENTREPRISE_REPRESENTANT',
    variable: '{{ENTREPRISE_REPRESENTANT}}',
    label: 'Représentant GarageFlows',
    category: 'entreprise',
    dataType: 'text',
    required: true,
    defaultValue: '',
    synonyms: ['entreprise_representant', 'representant', 'représentant', 'representant legal', 'représentant légal'],
    description: 'Nom et prénom du représentant légal de GarageFlows',
  },
  {
    key: 'ENTREPRISE_EMAIL',
    variable: '{{ENTREPRISE_EMAIL}}',
    label: 'E-mail professionnel GarageFlows',
    category: 'entreprise',
    dataType: 'email',
    required: false,
    defaultValue: '',
    synonyms: ['entreprise_email', 'email_pro'],
    description: 'Adresse e-mail professionnelle de GarageFlows',
  },
  {
    key: 'ENTREPRISE_TELEPHONE',
    variable: '{{ENTREPRISE_TELEPHONE}}',
    label: 'Téléphone professionnel GarageFlows',
    category: 'entreprise',
    dataType: 'phone',
    required: false,
    defaultValue: '',
    synonyms: ['entreprise_telephone', 'tel_pro'],
    description: 'Numéro de téléphone professionnel de GarageFlows',
  },
  {
    key: 'ENTREPRISE_IBAN',
    variable: '{{ENTREPRISE_IBAN}}',
    label: 'IBAN GarageFlows',
    category: 'entreprise',
    dataType: 'iban',
    required: false,
    defaultValue: '',
    synonyms: ['iban', 'entreprise_iban', 'coordonnees bancaires', 'coordonnées bancaires', 'numero iban'],
    description: 'Identifiant international de compte bancaire (IBAN)',
  },
  {
    key: 'ENTREPRISE_BIC',
    variable: '{{ENTREPRISE_BIC}}',
    label: 'BIC GarageFlows',
    category: 'entreprise',
    dataType: 'bic',
    required: false,
    defaultValue: '',
    synonyms: ['bic', 'swift', 'entreprise_bic', 'code bic'],
    description: "Code d'identification bancaire (BIC / SWIFT)",
  },
  {
    key: 'ENTREPRISE_RIB',
    variable: '{{ENTREPRISE_RIB}}',
    label: 'RIB / Coordonnées bancaires',
    category: 'entreprise',
    dataType: 'text',
    required: false,
    defaultValue: '',
    synonyms: ['rib', 'relevé d identité bancaire', 'releve d identite bancaire'],
    description: 'Référence RIB ou coordonnées bancaires complètes',
  },
  {
    key: 'ENTREPRISE_BANQUE',
    variable: '{{ENTREPRISE_BANQUE}}',
    label: 'Nom de la banque',
    category: 'entreprise',
    dataType: 'text',
    required: false,
    defaultValue: '',
    synonyms: ['banque', 'nom_banque', 'etablissement bancaire'],
    description: "Nom de l'établissement bancaire",
  },

  // --- ABONNEMENT ---
  {
    key: 'ABONNEMENT_NOM',
    variable: '{{ABONNEMENT_NOM}}',
    label: "Nom de l'abonnement",
    category: 'abonnement',
    dataType: 'text',
    required: true,
    defaultValue: 'GarageFlows',
    synonyms: ['abonnement', 'abonnement_nom', 'nom_abonnement', 'offre', 'formule', 'produit'],
    description: "Intitulé de l'offre souscrite (par défaut : GarageFlows)",
  },
  {
    key: 'ABONNEMENT_PRIX_TTC',
    variable: '{{ABONNEMENT_PRIX_TTC}}',
    label: 'Prix TTC',
    category: 'abonnement',
    dataType: 'amount',
    required: true,
    defaultValue: '99,99 €',
    synonyms: ['prix_ttc', 'abonnement_prix_ttc', 'prix', 'tarif', 'tarif_ttc', 'montant_ttc', 'mensualite'],
    description: "Montant TTC de l'abonnement (par défaut : 99,99 €)",
  },
  {
    key: 'ABONNEMENT_PRIX_MONTANT',
    variable: '{{ABONNEMENT_PRIX_MONTANT}}',
    label: 'Montant numérique TTC (sans devise)',
    category: 'abonnement',
    dataType: 'amount',
    required: true,
    defaultValue: '99,99',
    synonyms: ['montant', 'montant_euros', 'somme de'],
    description: 'Montant numérique seul lorsque le mot « euros » ou « € » suit déjà dans le modèle (ex: 99,99)',
  },
  {
    key: 'ABONNEMENT_PRIX_HT',
    variable: '{{ABONNEMENT_PRIX_HT}}',
    label: 'Prix HT',
    category: 'abonnement',
    dataType: 'amount',
    required: false,
    defaultValue: '83,33 €',
    synonyms: ['prix_ht', 'abonnement_prix_ht', 'tarif_ht', 'montant_ht'],
    description: "Montant Hors Taxes de l'abonnement (83,33 € pour 99,99 € TTC à 20%)",
  },
  {
    key: 'ABONNEMENT_PERIODICITE',
    variable: '{{ABONNEMENT_PERIODICITE}}',
    label: 'Périodicité',
    category: 'abonnement',
    dataType: 'text',
    required: true,
    defaultValue: 'mois',
    synonyms: ['periodicite', 'périodicité', 'abonnement_periodicite', 'frequence', 'fréquence'],
    description: "Périodicité de facturation (ex: mois, mensuelle)",
  },
  {
    key: 'ABONNEMENT_TVA',
    variable: '{{ABONNEMENT_TVA}}',
    label: 'TVA (%)',
    category: 'abonnement',
    dataType: 'text',
    required: false,
    defaultValue: '20 %',
    synonyms: ['tva', 'abonnement_tva', 'taux_tva', 'tva applicable'],
    description: 'Taux de TVA applicable (ex: 20 %)',
  },
  {
    key: 'ABONNEMENT_MOYEN_PAIEMENT',
    variable: '{{ABONNEMENT_MOYEN_PAIEMENT}}',
    label: 'Moyen de paiement',
    category: 'abonnement',
    dataType: 'text',
    required: false,
    defaultValue: 'Prélèvement SEPA',
    synonyms: ['moyen_paiement', 'mode_paiement', 'modalite_paiement'],
    description: 'Mode de règlement convenu (ex: Prélèvement SEPA, Virement)',
  },
  {
    key: 'ABONNEMENT_ENGAGEMENT',
    variable: '{{ABONNEMENT_ENGAGEMENT}}',
    label: "Durée d'engagement",
    category: 'abonnement',
    dataType: 'text',
    required: false,
    defaultValue: '',
    synonyms: ['duree_engagement', "durée d'engagement", 'engagement'],
    description: "Durée d'engagement telle que renseignée par l'utilisateur",
  },

  // --- DATES & CONTRAT ---
  {
    key: 'DATE_SIGNATURE',
    variable: '{{DATE_SIGNATURE}}',
    label: 'Date de signature',
    category: 'contrat',
    dataType: 'date',
    required: true,
    defaultValue: '',
    synonyms: ['date_signature', 'date de signature', 'date_du_jour', 'fait le', 'signe le', 'signé le', 'date'],
    description: 'Date de signature du contrat au format JJ/MM/AAAA',
  },
  {
    key: 'DATE_DEBUT',
    variable: '{{DATE_DEBUT}}',
    label: "Date de début / Prise d'effet",
    category: 'contrat',
    dataType: 'date',
    required: true,
    defaultValue: '',
    synonyms: [
      'date_debut',
      'date de début',
      'date de debut',
      'date_prise_effet',
      "date d'entrée en vigueur",
      'compter du',
      'à compter du',
    ],
    description: "Date d'entrée en vigueur de l'abonnement",
  },

  // --- SIGNATURES ---
  {
    key: 'SIGNATURE_CLIENT',
    variable: '{{SIGNATURE_CLIENT}}',
    label: 'Signature du client',
    category: 'signature',
    dataType: 'signature',
    required: false,
    defaultValue: '',
    synonyms: ['signature_client', 'signature du client', 'le client'],
    description: 'Emplacement de la signature du client',
  },
  {
    key: 'SIGNATURE_ENTREPRISE',
    variable: '{{SIGNATURE_ENTREPRISE}}',
    label: 'Signature GarageFlows',
    category: 'signature',
    dataType: 'signature',
    required: false,
    defaultValue: '',
    synonyms: ['signature_entreprise', 'signature garageflows', 'signature du prestataire', 'cachet et signature'],
    description: "Emplacement de la signature de l'entreprise GarageFlows",
  },
];

/**
 * Calcul monétaire exact en centimes pour éviter toute erreur d'arrondi IEEE 754
 */
export function calculateMonetaryAmounts(prixTTCInput: string, tvaRateInput: string = '20'): {
  ttcFormatted: string;
  ttcNumeric: string;
  htFormatted: string;
  htNumeric: string;
  tvaAmountFormatted: string;
  tvaRateFormatted: string;
} {
  const cleanTTC = parseFloat(String(prixTTCInput || '99,99').replace(/[^\d.,-]/g, '').replace(',', '.'));
  const cleanRate = parseFloat(String(tvaRateInput || '20').replace(/[^\d.,-]/g, '').replace(',', '.'));

  const validTTC = Number.isFinite(cleanTTC) ? cleanTTC : 99.99;
  const validRate = Number.isFinite(cleanRate) && cleanRate >= 0 ? cleanRate : 20;

  // Travail en centimes entiers
  const ttcCents = Math.round(validTTC * 100);
  const htCents = Math.round((ttcCents * 100) / (100 + validRate));
  const tvaCents = ttcCents - htCents;

  const formatFr = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

  const ttcNum = formatFr(ttcCents);
  const htNum = formatFr(htCents);
  const tvaNum = formatFr(tvaCents);
  const rateStr = validRate.toString().replace('.', ',');

  return {
    ttcFormatted: `${ttcNum} €`,
    ttcNumeric: ttcNum,
    htFormatted: `${htNum} €`,
    htNumeric: htNum,
    tvaAmountFormatted: `${tvaNum} €`,
    tvaRateFormatted: `${rateStr} %`,
  };
}

/**
 * Formate une date ISO (YYYY-MM-DD) ou JJ/MM/AAAA vers le format français JJ/MM/AAAA
 */
export function formatDateFr(dateStr?: string): string {
  if (!dateStr) {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    return `${d}/${m}/${y}`;
  }
  const trimmed = dateStr.trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    return trimmed;
  }
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }
  return trimmed;
}

/**
 * Résout automatiquement les valeurs de chaque variable canonique à partir
 * du Client, du Profil Professionnel GarageFlows et de la Configuration d'Abonnement.
 */
export function resolveCanonicalValues(
  client?: Partial<ClientRecord> | null,
  profile?: Partial<ProfessionalProfile> | null,
  subscription?: Partial<SubscriptionConfig> | null,
  customOverrides?: Record<string, string>
): Record<string, string> {
  const rawTTC = client?.prixTTC || subscription?.prixTTC || '99,99';
  const rawTVA = subscription?.tvaTaux || '20';
  const amounts = calculateMonetaryAmounts(rawTTC, rawTVA);

  const nom = (client?.nom || '').trim();
  const prenom = (client?.prenom || '').trim();
  const nomComplet = [prenom, nom].filter(Boolean).join(' ');

  const adresse = (client?.adresse || '').trim();
  const cp = (client?.codePostal || '').trim();
  const ville = (client?.ville || '').trim();
  const cpVille = [cp, ville].filter(Boolean).join(' ');
  const adresseComplete = [adresse, client?.complementAdresse?.trim(), cpVille].filter(Boolean).join(', ');

  const entAdresse = [
    profile?.adresse?.trim(),
    [profile?.codePostal?.trim(), profile?.ville?.trim()].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');

  const repGarageFlows =
    profile?.nomSignataire?.trim() ||
    [profile?.prenom?.trim(), profile?.nom?.trim()].filter(Boolean).join(' ') ||
    '';

  const todayFr = formatDateFr(client?.dateSouscription);
  const debutFr = formatDateFr(client?.dateDebut || subscription?.dateEntreeVigueur || client?.dateSouscription);

  const resolved: Record<string, string> = {
    CLIENT_CIVILITE: client?.civilite || '',
    CLIENT_NOM: nom,
    CLIENT_PRENOM: prenom,
    CLIENT_NOM_COMPLET: nomComplet,
    CLIENT_DATE_NAISSANCE: client?.dateNaissance ? formatDateFr(client.dateNaissance) : '',
    CLIENT_LIEU_NAISSANCE: client?.lieuNaissance || '',
    CLIENT_ADRESSE: adresse,
    CLIENT_ADRESSE_COMPLETE: adresseComplete || adresse,
    CLIENT_COMPLEMENT_ADRESSE: client?.complementAdresse || '',
    CLIENT_CODE_POSTAL: cp,
    CLIENT_VILLE: ville,
    CLIENT_PAYS: client?.pays || 'France',
    CLIENT_TELEPHONE: client?.telephone || '',
    CLIENT_EMAIL: client?.email || '',
    CLIENT_ENTREPRISE: client?.entreprise || '',
    CLIENT_FORME_JURIDIQUE: client?.formeJuridique || '',
    CLIENT_SIRET: client?.siret || '',
    CLIENT_TVA_INTRA: client?.tvaIntracommunautaire || '',
    CLIENT_REPRESENTANT: client?.representantLegal || nomComplet,
    CLIENT_FONCTION_REPRESENTANT: client?.fonctionRepresentant || '',

    ENTREPRISE_NOM: profile?.entrepriseNom || profile?.nomCommercial || 'GarageFlows',
    ENTREPRISE_ADRESSE: entAdresse || profile?.adresse || '',
    ENTREPRISE_CODE_POSTAL: profile?.codePostal || '',
    ENTREPRISE_VILLE: profile?.ville || '',
    ENTREPRISE_PAYS: profile?.pays || 'France',
    ENTREPRISE_SIRET: profile?.siret || '',
    ENTREPRISE_FORME_JURIDIQUE: profile?.formeJuridique || '',
    ENTREPRISE_REPRESENTANT: repGarageFlows,
    ENTREPRISE_EMAIL: profile?.emailPro || '',
    ENTREPRISE_TELEPHONE: profile?.telephonePro || '',
    ENTREPRISE_IBAN: profile?.iban || '',
    ENTREPRISE_BIC: profile?.bic || '',
    ENTREPRISE_BANQUE: profile?.banque || '',
    ENTREPRISE_RIB: profile?.rib || profile?.iban || '',

    ABONNEMENT_NOM: client?.typeAbonnement || subscription?.produit || 'GarageFlows',
    ABONNEMENT_PRIX_TTC: amounts.ttcFormatted,
    ABONNEMENT_PRIX_MONTANT: amounts.ttcNumeric,
    ABONNEMENT_PRIX_HT: amounts.htFormatted,
    ABONNEMENT_PERIODICITE: client?.frequencePaiement || subscription?.periodicite || 'mois',
    ABONNEMENT_TVA: amounts.tvaRateFormatted,
    ABONNEMENT_MOYEN_PAIEMENT: client?.moyenPaiement || subscription?.modalitesPaiement || 'Prélèvement SEPA',
    ABONNEMENT_ENGAGEMENT: subscription?.dureeEngagement || '',

    DATE_SIGNATURE: todayFr,
    DATE_DEBUT: debutFr,

    SIGNATURE_CLIENT: client?.signatureClient || (nomComplet ? `Signé par ${nomComplet}` : ''),
    SIGNATURE_ENTREPRISE:
      profile?.signatureDessinee ||
      profile?.signatureImage ||
      (repGarageFlows ? `Pour ${profile?.entrepriseNom || 'GarageFlows'}, ${repGarageFlows}` : ''),
  };

  if (client?.customFields) {
    for (const [k, v] of Object.entries(client.customFields)) {
      resolved[k] = v;
      resolved[k.toUpperCase()] = v;
    }
  }

  if (customOverrides) {
    for (const [k, v] of Object.entries(customOverrides)) {
      if (v !== undefined && v !== null) {
        resolved[k] = v;
      }
    }
  }

  return resolved;
}

export function findDictionaryEntry(
  rawIdentifier: string,
  customDefs: CustomVariableDefinition[] = []
): { entry: DictionaryFieldEntry; confidence: number } | null {
  const normalized = rawIdentifier
    .trim()
    .replace(/^(\{\{|\{|\[|<|«\s*)/, '')
    .replace(/(\}\}|\}|\]|>|\s*»)$/, '')
    .trim();

  const upper = normalized.toUpperCase().replace(/[\s-]+/g, '_');
  const lower = normalized
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  // 1. Correspondance exacte avec la clé officielle
  for (const entry of OFFICIAL_VARIABLE_DICTIONARY) {
    if (entry.key === upper) {
      return { entry, confidence: 1.0 };
    }
  }

  // 2. Correspondance dans les définitions personnalisées
  for (const custom of customDefs) {
    if (custom.key.toUpperCase() === upper) {
      return {
        entry: {
          key: custom.key.toUpperCase(),
          variable: `{{${custom.key.toUpperCase()}}}`,
          label: custom.label,
          category: custom.category,
          dataType: custom.dataType,
          required: custom.required,
          defaultValue: custom.defaultValue,
          synonyms: custom.synonyms,
          description: custom.description,
        },
        confidence: 1.0,
      };
    }
  }

  // 3. Correspondance par synonyme exact
  for (const entry of OFFICIAL_VARIABLE_DICTIONARY) {
    for (const syn of entry.synonyms) {
      const synNorm = syn
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
      if (synNorm === lower || synNorm.replace(/[\s-]+/g, '_') === lower.replace(/[\s-]+/g, '_')) {
        return { entry, confidence: 0.92 };
      }
    }
  }

  // 4. Correspondance partielle intelligente
  if (upper.includes('PRENOM')) {
    return { entry: OFFICIAL_VARIABLE_DICTIONARY.find((e) => e.key === 'CLIENT_PRENOM')!, confidence: 0.85 };
  }
  if (upper.includes('NOM') && !upper.includes('ABONNEMENT') && !upper.includes('ENTREPRISE')) {
    return { entry: OFFICIAL_VARIABLE_DICTIONARY.find((e) => e.key === 'CLIENT_NOM')!, confidence: 0.85 };
  }
  if (upper.includes('ADRESSE') && upper.includes('ENTREPRISE')) {
    return { entry: OFFICIAL_VARIABLE_DICTIONARY.find((e) => e.key === 'ENTREPRISE_ADRESSE')!, confidence: 0.88 };
  }
  if (upper.includes('ADRESSE')) {
    return { entry: OFFICIAL_VARIABLE_DICTIONARY.find((e) => e.key === 'CLIENT_ADRESSE')!, confidence: 0.85 };
  }
  if (upper.includes('IBAN')) {
    return { entry: OFFICIAL_VARIABLE_DICTIONARY.find((e) => e.key === 'ENTREPRISE_IBAN')!, confidence: 0.92 };
  }
  if (upper.includes('BIC') || upper.includes('SWIFT')) {
    return { entry: OFFICIAL_VARIABLE_DICTIONARY.find((e) => e.key === 'ENTREPRISE_BIC')!, confidence: 0.92 };
  }
  if (upper.includes('SIRET') && upper.includes('CLIENT')) {
    return { entry: OFFICIAL_VARIABLE_DICTIONARY.find((e) => e.key === 'CLIENT_SIRET')!, confidence: 0.92 };
  }
  if (upper.includes('SIRET')) {
    return { entry: OFFICIAL_VARIABLE_DICTIONARY.find((e) => e.key === 'ENTREPRISE_SIRET')!, confidence: 0.82 };
  }
  if (upper.includes('TELEPHONE') || upper.includes('TEL')) {
    return { entry: OFFICIAL_VARIABLE_DICTIONARY.find((e) => e.key === 'CLIENT_TELEPHONE')!, confidence: 0.86 };
  }
  if (upper.includes('EMAIL') || upper.includes('MAIL') || upper.includes('COURRIEL')) {
    return { entry: OFFICIAL_VARIABLE_DICTIONARY.find((e) => e.key === 'CLIENT_EMAIL')!, confidence: 0.88 };
  }
  if (upper.includes('NAISSANCE')) {
    return { entry: OFFICIAL_VARIABLE_DICTIONARY.find((e) => e.key === 'CLIENT_DATE_NAISSANCE')!, confidence: 0.9 };
  }
  if (upper.includes('CODE_POSTAL') || upper === 'CP') {
    return { entry: OFFICIAL_VARIABLE_DICTIONARY.find((e) => e.key === 'CLIENT_CODE_POSTAL')!, confidence: 0.88 };
  }
  if (upper.includes('VILLE')) {
    return { entry: OFFICIAL_VARIABLE_DICTIONARY.find((e) => e.key === 'CLIENT_VILLE')!, confidence: 0.86 };
  }
  if (upper.includes('PRIX_HT') || upper.includes('TARIF_HT')) {
    return { entry: OFFICIAL_VARIABLE_DICTIONARY.find((e) => e.key === 'ABONNEMENT_PRIX_HT')!, confidence: 0.92 };
  }
  if (upper.includes('PRIX') || upper.includes('TARIF') || upper.includes('MONTANT')) {
    return { entry: OFFICIAL_VARIABLE_DICTIONARY.find((e) => e.key === 'ABONNEMENT_PRIX_TTC')!, confidence: 0.85 };
  }

  return null;
}
