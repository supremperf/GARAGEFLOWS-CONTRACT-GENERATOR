import crypto from 'crypto';
import {
  ClientRecord,
  DetectedVariable,
  ExportFormat,
  FidelityIssue,
  GenerationReport,
  ParsedDocument,
  ProfessionalProfile,
  SubscriptionConfig,
} from '../types';
import { parseDocumentBuffer } from '../document-parser';
import {
  computeTextSpanReplacements,
  replaceInDocxBuffer,
  ReplacementInstruction,
} from './docx-replacer';
import { replaceInOdtBuffer } from './odt-replacer';
import {
  generateVectorPdfFromParagraphs,
  replaceInPdfBuffer,
} from './pdf-replacer';
import { replaceInSpreadsheetBuffer } from './xlsx-replacer';
import {
  replaceInHtmlBuffer,
  replaceInPptxBuffer,
  replaceInRtfBuffer,
  replaceInTxtBuffer,
} from './text-replacer';
import {
  buildDocxBufferFromStructuredContent,
  buildHtmlBufferFromStructuredContent,
  buildOdtBufferFromStructuredContent,
  buildRtfBufferFromStructuredContent,
  buildTxtBufferFromStructuredContent,
  buildXlsxBufferFromTables,
  StructuredContractContent,
} from '../document-converter/converter';
import { verifyDocumentFidelity } from '../validation/fidelity-checker';
import { validateContractBeforeGeneration } from '../validation/legal-validator';
import { calculateMonetaryAmounts, formatDateFr } from '../variable-detection/dictionary';

export interface PreviewPageData {
  pageNumber: number;
  paragraphs: {
    originalText: string;
    finalText: string;
    highlightedHtml: string;
    hasReplacements: boolean;
    hasMissingRequired: boolean;
  }[];
  tables: {
    rows: string[][];
  }[];
  headers: string[];
  footers: string[];
}

