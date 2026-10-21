import {
  CustomVariableDefinition,
  DetectedVariable,
  DocumentParagraph,
  DocumentTable,
  PdfTextItem,
  SpreadsheetSheet,
  VariableCategory,
  VariableDataType,
  VariableLocation,
  VariableSyntaxType,
} from '../types';
import {
  DictionaryFieldEntry,
  findDictionaryEntry,
  OFFICIAL_VARIABLE_DICTIONARY,
} from './dictionary';

interface RawMatch {
  originalText: string;
  innerIdentifier: string;
  syntaxType: VariableSyntaxType;
  isGenericPositional: boolean;
  location: VariableLocation;
}

const HTML_TAGS_IGNORE = new Set([
  'HTML', 'HEAD', 'BODY', 'DIV', 'SPAN', 'P', 'BR', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH',
  'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'STRONG', 'B', 'I', 'EM', 'U', 'A', 'IMG',
  'STYLE', 'SCRIPT', 'META', 'LINK', 'TITLE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'NAV',
]);

function normalizeContext(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Analyse le contexte textuel avant et après un marqueur générique (XXX, XXXX, À compléter...)
 * pour suggérer automatiquement le champ canonique approprié avec un score de confiance.
 */
export function inferGenericVariableFromContext(
  contextBefore: string,
  contextAfter: string,
  fullSentence: string,
  occurrenceIndex: number
): {
  entry: DictionaryFieldEntry;
  confidence: number;
  ambiguous: boolean;
  suggestedLabel: string;
} {
  const before = normalizeContext(contextBefore);
  const after = normalizeContext(contextAfter);
  const sentence = normalizeContext(fullSentence);

  const getEntry = (key: string): DictionaryFieldEntry =>
    OFFICIAL_VARIABLE_DICTIONARY.find((e) => e.key === key) || OFFICIAL_VARIABLE_DICTIONARY[0];

  // 1. "Je soussigné XXX" -> Nom et prénom du client
  if (/(?:je\s+soussigne(?:e|\(e\))?|soussigne(?:e)?|monsieur\s*\/\s*madame|client\s*:)\s*$/.test(before)) {
    const entry = getEntry('CLIENT_NOM_COMPLET');
    return {
      entry,
      confidence: 0.96,
      ambiguous: false,
      suggestedLabel: `XXX n°${occurrenceIndex} → Nom et prénom`,
    };
  }

  // 2. "Nom du client : XXX" / "Nom : XXX"
  if (/(?:nom\s+du\s+client|nom\s+de\s+famille|(?:^|\s|,)nom\s*:?)\s*$/.test(before) && !/prenom/.test(before.slice(-25))) {
    const entry = getEntry('CLIENT_NOM');
    return {
      entry,
      confidence: 0.94,
      ambiguous: false,
      suggestedLabel: `XXX n°${occurrenceIndex} → Nom du client`,
    };
  }

  // 3. "Prénom du client : XXX" / "Prénom : XXX"
  if (/(?:prenom\s+du\s+client|prenom\s*:?)\s*$/.test(before)) {
    const entry = getEntry('CLIENT_PRENOM');
    return {
      entry,
      confidence: 0.94,
      ambiguous: false,
      suggestedLabel: `XXX n°${occurrenceIndex} → Prénom du client`,
    };
  }

  // 4. "né(e) le XXX" / "Date de naissance : XXX"
  if (/(?:ne(?:e|\(e\))?\s+le|date\s+de\s+naissance\s*:?)\s*$/.test(before)) {
    const entry = getEntry('CLIENT_DATE_NAISSANCE');
    return {
      entry,
      confidence: 0.96,
      ambiguous: false,
      suggestedLabel: `XXX n°${occurrenceIndex} → Date de naissance`,
    };
  }

  // 5. "né(e) à XXX" / "Lieu de naissance : XXX"
  if (/(?:ne(?:e|\(e\))?\s+a|lieu\s+de\s+naissance\s*:?)\s*$/.test(before)) {
    const entry = getEntry('CLIENT_LIEU_NAISSANCE');
    return {
      entry,
      confidence: 0.92,
      ambiguous: false,
      suggestedLabel: `XXX n°${occurrenceIndex} → Lieu de naissance`,
    };
  }

  // 6. "résidant au XXX" / "domicilié au XXX" / "demeurant au XXX" / "Adresse du client : XXX"
  if (
    /(?:residant\s+(?:au|a)|domicilie(?:e)?\s+(?:au|a)|demeurant\s+(?:au|a)|adresse\s+du\s+client\s*:?|adresse\s+complete\s*:?|adresse\s*:?)\s*$/.test(
      before
    )
  ) {
    const isProvider = /siege\s+(?:social\s+)?(?:est\s+)?situe|garageflows\s*,?\s*situ/.test(before);
    const entry = getEntry(isProvider ? 'ENTREPRISE_ADRESSE' : 'CLIENT_ADRESSE_COMPLETE');
    return {
      entry,
      confidence: 0.95,
      ambiguous: false,
      suggestedLabel: `XXX n°${occurrenceIndex} → ${isProvider ? 'Adresse GarageFlows' : 'Adresse complète'}`,
    };
  }

  // 7. "joignable au XXX" / "Numéro de téléphone : XXX" / "Tél : XXX"
  if (
    /(?:joignable\s+au|numero\s+de\s+telephone\s*:?|telephone\s+du\s+client\s*:?|telephone\s*:?|tel\.?\s*:?|portable\s*:?)\s*$/.test(
      before
    )
  ) {
    const entry = getEntry('CLIENT_TELEPHONE');
    return {
      entry,
      confidence: 0.95,
      ambiguous: false,
      suggestedLabel: `XXX n°${occurrenceIndex} → Numéro de téléphone`,
    };
  }

  // 8. "adresse e-mail XXX" / "courriel : XXX" / "E-mail : XXX"
  if (/(?:adresse\s+e-?mail\s*:?|e-?mail\s+du\s+client\s*:?|e-?mail\s*:?|courriel\s*:?|mail\s*:?)\s*$/.test(before)) {
    const entry = getEntry('CLIENT_EMAIL');
    return {
      entry,
      confidence: 0.94,
      ambiguous: false,
      suggestedLabel: `XXX n°${occurrenceIndex} → E-mail du client`,
    };
  }

  // 9. "pour un montant de XXX euros" / "montant de XXX €" / "Prix : XXX"
  if (/(?:montant\s+(?:mensuel\s+)?de|somme\s+de|tarif\s+(?:mensuel\s+)?de|prix\s+(?:mensuel\s+)?(?:ttc\s+)?(?:\s*de|\s*:)?|au\s+prix\s+de)\s*$/.test(before)) {
    const hasCurrencyAfter = /^(?:euros?\b|€|eur\b)/.test(after);
    const hasHtAfter = /^ht\b/.test(after) || /\bht\s*:?\s*$/.test(before);
    const entry = getEntry(
      hasHtAfter ? 'ABONNEMENT_PRIX_HT' : hasCurrencyAfter ? 'ABONNEMENT_PRIX_MONTANT' : 'ABONNEMENT_PRIX_TTC'
    );
    return {
      entry,
      confidence: 0.95,
      ambiguous: false,
      suggestedLabel: `XXX n°${occurrenceIndex} → ${entry.label}`,
    };
  }

  // 10. "souscrire à l'abonnement XXX" / "formule XXX"
  if (/(?:abonnement|formule|offre)\s*:?\s*$/.test(before)) {
    const entry = getEntry('ABONNEMENT_NOM');
    return {
      entry,
      confidence: 0.9,
      ambiguous: false,
      suggestedLabel: `XXX n°${occurrenceIndex} → Abonnement`,
    };
  }

  // 11. "par XXX" après un montant/euros -> périodicité
  if (/(?:euros?\s+par|€\s*(?:ttc\s*)?par|periodicite\s*:?|frequence\s*:?)\s*$/.test(before)) {
    const entry = getEntry('ABONNEMENT_PERIODICITE');
    return {
      entry,
      confidence: 0.91,
      ambiguous: false,
      suggestedLabel: `XXX n°${occurrenceIndex} → Périodicité`,
    };
  }

  // 12. SIRET
  if (/(?:siret\s*:?|immatricule(?:e)?\s+sous\s+le\s+numero(?:\s+siret)?|n°\s*siret\s*:?)\s*$/.test(before)) {
    const isClient = /client|souscripteur/.test(before.slice(-60));
    const entry = getEntry(isClient ? 'CLIENT_SIRET' : 'ENTREPRISE_SIRET');
    return {
      entry,
      confidence: 0.9,
      ambiguous: false,
      suggestedLabel: `XXX n°${occurrenceIndex} → ${isClient ? 'SIRET du client' : 'SIRET GarageFlows'}`,
    };
  }

  // 13. IBAN / BIC / RIB / Coordonnées bancaires
  if (/(?:iban\s*:?|coordonnees\s+bancaires\s*:?)\s*$/.test(before)) {
    const entry = getEntry('ENTREPRISE_IBAN');
    return {
      entry,
      confidence: 0.94,
      ambiguous: false,
      suggestedLabel: `XXX n°${occurrenceIndex} → IBAN`,
    };
  }
  if (/(?:bic\s*:?|code\s+bic\s*:?|swift\s*:?)\s*$/.test(before)) {
    const entry = getEntry('ENTREPRISE_BIC');
    return {
      entry,
      confidence: 0.94,
      ambiguous: false,
      suggestedLabel: `XXX n°${occurrenceIndex} → BIC`,
    };
  }
  if (/(?:rib\s*:?|releve\s+d'identite\s+bancaire\s*:?)\s*$/.test(before)) {
    const entry = getEntry('ENTREPRISE_RIB');
    return {
      entry,
      confidence: 0.92,
      ambiguous: false,
      suggestedLabel: `XXX n°${occurrenceIndex} → RIB`,
    };
  }

  // 14. Représentant légal
  if (/(?:represente(?:e)?\s+par|representant\s+legal\s*:?)\s*$/.test(before)) {
    const isClient = /client|souscripteur/.test(before.slice(-60));
    const entry = getEntry(isClient ? 'CLIENT_REPRESENTANT' : 'ENTREPRISE_REPRESENTANT');
    return {
      entry,
      confidence: 0.91,
      ambiguous: false,
      suggestedLabel: `XXX n°${occurrenceIndex} → Représentant légal`,
    };
  }

  // 15. Dates (signature / début) et lieu
  if (/(?:fait\s+le|signe\s+le|date\s+de\s+signature\s*:?)\s*$/.test(before)) {
    const entry = getEntry('DATE_SIGNATURE');
    return {
      entry,
      confidence: 0.94,
      ambiguous: false,
      suggestedLabel: `XXX n°${occurrenceIndex} → Date de signature`,
    };
  }
  if (/(?:a\s+compter\s+du|date\s+de\s+debut\s*:?|prenant\s+effet\s+le|date\s+d'entree\s+en\s+vigueur\s*:?)\s*$/.test(before)) {
    const entry = getEntry('DATE_DEBUT');
    return {
      entry,
      confidence: 0.93,
      ambiguous: false,
      suggestedLabel: `XXX n°${occurrenceIndex} → Date de début`,
    };
  }
  if (/(?:fait\s+a)\s*$/.test(before)) {
    const entry = getEntry('ENTREPRISE_VILLE');
    return {
      entry,
      confidence: 0.89,
      ambiguous: false,
      suggestedLabel: `XXX n°${occurrenceIndex} → Ville de signature`,
    };
  }

  // 16. Signatures
  if (/(?:signature\s+du\s+client\s*:?)\s*$/.test(before)) {
    const entry = getEntry('SIGNATURE_CLIENT');
    return {
      entry,
      confidence: 0.95,
      ambiguous: false,
      suggestedLabel: `XXX n°${occurrenceIndex} → Signature du client`,
    };
  }
  if (/(?:signature\s+(?:de\s+l'entreprise|du\s+prestataire|garageflows)\s*:?)\s*$/.test(before)) {
    const entry = getEntry('SIGNATURE_ENTREPRISE');
    return {
      entry,
      confidence: 0.95,
      ambiguous: false,
      suggestedLabel: `XXX n°${occurrenceIndex} → Signature entreprise`,
    };
  }

  // Cas ambigu : demande de validation humaine obligatoire
  const fallbackEntry = getEntry('CLIENT_NOM');
  return {
    entry: fallbackEntry,
    confidence: 0.45,
    ambiguous: true,
    suggestedLabel: `XXX n°${occurrenceIndex} (À valider manuellement)`,
  };
}

/**
 * Extrait toutes les occurrences brutes de variables dans un bloc de texte donné.
 */
function scanTextSegment(
  text: string,
  baseLocation: Omit<VariableLocation, 'charStart' | 'charEnd' | 'contextBefore' | 'contextAfter' | 'fullSentence'>
): RawMatch[] {
  const matches: RawMatch[] = [];
  if (!text || !text.trim()) return matches;

  const occupiedRanges: [number, number][] = [];
  const isOverlapping = (start: number, end: number) =>
    occupiedRanges.some(([s, e]) => start < e && end > s);

  const addMatch = (
    start: number,
    end: number,
    originalText: string,
    innerIdentifier: string,
    syntaxType: VariableSyntaxType,
    isGenericPositional: boolean
  ) => {
    if (isOverlapping(start, end)) return;
    occupiedRanges.push([start, end]);

    const contextBefore = text.slice(Math.max(0, start - 80), start);
    const contextAfter = text.slice(end, Math.min(text.length, end + 80));
    const sentenceStart = Math.max(0, text.lastIndexOf('.', start) + 1, start - 120);
    const nextDot = text.indexOf('.', end);
    const sentenceEnd = nextDot !== -1 ? Math.min(text.length, nextDot + 1) : Math.min(text.length, end + 120);
    const fullSentence = text.slice(sentenceStart, sentenceEnd).trim();

    matches.push({
      originalText,
      innerIdentifier,
      syntaxType,
      isGenericPositional,
      location: {
        ...baseLocation,
        charStart: start,
        charEnd: end,
        contextBefore,
        contextAfter,
        fullSentence,
      },
    });
  };

  // 1. {{VARIABLE}} — Standard officiel (Priorité maximale)
  const doubleBraceRegex = /\{\{\s*([A-Za-z0-9_À-ÿ\s'-]{1,60}?)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = doubleBraceRegex.exec(text)) !== null) {
    addMatch(m.index, m.index + m[0].length, m[0], m[1].trim(), 'double_braces', false);
  }

  // 2. {VARIABLE} — Accolades simples
  const singleBraceRegex = /(?<!\{)\{\s*([A-Za-z0-9_À-ÿ\s'-]{2,50}?)\s*\}(?!\})/g;
  while ((m = singleBraceRegex.exec(text)) !== null) {
    const inner = m[1].trim();
    if (!inner.includes(':') && !inner.includes(';')) {
      const isGeneric = /^X{2,}$/i.test(inner) || /^a\s+completer$/i.test(normalizeContext(inner));
      addMatch(m.index, m.index + m[0].length, m[0], inner, 'single_braces', isGeneric);
    }
  }

  // 3. [VARIABLE] — Crochets ([NOM], [PRENOM], [ADRESSE], [À compléter])
  const bracketRegex = /\[\s*([A-Za-z0-9_À-ÿ\s'°:-]{2,50}?)\s*\]/g;
  while ((m = bracketRegex.exec(text)) !== null) {
    const inner = m[1].trim();
    const isGeneric = /^X{2,}$/i.test(inner) || /completer|remplir/i.test(normalizeContext(inner));
    addMatch(m.index, m.index + m[0].length, m[0], inner, 'brackets', isGeneric);
  }

  // 4. <VARIABLE> — Chevrons (en ignorant les balises HTML/XML)
  const angleRegex = /<\s*([A-Za-z0-9_À-ÿ\s'-]{2,40}?)\s*>/g;
  while ((m = angleRegex.exec(text)) !== null) {
    const inner = m[1].trim();
    const upper = inner.toUpperCase().split(/\s+/)[0];
    if (!HTML_TAGS_IGNORE.has(upper) && !inner.startsWith('/')) {
      const isGeneric = /^X{2,}$/i.test(inner) || /completer/i.test(normalizeContext(inner));
      addMatch(m.index, m.index + m[0].length, m[0], inner, 'angle_brackets', isGeneric);
    }
  }

  // 5. « À compléter » / À compléter
  const aCompleterRegex = /(?:«\s*À\s+compl[ée]ter\s*»|À\s+compl[ée]ter)/gi;
  while ((m = aCompleterRegex.exec(text)) !== null) {
    addMatch(m.index, m.index + m[0].length, m[0], 'À compléter', 'textual_label', true);
  }

  // 6. Motifs génériques XXX, XXXX, XXXXX (chaque occurrence est distincte !)
  const xxxRegex = /\b(X{3,12})\b/g;
  while ((m = xxxRegex.exec(text)) !== null) {
    addMatch(m.index, m.index + m[0].length, m[0], m[1], 'generic_xxx', true);
  }

  // 7. Formulations textuelles explicites (« Nom du client », « Prénom du client », etc. entre guillemets français ou suivies de pointillés)
  const textualQuotesRegex =
    /«\s*(Nom du client|Prénom du client|Adresse du client|Numéro de téléphone|Date de signature|RIB|IBAN|BIC|SIRET|Représentant légal|Coordonnées bancaires)\s*»/gi;
  while ((m = textualQuotesRegex.exec(text)) !== null) {
    addMatch(m.index, m.index + m[0].length, m[0], m[1].trim(), 'textual_label', false);
  }

  const labelDotsRegex =
    /\b(Nom du client|Prénom du client|Adresse du client|Numéro de téléphone|Date de signature|RIB|IBAN|BIC|SIRET|Représentant légal|Coordonnées bancaires)\s*:\s*(\.{3,}|_{3,})/gi;
  while ((m = labelDotsRegex.exec(text)) !== null) {
    const dots = m[2];
    const dotsStart = m.index + m[0].lastIndexOf(dots);
    addMatch(dotsStart, dotsStart + dots.length, dots, m[1].trim(), 'textual_label', false);
  }

  matches.sort((a, b) => a.location.charStart - b.location.charStart);
  return matches;
}

/**
 * Moteur principal de détection intelligente des variables sur l'ensemble d'un document analysé.
 */
export function detectDocumentVariables(params: {
  paragraphs: DocumentParagraph[];
  tables: DocumentTable[];
  headers: string[];
  footers: string[];
  sheets?: SpreadsheetSheet[];
  pdfItems?: PdfTextItem[];
  customDefinitions?: CustomVariableDefinition[];
}): DetectedVariable[] {
  const {
    paragraphs,
    tables,
    headers,
    footers,
    sheets = [],
    customDefinitions = [],
  } = params;

  const rawMatches: RawMatch[] = [];

  // 1. En-têtes
  headers.forEach((hText, idx) => {
    rawMatches.push(
      ...scanTextSegment(hText, {
        section: 'header',
        paragraphIndex: idx,
      })
    );
  });

  // 2. Paragraphes du corps
  paragraphs.forEach((p) => {
    rawMatches.push(
      ...scanTextSegment(p.text, {
        section: p.section,
        paragraphIndex: p.index,
      })
    );
  });

  // 3. Tableaux (cellules)
  tables.forEach((tbl) => {
    tbl.rows.forEach((row, rIdx) => {
      row.forEach((cellText, cIdx) => {
        rawMatches.push(
          ...scanTextSegment(cellText, {
            section: 'table',
            tableIndex: tbl.index,
            rowIndex: rIdx,
            colIndex: cIdx,
          })
        );
      });
    });
  });

  // 4. Feuilles de calcul (XLSX / ODS / CSV)
  sheets.forEach((sheet) => {
    sheet.cells.forEach((cell) => {
      // Ne jamais toucher aux cellules de formule pure qui ne contiennent pas de texte variable
      if (cell.value) {
        rawMatches.push(
          ...scanTextSegment(cell.value, {
            section: 'sheet',
            sheetName: sheet.name,
            cellAddress: cell.address,
            rowIndex: cell.row,
            colIndex: cell.col,
          })
        );
      }
    });
  });

  // 5. Pieds de page
  footers.forEach((fText, idx) => {
    rawMatches.push(
      ...scanTextSegment(fText, {
        section: 'footer',
        paragraphIndex: idx,
      })
    );
  });

  const detectedVariables: DetectedVariable[] = [];
  const namedVariablesMap = new Map<string, DetectedVariable>();
  let genericCounter = 0;

  for (const match of rawMatches) {
    if (match.isGenericPositional) {
      // RÈGLE STRICTE : Chaque variable générique (XXX, XXXX, À compléter) est identifiée INDIVIDUELLEMENT
      genericCounter += 1;
      const inferred = inferGenericVariableFromContext(
        match.location.contextBefore,
        match.location.contextAfter,
        match.location.fullSentence,
        genericCounter
      );

      const displayToken = `${match.originalText} n°${genericCounter}`;
      detectedVariables.push({
        id: `var_generic_${genericCounter}`,
        name: inferred.suggestedLabel,
        originalText: match.originalText,
        syntaxType: match.syntaxType,
        canonicalField: inferred.entry.key,
        dataType: inferred.entry.dataType,
        category: inferred.entry.category,
        occurrences: 1,
        occurrenceIndex: genericCounter,
        locations: [match.location],
        confidence: inferred.confidence,
        ambiguous: inferred.ambiguous,
        validatedByHuman: false,
        required: inferred.entry.required,
        defaultValue: inferred.entry.defaultValue,
        description: `Variable positionnelle (${displayToken}) détectée dans : « ${match.location.fullSentence.slice(0, 90)} »`,
      });
    } else {
      // Variable nommée ({{CLIENT_NOM}}, [NOM], {NOM}, etc.) : regrouper les occurrences identiques
      const normalizedId = match.innerIdentifier.toUpperCase().replace(/[\s-]+/g, '_');
      const groupKey = `${match.syntaxType}::${normalizedId}`;

      const existing = namedVariablesMap.get(groupKey);
      if (existing) {
        existing.occurrences += 1;
        existing.locations.push(match.location);
        continue;
      }

      const dictLookup = findDictionaryEntry(match.innerIdentifier, customDefinitions);
      if (dictLookup) {
        const { entry, confidence } = dictLookup;
        const variable: DetectedVariable = {
          id: `var_${entry.key}_${detectedVariables.length + 1}`,
          name: entry.label,
          originalText: match.originalText,
          syntaxType: match.syntaxType,
          canonicalField: entry.key,
          dataType: entry.dataType,
          category: entry.category,
          occurrences: 1,
          locations: [match.location],
          confidence: match.syntaxType === 'double_braces' ? 1.0 : confidence,
          ambiguous: confidence < 0.75,
          validatedByHuman: match.syntaxType === 'double_braces',
          required: entry.required,
          defaultValue: entry.defaultValue,
          description: entry.description,
        };
        namedVariablesMap.set(groupKey, variable);
        detectedVariables.push(variable);
      } else {
        // Champ personnalisé nommé (ex: {{CODE_PARRAINAGE}})
        const customKey = normalizedId;
        const variable: DetectedVariable = {
          id: `var_custom_${customKey}_${detectedVariables.length + 1}`,
          name: match.innerIdentifier,
          originalText: match.originalText,
          syntaxType: match.syntaxType,
          canonicalField: customKey,
          dataType: 'text',
          category: 'personnalise',
          occurrences: 1,
          locations: [match.location],
          confidence: match.syntaxType === 'double_braces' ? 0.9 : 0.7,
          ambiguous: match.syntaxType !== 'double_braces',
          validatedByHuman: false,
          required: false,
          defaultValue: '',
          description: `Champ personnalisé détecté (${match.originalText})`,
        };
        namedVariablesMap.set(groupKey, variable);
        detectedVariables.push(variable);
      }
    }
  }

  return detectedVariables;
}
