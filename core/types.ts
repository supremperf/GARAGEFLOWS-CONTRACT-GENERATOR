export type DocumentFormat =
  | 'pdf'
  | 'docx'
  | 'doc'
  | 'odt'
  | 'rtf'
  | 'txt'
  | 'html'
  | 'xlsx'
  | 'xls'
  | 'ods'
  | 'csv'
  | 'pptx'
  | 'png'
  | 'jpg'
  | 'jpeg'
  | 'tiff';

export type ExportFormat =
  | 'pdf'
  | 'docx'
  | 'odt'
  | 'rtf'
  | 'txt'
  | 'html'
  | 'xlsx'
  | 'csv';

export type VariableSyntaxType =
  | 'double_braces'
  | 'single_braces'
  | 'brackets'
  | 'angle_brackets'
  | 'generic_xxx'
  | 'textual_label'
  | 'custom_rule';

export type VariableDataType =
  | 'text'
  | 'date'
  | 'amount'
  | 'email'
  | 'phone'
  | 'postal_code'
  | 'iban'
  | 'bic'
  | 'siret'
  | 'signature';

export type VariableCategory =
  | 'client'
  | 'entreprise'
  | 'abonnement'
  | 'contrat'
  | 'signature'
  | 'personnalise';

export interface VariableLocation {
  section: 'body' | 'header' | 'footer' | 'table' | 'sheet' | 'pdf_page' | 'slide' | 'ocr';
  page?: number;
  paragraphIndex?: number;
  tableIndex?: number;
  rowIndex?: number;
  colIndex?: number;
  sheetName?: string;
  cellAddress?: string;
  charStart: number;
  charEnd: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  fontName?: string;
  availableWidth?: number;
  contextBefore: string;
  contextAfter: string;
  fullSentence: string;
}

export interface DetectedVariable {
  id: string;
  name: string;
  originalText: string;
  syntaxType: VariableSyntaxType;
  canonicalField: string;
  dataType: VariableDataType;
  category: VariableCategory;
  occurrences: number;
  occurrenceIndex?: number; // Pour différencier XXX n°1, XXX n°2, etc.
  locations: VariableLocation[];
  confidence: number; // 0.0 à 1.0
  ambiguous: boolean;
  validatedByHuman: boolean;
  required: boolean;
  defaultValue: string;
  description?: string;
  customRule?: string;
}

export interface DocumentParagraph {
  index: number;
  text: string;
  section: 'body' | 'header' | 'footer';
  style?: string;
}

export interface DocumentTable {
  index: number;
  rows: string[][];
}

export interface SpreadsheetCell {
  address: string;
  row: number;
  col: number;
  value: string;
  formula?: string;
  dataType: string;
}

export interface SpreadsheetSheet {
  name: string;
  cells: SpreadsheetCell[];
  rowCount: number;
  colCount: number;
}

export interface PdfTextItem {
  page: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
  availableWidth: number;
}

export interface ParsedDocument {
  format: DocumentFormat;
  fileName: string;
  filePath: string;
  fileSize: number;
  sha256: string;
  structuralFingerprint: string;
  pageCount: number;
  isScanned: boolean;
  ocrApplied: boolean;
  ocrConfidence?: number;
  fullText: string;
  paragraphs: DocumentParagraph[];
  tables: DocumentTable[];
  headers: string[];
  footers: string[];
  sheets?: SpreadsheetSheet[];
  pdfItems?: PdfTextItem[];
  pdfFormFields?: string[];
  pageDimensions?: { width: number; height: number }[];
  hasImages: boolean;
  imageCount: number;
  detectedVariables: DetectedVariable[];
  supportedExports: ExportFormat[];
  supportLevel: 'full' | 'partial' | 'ocr-assisted';
  warnings: string[];
  limitations: string[];
}