export interface ContractGenerationOutput {
  buffer: Buffer;
  targetFormat: ExportFormat;
  report: GenerationReport;
  previewPages: PreviewPageData[];
  originalFullText: string;
  finalFullText: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildInstructionsFromVariables(
  variables: DetectedVariable[],
  valuesByVariableId: Record<string, string>
): ReplacementInstruction[] {
  return variables.map((v) => {
    const rawVal = valuesByVariableId[v.id] !== undefined ? valuesByVariableId[v.id] : v.defaultValue || '';
    const isGeneric =
      v.syntaxType === 'generic_xxx' ||
      (v.occurrenceIndex !== undefined && v.occurrenceIndex > 0);
    return {
      variableId: v.id,
      originalText: v.originalText,
      isGenericPositional: isGeneric,
      occurrenceIndex: v.occurrenceIndex,
      value: rawVal,
      canonicalField: v.canonicalField,
    };
  });
}

/**
 * Construit un aperçu paginé fidèle avec mise en évidence des champs remplacés et non renseignés
 */
export function buildContractPreviewPages(
  parsed: ParsedDocument,
  variables: DetectedVariable[],
  valuesByVariableId: Record<string, string>
): {
  previewPages: PreviewPageData[];
  finalParagraphs: string[];
  finalTables: string[][][];
  finalHeaders: string[];
  finalFooters: string[];
} {
  const instructions = buildInstructionsFromVariables(variables, valuesByVariableId);
  const genericCounterPlain = { count: 0 };
  const genericCounterHtml = { count: 0 };
  const dummyCounts: Record<string, number> = {};

  // En-têtes
  const finalHeaders = parsed.headers.map(
    (h) => computeTextSpanReplacements(h, instructions, genericCounterPlain, dummyCounts).newText
  );
  // Synchroniser le compteur HTML sur les en-têtes
  parsed.headers.forEach((h) => computeTextSpanReplacements(h, instructions, genericCounterHtml, {}));

  // Paragraphes avec surlignage HTML des valeurs remplacées et des variables manquantes
  const processedParagraphs = parsed.paragraphs.map((p) => {
    const plainRes = computeTextSpanReplacements(
      p.text,
      instructions,
      genericCounterPlain,
      dummyCounts
    );

    const htmlInstructions: ReplacementInstruction[] = variables.map((v) => {
      const val = valuesByVariableId[v.id] !== undefined ? valuesByVariableId[v.id] : v.defaultValue || '';
      const isGeneric =
        v.syntaxType === 'generic_xxx' ||
        (v.occurrenceIndex !== undefined && v.occurrenceIndex > 0);
      if (val && val.trim().length > 0) {
        const displayVal =
          v.canonicalField.startsWith('SIGNATURE_') && val.startsWith('data:image/')
            ? `__SIG_IMG_START__${val}__SIG_IMG_END__`
            : `__REPLACED_START__${val}__REPLACED_END__`;
        return {
          variableId: v.id,
          originalText: v.originalText,
          isGenericPositional: isGeneric,
          occurrenceIndex: v.occurrenceIndex,
          value: displayVal,
          canonicalField: v.canonicalField,
        };
      } else {
        return {
          variableId: v.id,
          originalText: v.originalText,
          isGenericPositional: isGeneric,
          occurrenceIndex: v.occurrenceIndex,
          value: `__MISSING_START__${v.originalText} (${v.name})__MISSING_END__`,
          canonicalField: v.canonicalField,
        };
      }
    });

    const htmlRes = computeTextSpanReplacements(
      p.text,
      htmlInstructions,
      genericCounterHtml,
      {}
    );

    let highlightedHtml = escapeHtml(htmlRes.newText);
    highlightedHtml = highlightedHtml
      .replace(
        /__REPLACED_START__([\s\S]*?)__REPLACED_END__/g,
        '<mark class="gf-preview-replaced">$1</mark>'
      )
      .replace(
        /__MISSING_START__([\s\S]*?)__MISSING_END__/g,
        '<mark class="gf-preview-missing">$1</mark>'
      )
      .replace(
        /__SIG_IMG_START__(data:image\/[^_]+?)__SIG_IMG_END__/g,
        '<img src="$1" alt="Signature" class="gf-preview-signature-img" />'
      );

    const hasMissingRequired = htmlRes.newText.includes('__MISSING_START__');
    const hasReplacements = plainRes.spanReplacements.length > 0;

    return {
      originalText: p.text,
      finalText: plainRes.newText,
      highlightedHtml,
      hasReplacements,
      hasMissingRequired,
    };
  });

  // Tableaux
  const finalTables = parsed.tables.map((t) =>
    t.rows.map((row) =>
      row.map((cell) => {
        const res = computeTextSpanReplacements(cell, instructions, genericCounterPlain, dummyCounts);
        computeTextSpanReplacements(cell, instructions, genericCounterHtml, {});
        return res.newText;
      })
    )
  );

  // Pieds de page
  const finalFooters = parsed.footers.map((f) => {
    const res = computeTextSpanReplacements(f, instructions, genericCounterPlain, dummyCounts);
    computeTextSpanReplacements(f, instructions, genericCounterHtml, {});
    return res.newText;
  });

  // Découpage en pages (18 paragraphes par page ou selon pageCount du modèle)
  const paragraphsPerPage = Math.max(12, Math.ceil(processedParagraphs.length / Math.max(1, parsed.pageCount)));
  const totalPages = Math.max(1, Math.ceil(processedParagraphs.length / paragraphsPerPage));
  const previewPages: PreviewPageData[] = [];

  for (let p = 0; p < totalPages; p++) {
    const slice = processedParagraphs.slice(p * paragraphsPerPage, (p + 1) * paragraphsPerPage);
    previewPages.push({
      pageNumber: p + 1,
      paragraphs: slice,
      tables: p === totalPages - 1 ? finalTables.map((rows) => ({ rows })) : [],
      headers: finalHeaders,
      footers: finalFooters,
    });
  }

  return {
    previewPages,
    finalParagraphs: processedParagraphs.map((p) => p.finalText),
    finalTables,
    finalHeaders,
    finalFooters,
  };
}

/**
 * Moteur central de génération de contrat (Section 12)
 */
export async function generateContractDocument(params: {
  templateId: string;
  templateName: string;
  originalBuffer: Buffer;
  originalFilePath?: string;
  originalFileName: string;
  variables: DetectedVariable[];
  valuesByVariableId: Record<string, string>;
  targetFormat: ExportFormat;
  client?: Partial<ClientRecord> | null;
  profile?: Partial<ProfessionalProfile> | null;
  subscription?: Partial<SubscriptionConfig> | null;
  allowIncompleteForPreview?: boolean;
}): Promise<ContractGenerationOutput> {
  const {
    templateId,
    templateName,
    originalBuffer,
    originalFilePath,
    originalFileName,
    variables,
    valuesByVariableId,
    targetFormat,
    client,
    profile,
    subscription,
    allowIncompleteForPreview = false,
  } = params;

  const originalSha256 = crypto.createHash('sha256').update(originalBuffer).digest('hex');
  const originalParsed = await parseDocumentBuffer(originalBuffer, originalFileName, originalFilePath);

  // Validation juridique et contrôle des champs obligatoires (Section 11 & 12)
  const validation = validateContractBeforeGeneration({
    variables,
    valuesByVariableId,
    client,
    profile,
    subscription,
  });

  if (!allowIncompleteForPreview && !validation.canExport) {
    const reasons = [
      ...validation.missingMandatoryFields.map((f) => `Champ obligatoire manquant : ${f}`),
      ...validation.unresolvedAmbiguousFields.map((f) => `Champ ambigu à valider : ${f}`),
      ...validation.formatErrors,
    ];
    throw new Error(`Impossible d'exporter un contrat incomplet ou invalide :\n- ${reasons.join('\n- ')}`);
  }

  const instructions = buildInstructionsFromVariables(variables, valuesByVariableId);
  const previewBuilt = buildContractPreviewPages(originalParsed, variables, valuesByVariableId);

  let nativeReplacedBuffer: Buffer | null = null;
  let replacementsCount: Record<string, number> = {};
  const fidelityIssues: FidelityIssue[] = [];

  // Étape 1 : Si le format d'export correspond au format natif du modèle, utiliser le moteur natif de haute fidélité
  const srcFormat = originalParsed.format;

  if (srcFormat === 'docx') {
    const res = await replaceInDocxBuffer(originalBuffer, instructions);
    nativeReplacedBuffer = res.buffer;
    replacementsCount = res.replacementsCount;
  } else if (srcFormat === 'odt') {
    const res = await replaceInOdtBuffer(originalBuffer, instructions);
    nativeReplacedBuffer = res.buffer;
    replacementsCount = res.replacementsCount;
  } else if (srcFormat === 'pdf') {
    const res = await replaceInPdfBuffer(originalBuffer, instructions, originalFileName);
    nativeReplacedBuffer = res.buffer;
    replacementsCount = res.replacementsCount;
    fidelityIssues.push(...res.fidelityIssues);
  } else if (srcFormat === 'xlsx' || srcFormat === 'xls' || srcFormat === 'ods' || srcFormat === 'csv') {
    const res = await replaceInSpreadsheetBuffer(
      originalBuffer,
      targetFormat === 'csv' ? 'csv' : srcFormat === 'csv' ? 'csv' : 'xlsx',
      instructions
    );
    nativeReplacedBuffer = res.buffer;
    replacementsCount = res.replacementsCount;
  } else if (srcFormat === 'rtf') {
    const res = replaceInRtfBuffer(originalBuffer, instructions);
    nativeReplacedBuffer = res.buffer;
    replacementsCount = res.replacementsCount;
  } else if (srcFormat === 'html') {
    const res = replaceInHtmlBuffer(originalBuffer, instructions);
    nativeReplacedBuffer = res.buffer;
    replacementsCount = res.replacementsCount;
  } else if (srcFormat === 'txt') {
    const res = replaceInTxtBuffer(originalBuffer, instructions);
    nativeReplacedBuffer = res.buffer;
    replacementsCount = res.replacementsCount;
  } else if (srcFormat === 'pptx') {
    const res = await replaceInPptxBuffer(originalBuffer, instructions);
    nativeReplacedBuffer = res.buffer;
    replacementsCount = res.replacementsCount;
  }

  // Étape 2 : Produire le buffer dans le format d'export choisi (targetFormat)
  let finalBuffer: Buffer;
  const structuredContent: StructuredContractContent = {
    title: templateName,
    headers: previewBuilt.finalHeaders,
    paragraphs: previewBuilt.finalParagraphs,
    tables: previewBuilt.finalTables,
    footers: previewBuilt.finalFooters,
    signatures: {
      client: client?.signatureClient,
      entreprise: profile?.signatureDessinee || profile?.signatureImage,
    },
  };

  if (
    nativeReplacedBuffer &&
    ((srcFormat === targetFormat) ||
      ((srcFormat === 'xls' || srcFormat === 'ods') && targetFormat === 'xlsx'))
  ) {
    finalBuffer = nativeReplacedBuffer;
  } else {
    // Conversion locale maîtrisée vers targetFormat
    if (targetFormat === 'pdf') {
      const pdfRes = await generateVectorPdfFromParagraphs(
        structuredContent.paragraphs,
        instructions,
        replacementsCount,
        fidelityIssues,
        {
          title: structuredContent.title,
          tables: structuredContent.tables,
          headers: structuredContent.headers,
          footers: structuredContent.footers,
          alreadyReplaced: true,
          signatures: structuredContent.signatures,
        }
      );
      finalBuffer = pdfRes.buffer;
    } else if (targetFormat === 'docx') {
      finalBuffer = await buildDocxBufferFromStructuredContent(structuredContent);
    } else if (targetFormat === 'odt') {
      finalBuffer = await buildOdtBufferFromStructuredContent(structuredContent);
    } else if (targetFormat === 'rtf') {
      finalBuffer = buildRtfBufferFromStructuredContent(structuredContent);
    } else if (targetFormat === 'html') {
      finalBuffer = buildHtmlBufferFromStructuredContent(structuredContent);
    } else if (targetFormat === 'txt') {
      finalBuffer = buildTxtBufferFromStructuredContent(structuredContent);
    } else if (targetFormat === 'xlsx' || targetFormat === 'csv') {
      finalBuffer = buildXlsxBufferFromTables(
        structuredContent.tables,
        structuredContent.paragraphs,
        targetFormat
      );
    } else {
      throw new Error(`Conversion non prise en charge de .${srcFormat} vers .${targetFormat}.`);
    }
  }

  // Si c'était une conversion vers un autre format et que replacementsCount n'était pas encore rempli :
  if (Object.keys(replacementsCount).length === 0) {
    const tempCounter = { count: 0 };
    originalParsed.headers.forEach((h) =>
      computeTextSpanReplacements(h, instructions, tempCounter, replacementsCount)
    );
    originalParsed.paragraphs.forEach((p) =>
      computeTextSpanReplacements(p.text, instructions, tempCounter, replacementsCount)
    );
    originalParsed.tables.forEach((t) =>
      t.rows.forEach((r) =>
        r.forEach((c) => computeTextSpanReplacements(c, instructions, tempCounter, replacementsCount))
      )
    );
    originalParsed.footers.forEach((f) =>
      computeTextSpanReplacements(f, instructions, tempCounter, replacementsCount)
    );
  }

  // Étape 3 : Contrôle de fidélité documentaire (Section 4.4)
  const fidelityReport = await verifyDocumentFidelity({
    originalParsed,
    originalFilePath,
    originalSha256,
    generatedBuffer: finalBuffer,
    targetFormat,
    instructions,
    preExistingIssues: fidelityIssues,
  });

  const replacementsApplied = variables.map((v) => {
    const val = valuesByVariableId[v.id] !== undefined ? valuesByVariableId[v.id] : v.defaultValue || '';
    return {
      variableId: v.id,
      originalText: v.originalText,
      canonicalField: v.canonicalField,
      insertedValue: val.startsWith('data:image/') ? '[Image Signature]' : val,
      occurrencesReplaced: replacementsCount[v.id] || (val ? v.occurrences : 0),
    };
  });

  const replacedFieldsCount = replacementsApplied.filter((r) => r.insertedValue.trim().length > 0).length;
  const remainingEmptyFieldsCount = variables.length - replacedFieldsCount;
  const ambiguousFieldsCount = variables.filter((v) => v.ambiguous && !v.validatedByHuman).length;

  const amounts = calculateMonetaryAmounts(
    client?.prixTTC || subscription?.prixTTC || '99,99',
    subscription?.tvaTaux || '20'
  );

  const clientDisplayName =
    [client?.prenom, client?.nom].filter(Boolean).join(' ') ||
    client?.entreprise ||
    valuesByVariableId[variables.find((v) => v.canonicalField === 'CLIENT_NOM')?.id || ''] ||
    'Client';

  const report: GenerationReport = {
    id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    templateId,
    templateName,
    clientId: client?.id,
    clientDisplayName,
    totalDetectedFields: variables.length,
    replacedFieldsCount,
    remainingEmptyFieldsCount,
    ambiguousFieldsCount,
    unreplacedMandatoryFields: validation.missingMandatoryFields,
    replacementsApplied,
    anomalies: [
      ...validation.formatErrors,
      ...validation.warnings,
      ...fidelityReport.issues.map((i) => i.description),
    ],
    fidelityReport,
    legalRecap: {
      fournisseurIdentite: `${profile?.entrepriseNom || 'GarageFlows'} (SIRET : ${profile?.siret || 'Non renseigné'})`,
      clientIdentite: clientDisplayName,
      clientCoordonnees: [client?.adresse, client?.codePostal, client?.ville, client?.telephone, client?.email]
        .filter(Boolean)
        .join(' — '),
      abonnementNom: client?.typeAbonnement || subscription?.produit || 'GarageFlows',
      prixTTC: amounts.ttcFormatted,
      prixHT: amounts.htFormatted,
      periodicite: client?.frequencePaiement || subscription?.periodicite || 'mois',
      datePriseEffet: formatDateFr(client?.dateDebut || subscription?.dateEntreeVigueur),
      dateSignature: formatDateFr(client?.dateSouscription),
      ibanUtilise: profile?.iban ? `${profile.iban.slice(0, 4)} •••• •••• ${profile.iban.slice(-4)}` : 'Non utilisé',
      signaturesPresentes: {
        client: Boolean(client?.signatureClient),
        entreprise: Boolean(profile?.signatureDessinee || profile?.signatureImage),
      },
      missingMandatoryFields: validation.missingMandatoryFields,
      legalDisclaimerAccepted: true,
    },
  };

  return {
    buffer: finalBuffer,
    targetFormat,
    report,
    previewPages: previewBuilt.previewPages,
    originalFullText: originalParsed.fullText,
    finalFullText: [
      ...previewBuilt.finalHeaders,
      ...previewBuilt.finalParagraphs,
      ...previewBuilt.finalTables.flatMap((t) => t.map((r) => r.join(' | '))),
      ...previewBuilt.finalFooters,
    ].join('\n'),
  };
}
