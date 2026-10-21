import crypto from 'crypto';
import { ClientRecord } from '../../core/types';
import { validateEmailFormat, validateSiretFormat } from '../../core/validation/legal-validator';
import { getSqliteDatabase, persistDatabaseToDisk } from '../database/sqlite-db';

export function emptyClient(): ClientRecord {
  const now = new Date().toISOString();
  return {
    id: '',
    civilite: '',
    nom: '',
    prenom: '',
    dateNaissance: '',
    lieuNaissance: '',
    adresse: '',
    complementAdresse: '',
    codePostal: '',
    ville: '',
    pays: 'France',
    telephone: '',
    email: '',
    entreprise: '',
    formeJuridique: '',
    siret: '',
    tvaIntracommunautaire: '',
    adresseProfessionnelle: '',
    representantLegal: '',
    fonctionRepresentant: '',
    dateSouscription: '',
    dateDebut: '',
    typeAbonnement: 'GarageFlows',
    prixTTC: '99,99',
    frequencePaiement: 'mois',
    moyenPaiement: 'Prélèvement SEPA',
    datePrelevement: '',
    signatureClient: '',
    customFields: {},
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
}

function validateClientPayload(client: Partial<ClientRecord>): void {
  if (!client.nom || !String(client.nom).trim()) {
    throw new Error('Le nom du client est obligatoire.');
  }
  if (client.email) {
    const check = validateEmailFormat(client.email);
    if (!check.valid) throw new Error(check.message || 'E-mail invalide.');
  }
  if (client.siret) {
    const check = validateSiretFormat(client.siret);
    if (!check.valid) throw new Error(check.message || 'SIRET invalide.');
  }
  if (client.codePostal && !/^\d{4,5}$/.test(client.codePostal.trim())) {
    throw new Error('Le code postal doit contenir 4 ou 5 chiffres.');
  }
  if (client.telephone && client.telephone.replace(/\D/g, '').length < 8) {
    throw new Error('Le numéro de téléphone semble incomplet.');
  }
}

function rowToClient(payloadJson: string): ClientRecord {
  return { ...emptyClient(), ...JSON.parse(payloadJson) };
}

export async function listClients(query?: string): Promise<ClientRecord[]> {
  const db = await getSqliteDatabase();
  const stmt = db.prepare('SELECT payload_json FROM clients ORDER BY updated_at DESC');
  const clients: ClientRecord[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as { payload_json: string };
    clients.push(rowToClient(row.payload_json));
  }
  stmt.free();
  if (!query || !query.trim()) return clients;
  const q = query.trim().toLowerCase();
  return clients.filter((c) =>
    [c.nom, c.prenom, c.entreprise, c.email, c.telephone, c.ville, c.siret]
      .join(' ')
      .toLowerCase()
      .includes(q)
  );
}

export async function getClient(id: string): Promise<ClientRecord | null> {
  const db = await getSqliteDatabase();
  const stmt = db.prepare('SELECT payload_json FROM clients WHERE id = ?');
  stmt.bind([id]);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject() as { payload_json: string };
  stmt.free();
  return rowToClient(row.payload_json);
}

export async function createClient(input: Partial<ClientRecord>): Promise<ClientRecord> {
  validateClientPayload(input);
  const now = new Date().toISOString();
  const client: ClientRecord = {
    ...emptyClient(),
    ...input,
    id: `cli_${crypto.randomBytes(8).toString('hex')}`,
    customFields: input.customFields || {},
    createdAt: now,
    updatedAt: now,
  };
  const db = await getSqliteDatabase();
  db.run(
    `INSERT INTO clients (id, nom, prenom, entreprise, email, telephone, ville, payload_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      client.id,
      client.nom,
      client.prenom,
      client.entreprise,
      client.email,
      client.telephone,
      client.ville,
      JSON.stringify(client),
      client.createdAt,
      client.updatedAt,
    ]
  );
  persistDatabaseToDisk();
  return client;
}

export async function updateClient(id: string, input: Partial<ClientRecord>): Promise<ClientRecord> {
  const existing = await getClient(id);
  if (!existing) throw new Error('Client introuvable.');
  const merged: ClientRecord = {
    ...existing,
    ...input,
    id,
    customFields: input.customFields !== undefined ? input.customFields : existing.customFields,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  validateClientPayload(merged);
  const db = await getSqliteDatabase();
  db.run(
    `UPDATE clients SET nom = ?, prenom = ?, entreprise = ?, email = ?, telephone = ?, ville = ?, payload_json = ?, updated_at = ? WHERE id = ?`,
    [
      merged.nom,
      merged.prenom,
      merged.entreprise,
      merged.email,
      merged.telephone,
      merged.ville,
      JSON.stringify(merged),
      merged.updatedAt,
      id,
    ]
  );
  persistDatabaseToDisk();
  return merged;
}

export async function deleteClient(id: string): Promise<void> {
  const existing = await getClient(id);
  if (!existing) throw new Error('Client introuvable.');
  const db = await getSqliteDatabase();
  db.run('DELETE FROM clients WHERE id = ?', [id]);
  persistDatabaseToDisk();
}
