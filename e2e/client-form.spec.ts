import { test, expect, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const textFields: Record<string, string> = {
  'Nom*': 'MARTIN', 'Prénom': 'Élodie', 'Lieu de naissance': 'Strasbourg',
  'Téléphone': '0612345678', 'E-mail': 'elodie@example.test', 'Adresse': '12 rue des Lilas',
  'Complément': 'Bâtiment B', 'Code postal': '67000', 'Ville': 'Strasbourg', 'Pays': 'France',
  'Entreprise': 'Atelier Martin', 'Forme juridique': 'SAS', 'SIRET': '12345678901234',
  'TVA intracommunautaire': 'FR12345678901', 'Représentant légal': 'Élodie Martin',
  'Fonction': 'Présidente', 'Abonnement': 'Entretien', 'Prix TTC': '129,90', 'Notes': 'Première ligne\nDeuxième ligne : à conserver.',
  'Champ personnalisé': 'Référence', 'Valeur du champ personnalisé': 'VIP-2026',
};
function control(page: Page, label: string) {
  return ['Civilité', 'Fréquence', 'Moyen de paiement'].includes(label)
    ? page.getByRole('combobox', { name: label, exact: true })
    : label === 'Notes' ? page.getByRole('textbox', { name: label, exact: true }) : page.getByLabel(label, { exact: true });
}
const dates = ['Date de naissance', 'Date de souscription', 'Date de début'];
async function openClients(page: Page, base = '/') {
  await page.goto(base);
  await page.getByRole('button', { name: 'Clients', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Fiche client' })).toBeVisible();
}

for (const [label, value] of Object.entries(textFields)) {
  test(`champ ${label} : clic, focus, saisie, sélection et modification`, async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openClients(page);
    const input = control(page, label);
    await input.click(); // no force, no DOM focus injection
    await expect(input).toBeFocused();
    expect(await input.evaluate(e => {
      const rect = e.getBoundingClientRect();
      return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === e;
    })).toBe(true);
    await input.press('ControlOrMeta+a');
    for (const [index, line] of value.split('\n').entries()) {
      if (index) await input.press('Enter');
      await input.pressSequentially(line);
    }
    await expect(input).toHaveValue(value);
    await input.press('ControlOrMeta+a'); await input.press('ControlOrMeta+c');
    await input.press('Backspace'); await input.press('ControlOrMeta+v');
    await expect(input).toHaveValue(value);
    await input.press('ControlOrMeta+a');
    await input.pressSequentially('Modification');
    await expect(input).toHaveValue('Modification');
  });
}

for (const label of dates) {
  test(`calendrier ${label} : ouverture souris et choix clavier d'une date`, async ({ page }, info) => {
    await openClients(page);
    const input = control(page, label);
    await input.fill('2026-10-15');
    await input.scrollIntoViewIfNeeded();
    const box = (await input.boundingBox())!;
    await input.click({ position: { x: box.width - 18, y: box.height / 2 } });
    // With the popup open, ArrowRight selects the next DAY, not the next input segment.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(input).toHaveValue('2026-10-16');
    await input.click({ position: { x: box.width - 18, y: box.height / 2 } });
    await page.screenshot({ path: info.outputPath('calendrier.png') });
    await page.keyboard.press('Escape');
  });
}

test('civilité, fréquence, paiement : menus natifs ouverts et sélectionnés au clavier', async ({ page }) => {
  await openClients(page);
  for (const [label, value] of [['Civilité', 'M.'], ['Fréquence', 'trimestre'], ['Moyen de paiement', 'Virement bancaire']]) {
    const select = control(page, label);
    await select.click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(select).toHaveValue(value);
  }
});

test('Tab et Maj+Tab parcourent tous les champs sans perte de valeurs ; copier-coller', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openClients(page);
  const fields = page.getByRole('form').locator('input,select,textarea');
  await fields.first().click();
  await page.keyboard.press('Escape');
  for (let i = 0; i < await fields.count(); i++) {
    await expect(fields.nth(i)).toBeFocused();
    if (i < await fields.count() - 1) {
      // Chromium date controls have separate day/month/year and calendar tab stops.
      for (let segment = 0; segment < 5; segment++) {
        await page.keyboard.press('Tab');
        if (!await fields.nth(i).evaluate(e => document.activeElement === e)) break;
      }
    }
  }
  for (let i = await fields.count() - 1; i > 0; i--) {
    for (let segment = 0; segment < 5; segment++) {
      await page.keyboard.press('Shift+Tab');
      if (!await fields.nth(i).evaluate(e => document.activeElement === e)) break;
    }
    await expect(fields.nth(i - 1)).toBeFocused();
  }
  const name = page.getByLabel('Nom*', { exact: true });
  await name.click(); await name.pressSequentially('Copie réelle');
  await name.press('ControlOrMeta+a'); await name.press('ControlOrMeta+c');
  const firstName = page.getByLabel('Prénom', { exact: true });
  await firstName.click(); await firstName.press('ControlOrMeta+v');
  await expect(firstName).toHaveValue('Copie réelle');
  await expect(name).toHaveValue('Copie réelle');
});

test('Ajouter ne soumet pas le client ; Entrée ajoute le champ personnalisé', async ({ page }) => {
  await openClients(page);
  let posts = 0;
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/api/clients')) posts++; });
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('nom du champ');
  await page.getByLabel('Champ personnalisé', { exact: true }).fill('Référence interne');
  await page.getByLabel('Valeur du champ personnalisé').fill('ABC');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.getByText('RÉFÉRENCE_INTERNE: ABC', { exact: true })).toBeVisible();
  await page.getByLabel('Champ personnalisé', { exact: true }).fill('Autre');
  await page.getByLabel('Valeur du champ personnalisé').fill('DEF');
  await page.getByLabel('Valeur du champ personnalisé').press('Enter');
  await expect(page.locator('.help').filter({ hasText: 'AUTRE: DEF' })).toBeVisible();
  expect(posts).toBe(0);
});

