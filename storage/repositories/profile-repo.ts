import fs from 'fs';
import path from 'path';
import {
  CustomVariableDefinition,
  ProfessionalProfile,
  SubscriptionConfig,
} from '../../core/types';
import { calculateMonetaryAmounts } from '../../core/variable-detection/dictionary';
import { getSqliteDatabase, persistDatabaseToDisk } from '../database/sqlite-db';
import { ensureStorageDirectories } from '../storage-paths';

const PROFILE_KEY = 'professional_profile';
const SUBSCRIPTION_KEY = 'subscription_config';
const CUSTOM_VARS_KEY = 'custom_variables';

export function getDefaultProfessionalProfile(): ProfessionalProfile {
  return {
    tvaRegime: '',
    nom: '',
    prenom: '',
    nomCommercial: 'GarageFlows',
    entrepriseNom: 'GarageFlows',
    adresse: '',
    codePostal: '',
    ville: '',
    pays: 'France',
    siret: '',
    formeJuridique: '',
    emailPro: '',
    telephonePro: '',
    siteInternet: '',
    titulaireCompte: '',
    iban: '',
    bic: '',
    banque: '',
    rib: '',
    signatureImage: '',
    signatureDessinee: '',
    nomSignataire: '',
    fonctionSignataire: '',
    updatedAt: new Date().toISOString(),
  };
}

export function getDefaultSubscriptionConfig(): SubscriptionConfig {
  const amounts = calculateMonetaryAmounts('99,99', '20');
  return {
    produit: 'GarageFlows',
    prixTTC: '99,99',
    prixHT: amounts.htNumeric,
    tvaTaux: '20',
    tvaMontant: '16,66',
    periodicite: 'mois',
    frequence: 'mensuelle',
    devise: 'EUR',
    dateFacturation: '',
    dureeEngagement: '',
    reconduction: '',
    conditionsResiliation: '',
    modalitesPaiement: 'Prélèvement mensuel',
    retardPaiement: '',
    dateEntreeVigueur: '',
    customClauses: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function getProfessionalProfile(): Promise<ProfessionalProfile> {
  const db = await getSqliteDatabase();
  const stmt = db.prepare('SELECT value_json FROM key_value_store WHERE key = ?');
  stmt.bind([PROFILE_KEY]);
  if (stmt.step()) {
    const row = stmt.getAsObject() as { value_json: string };
    stmt.free();
    return { ...getDefaultProfessionalProfile(), ...JSON.parse(row.value_json) };
  }
  stmt.free();
  return getDefaultProfessionalProfile();
}

export async function saveProfessionalProfile(
  profile: Partial<ProfessionalProfile>
): Promise<ProfessionalProfile> {
  const current = await getProfessionalProfile();
  const merged: ProfessionalProfile = {
    ...current,
    ...profile,
    updatedAt: new Date().toISOString(),
  };

  const db = await getSqliteDatabase();
  db.run(
    'INSERT OR REPLACE INTO key_value_store (key, value_json, updated_at) VALUES (?, ?, ?)',
    [PROFILE_KEY, JSON.stringify(merged), merged.updatedAt]
  );
  persistDatabaseToDisk();

  const dirs = ensureStorageDirectories();
  if (merged.signatureDessinee && merged.signatureDessinee.startsWith('data:image/png;base64,')) {
    const b64 = merged.signatureDessinee.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(path.join(dirs.signatures, 'signature_entreprise_dessinee.png'), Buffer.from(b64, 'base64'), {
      mode: 0o600,
    });
  }
  if (merged.signatureImage && merged.signatureImage.startsWith('data:image/')) {
    const b64 = merged.signatureImage.replace(/^data:image\/\w+;base64,/, '');
    const ext = merged.signatureImage.includes('image/jpeg') ? 'jpg' : 'png';
    fs.writeFileSync(path.join(dirs.signatures, `signature_entreprise_importee.${ext}`), Buffer.from(b64, 'base64'), {
      mode: 0o600,
    });
  }

  return merged;
}

export async function getSubscriptionConfig(): Promise<SubscriptionConfig> {
  const db = await getSqliteDatabase();
  const stmt = db.prepare('SELECT value_json FROM key_value_store WHERE key = ?');
  stmt.bind([SUBSCRIPTION_KEY]);
  if (stmt.step()) {
    const row = stmt.getAsObject() as { value_json: string };
    stmt.free();
    return { ...getDefaultSubscriptionConfig(), ...JSON.parse(row.value_json) };
  }
  stmt.free();
  return getDefaultSubscriptionConfig();
}

export async function saveSubscriptionConfig(
  config: Partial<SubscriptionConfig>
): Promise<SubscriptionConfig> {
  const current = await getSubscriptionConfig();
  const prixTTC = config.prixTTC !== undefined ? config.prixTTC : current.prixTTC;
  const tvaTaux = config.tvaTaux !== undefined ? config.tvaTaux : current.tvaTaux;
  const amounts = calculateMonetaryAmounts(prixTTC, tvaTaux);

  const merged: SubscriptionConfig = {
    ...current,
    ...config,
    prixTTC: amounts.ttcNumeric,
    prixHT: amounts.htNumeric,
    tvaTaux,
    tvaMontant: amounts.tvaAmountFormatted.replace(' €', ''),
    updatedAt: new Date().toISOString(),
  };

  const db = await getSqliteDatabase();
  db.run(
    'INSERT OR REPLACE INTO key_value_store (key, value_json, updated_at) VALUES (?, ?, ?)',
    [SUBSCRIPTION_KEY, JSON.stringify(merged), merged.updatedAt]
  );
  persistDatabaseToDisk();

  const dirs = ensureStorageDirectories();
  fs.writeFileSync(path.join(dirs.settings, 'subscription.json'), JSON.stringify(merged, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });

  return merged;
}

export async function getCustomVariableDefinitions(): Promise<CustomVariableDefinition[]> {
  const db = await getSqliteDatabase();
  const stmt = db.prepare('SELECT value_json FROM key_value_store WHERE key = ?');
  stmt.bind([CUSTOM_VARS_KEY]);
  if (stmt.step()) {
    const row = stmt.getAsObject() as { value_json: string };
    stmt.free();
    return JSON.parse(row.value_json);
  }
  stmt.free();
  return [];
}

export async function saveCustomVariableDefinitions(
  defs: CustomVariableDefinition[]
): Promise<CustomVariableDefinition[]> {
  const db = await getSqliteDatabase();
  const now = new Date().toISOString();
  db.run('INSERT OR REPLACE INTO key_value_store (key, value_json, updated_at) VALUES (?, ?, ?)', [
    CUSTOM_VARS_KEY,
    JSON.stringify(defs),
    now,
  ]);
  persistDatabaseToDisk();
  return defs;
}