export interface TemplateRecord {
  id: string;
  name: string;
  category: string;
  description: string;
  originalFileName: string;
  storedFilePath: string;
  format: DocumentFormat;
  fileSize: number;
  sha256: string;
  structuralFingerprint: string;
  isDefault: boolean;
  isScanned: boolean;
  ocrApplied: boolean;
  pageCount: number;
  supportLevel: 'full' | 'partial' | 'ocr-assisted';
  supportedExports: ExportFormat[];
  variables: DetectedVariable[];
  warnings: string[];
  limitations: string[];
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

export interface ClientRecord {
  id: string;
  // Identité
  civilite: 'M.' | 'Mme' | '';
  nom: string;
  prenom: string;
  dateNaissance: string;
  lieuNaissance: string;
  // Coordonnées
  adresse: string;
  complementAdresse: string;
  codePostal: string;
  ville: string;
  pays: string;
  telephone: string;
  email: string;
  // Informations professionnelles
  entreprise: string;
  formeJuridique: string;
  siret: string;
  tvaIntracommunautaire: string;
  adresseProfessionnelle: string;
  representantLegal: string;
  fonctionRepresentant: string;
  // Informations contractuelles
  dateSouscription: string;
  dateDebut: string;
  typeAbonnement: string;
  prixTTC: string;
  frequencePaiement: string;
  moyenPaiement: string;
  datePrelevement: string;
  // Signature & Champs personnalisés
  signatureClient: string;
  customFields: Record<string, string>;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProfessionalProfile {
  // Identité
  nom: string;
  prenom: string;
  nomCommercial: string;
  entrepriseNom: string;
  // Entreprise
  adresse: string;
  codePostal: string;
  ville: string;
  pays: string;
  siret: string;
  formeJuridique: string;
  emailPro: string;
  telephonePro: string;
  siteInternet: string;
  // Coordonnées bancaires
  titulaireCompte: string;
  iban: string;
  bic: string;
  banque: string;
  rib: string;
  // Signature
  signatureImage: string;
  signatureDessinee: string;
  nomSignataire: string;
  fonctionSignataire: string;
  updatedAt: string;
}

export interface SubscriptionConfig {
  produit: string; // Par défaut "GarageFlows"
  prixTTC: string; // Par défaut "99,99"
  prixHT: string;  // Calculé sans erreur d'arrondi (83,33)
  tvaTaux: string; // Par défaut "20"
  tvaMontant: string; // "16,66"
  periodicite: string; // "mois"
  frequence: string; // "mensuelle"
  devise: string; // "EUR"
  dateFacturation: string;
  dureeEngagement: string;
  reconduction: string;
  conditionsResiliation: string;
  modalitesPaiement: string;
  retardPaiement: string;
  dateEntreeVigueur: string;
  customClauses: { id: string; title: string; content: string; validatedByUser: boolean }[];
  updatedAt: string;
}

export interface FidelityIssue {
  severity: 'info' | 'warning' | 'error';
  type: 'overflow' | 'truncation' | 'font_scale' | 'page_count_change' | 'unreplaced_variable' | 'clause_integrity' | 'format_limitation';
  location: string;
  description: string;
  originalSnippet?: string;
  resultSnippet?: string;
}

export interface FidelityReport {
  originalFormat: DocumentFormat;
  targetFormat: ExportFormat;
  originalPageCount: number;
  generatedPageCount: number;
  pageCountPreserved: boolean;
  dimensionsPreserved: boolean;
  stylesPreserved: boolean;
  tablesPreserved: boolean;
  imagesPreserved: boolean;
  clausesIntegrityVerified: boolean;
  noInventedClausesVerified: boolean;
  originalFileUntouchedVerified: boolean;
  issues: FidelityIssue[];
  fidelityScore: number; // 0 - 100
  summary: string;
}

export interface GenerationReport {
  id: string;
  timestamp: string;
  templateId: string;
  templateName: string;
  clientId?: string;
  clientDisplayName: string;
  totalDetectedFields: number;
  replacedFieldsCount: number;
  remainingEmptyFieldsCount: number;
  ambiguousFieldsCount: number;
  unreplacedMandatoryFields: string[];
  replacementsApplied: {
    variableId: string;
    originalText: string;
    canonicalField: string;
    insertedValue: string;
    occurrencesReplaced: number;
  }[];
  anomalies: string[];
  fidelityReport: FidelityReport;
  legalRecap: {
    fournisseurIdentite: string;
    clientIdentite: string;
    clientCoordonnees: string;
    abonnementNom: string;
    prixTTC: string;
    prixHT: string;
    periodicite: string;
    datePriseEffet: string;
    dateSignature: string;
    ibanUtilise: string;
    signaturesPresentes: { client: boolean; entreprise: boolean };
    missingMandatoryFields: string[];
    legalDisclaimerAccepted: boolean;
  };
}

export interface GeneratedContractRecord {
  id: string;
  templateId: string;
  templateName: string;
  clientId?: string;
  clientName: string;
  exportFormat: ExportFormat;
  fileName: string;
  filePath: string;
  fileSize: number;
  sha256: string;
  valuesUsed: Record<string, string>;
  report: GenerationReport;
  createdAt: string;
}

export interface CustomVariableDefinition {
  key: string; // ex: CLIENT_CODE_PARRAINAGE -> {{CLIENT_CODE_PARRAINAGE}}
  label: string;
  category: VariableCategory;
  dataType: VariableDataType;
  defaultValue: string;
  required: boolean;
  synonyms: string[];
  description: string;
}
