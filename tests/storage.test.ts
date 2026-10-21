import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-data-'));
process.env.GARAGEFLOWS_DATA_DIR = dataDir;

describe('persistance locale', () => {
  beforeAll(async () => {
    const { resetDatabaseConnection } = await import('../storage/database/sqlite-db');
    resetDatabaseConnection();
  });

  it('conserve clients, profil, abonnement 99,99 € et modèle après réouverture', async () => {
    const clients = await import('../storage/repositories/client-repo');
    const profile = await import('../storage/repositories/profile-repo');
    const templates = await import('../storage/repositories/template-repo');
    const db = await import('../storage/database/sqlite-db');

    const created = await clients.createClient({
      nom: 'DUPONT',
      prenom: 'Jean',
      email: 'jean.dupont@email.fr',
      telephone: '0600000000',
      codePostal: '57000',
      ville: 'Metz',
      prixTTC: '99,99',
    });
    await profile.saveProfessionalProfile({ entrepriseNom: 'GarageFlows', siret: '12345678901234', iban: 'FR1420041010050500013M02606' });
    const subscription = await profile.saveSubscriptionConfig({ prixTTC: '99,99', tvaTaux: '20' });
    expect(subscription.prixHT).toBe('83,33');
    const buffer = fs.readFileSync('examples/contrat-abonnement-garageflows.docx');
    const tpl = await templates.importTemplate({ fileName: 'contrat.docx', buffer, name: 'Officiel' });
    expect(tpl.variables.some((v) => v.originalText.includes('CLIENT_NOM'))).toBe(true);

    db.resetDatabaseConnection();
    const again = await clients.getClient(created.id);
    const prof = await profile.getProfessionalProfile();
    const sub = await profile.getSubscriptionConfig();
    const list = await templates.listTemplates();
    expect(again?.nom).toBe('DUPONT');
    expect(prof.iban).toBe('FR1420041010050500013M02606');
    expect(sub.prixTTC).toBe('99,99');
    expect(list).toHaveLength(1);
    expect(fs.readFileSync(list[0].storedFilePath).equals(buffer)).toBe(true);
  });

  it('exporte et restaure une sauvegarde', async () => {
    const backup = await import('../storage/backup/backup-service');
    const archive = await backup.exportBackupArchive();
    expect(archive.buffer.length).toBeGreaterThan(100);
    const restored = await backup.importBackupArchive(archive.buffer);
    expect(restored.restoredFiles).toBeGreaterThan(0);
  });
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});