test('nom obligatoire, erreur serveur visible et formulaire conservé', async ({ page }) => {
  await openClients(page);
  const name = page.getByLabel('Nom*', { exact: true });
  await page.getByRole('button', { name: 'Créer le client', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Le nom du client est obligatoire.');
  await expect(name).toBeFocused();
  await name.fill('   ');
  await page.getByRole('button', { name: 'Créer le client', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Le nom du client est obligatoire.');
  await expect(name).toBeFocused();
  await name.fill('CONSERVER');
  await page.getByLabel('E-mail', { exact: true }).fill('invalide');
  await page.getByRole('button', { name: 'Créer le client', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/mail/i);
  await expect(name).toHaveValue('CONSERVER');
  await expect(page.getByLabel('E-mail', { exact: true })).toHaveValue('invalide');
});

test('échec réseau : erreur explicite, aucune confirmation mensongère, saisie conservée', async ({ page }) => {
  await openClients(page);
  await page.getByLabel('Nom*', { exact: true }).fill('NE PAS PERDRE');
  await control(page, 'Notes').fill('Brouillon préservé');
  await page.route('**/api/clients', route => route.request().method() === 'POST' ? route.abort('failed') : route.continue());
  await page.getByRole('button', { name: 'Créer le client', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('moteur local est injoignable');
  await expect(page.getByRole('status')).not.toHaveText('Client créé.');
  await expect(page.getByLabel('Nom*', { exact: true })).toHaveValue('NE PAS PERDRE');
  await expect(control(page, 'Notes')).toHaveValue('Brouillon préservé');
  await expect(page.getByRole('button', { name: 'Créer le client', exact: true })).toBeEnabled();
});

for (const width of [1440, 900, 375]) {
  test(`tous les contrôles accessibles sans overlay à ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await openClients(page);
    for (const field of await page.getByRole('form').locator('input,select,textarea').all()) {
      await field.click();
      await page.keyboard.press('Escape');
      await expect(field).toBeFocused();
    }
  });
}

async function backend(root: string): Promise<{ process: ChildProcess; url: string }> {
  const child = spawn(process.execPath, ['--import', 'tsx', '--eval', `
    const { startServer } = require('./electron/server.ts');
    startServer({port:0,host:'127.0.0.1',staticDir:require('node:path').resolve('dist-renderer')})
      .then(port=>console.log('CLIENT_TEST_READY:'+port));
  `], { env: { ...process.env, GARAGEFLOWS_DATA_DIR: root }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Backend timeout: ${output}`)); }, 20000);
    child.stderr!.on('data', data => { output += data; });
    child.stdout!.on('data', data => {
      output += data;
      const match = output.match(/CLIENT_TEST_READY:(\d+)/);
      if (match) { clearTimeout(timer); resolve({ process: child, url: `http://127.0.0.1:${match[1]}` }); }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Backend exited ${code}: ${output}`)); });
  });
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Backend did not stop normally')); }, 10000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}

test('client complet et minimal : SQLite réel, anti-double-submit, édition, redémarrage du moteur', async ({ page, request }, info) => {
  test.setTimeout(90000);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-client-persistence-'));
  let server: Awaited<ReturnType<typeof backend>> | undefined;
  try {
    server = await backend(root);
    await openClients(page, server.url);
    for (const [label, value] of Object.entries(textFields)) await control(page, label).fill(value);
    for (const label of dates) await control(page, label).fill('2026-10-15');
    await control(page, 'Civilité').selectOption('Mme');
    await control(page, 'Fréquence').selectOption('an');
    await control(page, 'Moyen de paiement').selectOption('Chèque');
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    const search = page.getByPlaceholder('Rechercher un client', { exact: true });
    await search.fill('AUCUN_RÉSULTAT');
    // Hold the REAL response, not a fake successful body, to exercise pending UI and repeated submit.
    let posts = 0;
    await page.route('**/api/clients', async route => {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      posts++;
      const response = await route.fetch();
      await new Promise(resolve => setTimeout(resolve, 350));
      await route.fulfill({ response });
    });
    const create = page.getByRole('button', { name: 'Créer le client', exact: true });
    await create.dblclick();
    await expect(page.getByRole('button', { name: 'Enregistrement…', exact: true })).toBeDisabled();
    await expect(page.getByRole('status')).toHaveText('Client créé.');
    expect(posts).toBe(1);
    await expect(search).toHaveValue('');
    await expect(page.locator('article.pick').filter({ hasText: 'MARTIN' })).toHaveCount(1);
    let records = await (await request.get(`${server.url}/api/clients`)).json();
    expect(records).toHaveLength(1);
    const full = records[0];
    expect(full).toMatchObject({ nom: 'MARTIN', prenom: 'Élodie', civilite: 'Mme', entreprise: 'Atelier Martin', prixTTC: '129,90', frequencePaiement: 'an', moyenPaiement: 'Chèque', customFields: { 'RÉFÉRENCE': 'VIP-2026' } });
    for (const [key, value] of Object.entries({ lieuNaissance: 'Strasbourg', telephone: '0612345678', email: 'elodie@example.test', adresse: '12 rue des Lilas', complementAdresse: 'Bâtiment B', codePostal: '67000', ville: 'Strasbourg', pays: 'France', formeJuridique: 'SAS', siret: '12345678901234', tvaIntracommunautaire: 'FR12345678901', representantLegal: 'Élodie Martin', fonctionRepresentant: 'Présidente', typeAbonnement: 'Entretien', notes: textFields.Notes, dateNaissance: '2026-10-15', dateSouscription: '2026-10-15', dateDebut: '2026-10-15' })) expect(full[key], key).toBe(value);
    await page.locator('article.pick').getByRole('button', { name: 'Ouvrir', exact: true }).click();
    await expect(control(page, 'Notes')).toHaveValue(textFields.Notes);
    await control(page, 'Notes').fill('Notes modifiées\nDeux lignes.');
    await page.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Client mis à jour.');
    // All optional controls, including defaulted ones, can be empty.
    await page.getByLabel('Nom*', { exact: true }).fill('MINIMAL');
    for (const field of await page.getByRole('form').locator('input:not([required]),textarea').all()) await field.fill('');
    for (const field of await page.getByRole('form').locator('select').all()) await field.selectOption('');
    await page.getByRole('button', { name: 'Créer le client', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Client créé.');
    records = await (await request.get(`${server.url}/api/clients`)).json();
    expect(records).toHaveLength(2);
    const db = path.join(root, 'database', 'garageflows.sqlite');
    expect(fs.readFileSync(db).subarray(0, 16).toString()).toBe('SQLite format 3\u0000');
    await page.screenshot({ path: info.outputPath('clients-enregistres.png') });
    await page.goto('about:blank');
    await stop(server.process);
    server = await backend(root); // NEW OS process and NEW JS/SQLite instance, SAME real disk profile.
    await openClients(page, server.url);
    const reloaded = await (await request.get(`${server.url}/api/clients`)).json();
    expect(reloaded).toEqual(records);
    await expect(page.locator('article.pick')).toHaveCount(2);
    await page.locator('article.pick').filter({ hasText: 'MARTIN' }).getByRole('button', { name: 'Ouvrir', exact: true }).click();
    await expect(control(page, 'Notes')).toHaveValue('Notes modifiées\nDeux lignes.');
    await expect(control(page, 'Civilité')).toHaveValue('Mme');
    const legacy = { frequencePaiement: 'tous les 45 jours', moyenPaiement: 'Paiement historique', adresseProfessionnelle: 'Ancienne adresse pro', datePrelevement: '2026-10-22', signatureClient: 'signature-existante' };
    expect((await request.put(`${server.url}/api/clients/${full.id}`, { data: legacy })).ok()).toBe(true);
    await openClients(page, server.url);
    await page.locator('article.pick').filter({ hasText: 'MARTIN' }).getByRole('button', { name: 'Ouvrir', exact: true }).click();
    await expect(control(page, 'Fréquence')).toHaveValue(legacy.frequencePaiement);
    await expect(control(page, 'Moyen de paiement')).toHaveValue(legacy.moyenPaiement);
    await page.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Client mis à jour.');
    const afterLegacyEdit = await (await request.get(`${server.url}/api/clients/${full.id}`)).json();
    expect(afterLegacyEdit).toMatchObject(legacy);
    await info.attach('persistence.json', { body: JSON.stringify({ clients: records, afterLegacyEdit, sqliteBytes: fs.statSync(db).size, restarted: true }, null, 2), contentType: 'application/json' });
  } finally {
    if (server) await stop(server.process);
    fs.rmSync(root, { recursive: true, force: true }); // Only the directory created by this test.
  }
});
