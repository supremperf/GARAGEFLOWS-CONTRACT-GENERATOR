import {
  ClientRecord,
  DetectedVariable,
  ProfessionalProfile,
  SubscriptionConfig,
} from '../types';

export interface LegalValidationResult {
  valid: boolean;
  canExport: boolean;
  missingMandatoryFields: string[];
  unresolvedAmbiguousFields: string[];
  formatErrors: string[];
  warnings: string[];
}

export function validateIbanFormat(iban: string): { valid: boolean; message?: string } {
  const cleaned = iban.replace(/\s+/g, '').toUpperCase();
  if (!cleaned) return { valid: true };
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(cleaned)) {
    return {
      valid: false,
      message: 'Format IBAN invalide (attendu : 2 lettres pays + 2 chiffres clé + identifiant bancaire, ex: FR76...).',
    };
  }
  if (cleaned.startsWith('FR') && cleaned.length !== 27) {
    return {
      valid: false,
      message: `Un IBAN français (FR) doit comporter exactement 27 caractères (actuellement : ${cleaned.length}).`,
    };
  }
  // Vérification clé Modulo 97 ISO 13616
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  const numericStr = rearranged
    .split('')
    .map((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 65 && code <= 90 ? String(code - 55) : ch;
    })
    .join('');

  let remainder = 0;
  for (let i = 0; i < numericStr.length; i++) {
    remainder = (remainder * 10 + parseInt(numericStr[i], 10)) % 97;
  }
  if (remainder !== 1) {
    return {
      valid: false,
      message: 'Clé de contrôle IBAN (Modulo 97) incorrecte. Veuillez vérifier le numéro IBAN saisi.',
    };
  }
  return { valid: true };
}

export function validateBicFormat(bic: string): { valid: boolean; message?: string } {
  const cleaned = bic.replace(/\s+/g, '').toUpperCase();
  if (!cleaned) return { valid: true };
  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(cleaned)) {
    return {
      valid: false,
      message: 'Format BIC/SWIFT invalide (attendu : 8 ou 11 caractères alphanumériques).',
    };
  }
  return { valid: true };
}

export function validateSiretFormat(siret: string): { valid: boolean; message?: string } {
  const cleaned = siret.replace(/\s+/g, '');
  if (!cleaned) return { valid: true };
  if (!/^\d{14}$/.test(cleaned)) {
    return {
      valid: false,
      message: `Le numéro SIRET doit comporter exactement 14 chiffres (actuellement : ${cleaned.length}).`,
    };
  }
  return { valid: true };
}

export function validateEmailFormat(email: string): { valid: boolean; message?: string } {
  const cleaned = email.trim();
  if (!cleaned) return { valid: true };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    return {
      valid: false,
      message: `Adresse e-mail invalide : ${cleaned}`,
    };
  }
  return { valid: true };
}

export function validateContractBeforeGeneration(params: {
  variables: DetectedVariable[];
  valuesByVariableId: Record<string, string>;
  client?: Partial<ClientRecord> | null;
  profile?: Partial<ProfessionalProfile> | null;
  subscription?: Partial<SubscriptionConfig> | null;
}): LegalValidationResult {
  const { variables, valuesByVariableId, client, profile } = params;
  const missingMandatoryFields: string[] = [];
  const unresolvedAmbiguousFields: string[] = [];
  const formatErrors: string[] = [];
  const warnings: string[] = [];

  for (const v of variables) {
    const val = (valuesByVariableId[v.id] ?? v.defaultValue ?? '').trim();

    if (v.required && !val) {
      missingMandatoryFields.push(`${v.name} (${v.originalText})`);
    }

    if (v.ambiguous && !v.validatedByHuman) {
      unresolvedAmbiguousFields.push(`${v.name} (${v.originalText})`);
    }

    if (val) {
      if (v.dataType === 'iban') {
        const check = validateIbanFormat(val);
        if (!check.valid && check.message) formatErrors.push(`${v.name} : ${check.message}`);
      } else if (v.dataType === 'bic') {
        const check = validateBicFormat(val);
        if (!check.valid && check.message) formatErrors.push(`${v.name} : ${check.message}`);
      } else if (v.dataType === 'siret') {
        const check = validateSiretFormat(val);
        if (!check.valid && check.message) formatErrors.push(`${v.name} : ${check.message}`);
      } else if (v.dataType === 'email') {
        const check = validateEmailFormat(val);
        if (!check.valid && check.message) formatErrors.push(`${v.name} : ${check.message}`);
      }
    }
  }

  // Vérifier qu'il n'y a pas d'inversion d'identité entre le fournisseur GarageFlows et le client
  if (
    client?.siret &&
    profile?.siret &&
    client.siret.replace(/\s+/g, '') === profile.siret.replace(/\s+/g, '')
  ) {
    formatErrors.push(
      'Inversion ou doublon détecté : le numéro SIRET du client est identique au numéro SIRET de GarageFlows.'
    );
  }

  if (
    client?.nom &&
    profile?.entrepriseNom &&
    client.nom.trim().toLowerCase() === profile.entrepriseNom.trim().toLowerCase()
  ) {
    warnings.push(
      'Attention : le nom du client est identique au nom de l’entreprise fournisseur GarageFlows.'
    );
  }

  const canExport =
    missingMandatoryFields.length === 0 &&
    unresolvedAmbiguousFields.length === 0 &&
    formatErrors.length === 0;

  return {
    valid: canExport,
    canExport,
    missingMandatoryFields,
    unresolvedAmbiguousFields,
    formatErrors,
    warnings,
  };
}
