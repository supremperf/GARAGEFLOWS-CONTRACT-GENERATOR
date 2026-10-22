import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { syntheticLegalSource, testClient, testProfile, testSubscription } from '../tests/fixtures/professional-contract';

let clientId = '', contractId = '', reference = '';
const captures = 'captures/professional';
test.describe.configure({ mode: 'serial' });

test('source intégrale fournie : modèle embarqué disponible sans import', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Générer un contrat', exact: true }).click();
  await page.getByRole('button', { name: 'Contrat professionnel GarageFlows', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Version juridique intégrale', exact: true })).toContainText('Modèle fourni');
  await expect(page.getByText('Aucun modèle juridique de remplacement', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continuer', exact: true })).toBeDisabled();
});

test('installation explicite d’un modèle de TEST intégral par l’interface', async ({ page, request }) => {
  fs.mkdirSync(captures, { recursive: true });
  expect((await request.put('/api/profile', { data: testProfile() })).ok()).toBe(true);
  expect((await request.put('/api/subscription', { data: testSubscription() })).ok()).toBe(true);
  const client = await request.post('/api/clients', { data: testClient() }); expect(client.ok()).toBe(true); clientId = (await client.json()).id;
  await page.goto('/'); await page.getByRole('button', { name: 'Mes informations', exact: true }).click();
  await page.getByText('Installer une version du texte original complet', { exact: true }).click();
  await page.getByLabel('Texte intégral, sans raccourcissement', { exact: true }).fill(syntheticLegalSource);
  await page.getByLabel('Version juridique', { exact: true }).fill('synthetic-ui-test');
  await page.getByLabel(/Je confirme avoir comparé ce texte/).check();
  await page.getByRole('button', { name: 'Conserver cette version intégrale', exact: true }).click();
  await expect(page.getByLabel('Texte intégral, sans raccourcissement', { exact: true })).toHaveValue('');
  const models = await (await request.get('/api/professional/models')).json();
  expect(models[0].text).toBe(syntheticLegalSource); expect(models[0].sha256).toBe(createHash('sha256').update(syntheticLegalSource).digest('hex'));
});

test('client présélectionné → 6 étapes → PDF réel → génération et téléchargement identique', async ({ page, request }) => {
  test.setTimeout(90000);
  await page.goto('/'); await page.getByRole('button', { name: 'Clients', exact: true }).click();
  await page.getByPlaceholder('Rechercher un client', { exact: true }).fill('ATELIER_SYNTHÉTIQUE_TEST');
  await page.locator('article.pick').filter({ hasText: 'ATELIER_SYNTHÉTIQUE_TEST' }).getByRole('button', { name: 'Générer un contrat', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Client professionnel', exact: true })).toHaveValue(clientId);
  const importedModels = await (await request.get('/api/professional/models')).json();
  await page.getByRole('combobox', { name: 'Version juridique intégrale', exact: true }).selectOption(importedModels.find((m: { version: string }) => m.version === 'synthetic-ui-test').id);
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  await page.getByRole('combobox', { name: 'Régime fiscal applicable', exact: true }).selectOption('vat');
  await page.getByLabel('Première échéance réelle*', { exact: true }).fill('2020-01-02');
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  await expect(page.getByText('Contexte unique figé · données à vérifier', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  await page.getByLabel('Conditions particulières expresses', { exact: true }).fill('Conditions synthétiques de TEST : Élodie, d’Œuvre, 99,99 €, aucune valeur juridique.');
  await page.getByLabel(/J’ai vérifié l’intégralité du modèle/).check();
  await page.getByRole('button', { name: 'Créer l’aperçu PDF exact', exact: true }).click();
  const pdfCanvas = page.locator('canvas[aria-label="PDF réel, page 1"]');
  await expect(pdfCanvas).toHaveAttribute('data-rendered', 'true', { timeout: 30000 });
  expect(await pdfCanvas.evaluate((c: HTMLCanvasElement) => { const p = c.getContext('2d')!.getImageData(10, 10, 1, 1).data; return p[0] < 30 && p[1] < 40 && p[2] < 60 && p[3] === 255; })).toBe(true);
  fs.writeFileSync(`${captures}/pdf-cover-synthetic.png`, Buffer.from(await pdfCanvas.evaluate((c: HTMLCanvasElement) => c.toDataURL().split(',')[1]), 'base64'));
  await page.getByRole('button', { name: 'Page suivante', exact: true }).click();
  await expect(page.locator('canvas[aria-label="PDF réel, page 2"]')).toHaveAttribute('data-rendered', 'true');
  fs.writeFileSync(`${captures}/pdf-parties-synthetic.png`, Buffer.from(await page.locator('canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL().split(',')[1]), 'base64'));
  const before = (await (await request.get('/api/professional/contracts')).json())[0]; contractId = before.id; reference = before.number;
  for (let i = 3; i <= before.pageCount; i++) {
    await page.getByRole('button', { name: 'Page suivante', exact: true }).click();
    const current = page.locator(`canvas[aria-label="PDF réel, page ${i}"]`);
    await expect(current).toHaveAttribute('data-rendered', 'true');
    expect(await current.evaluate((c: HTMLCanvasElement) => c.getContext('2d')!.getImageData(10, 10, 1, 1).data[0])).toBeLessThan(30);
    fs.writeFileSync(`${captures}/pdf-page-${String(i).padStart(2, '0')}-synthetic.png`, Buffer.from(await current.evaluate((c: HTMLCanvasElement) => c.toDataURL().split(',')[1]), 'base64'));
  }
  await page.getByLabel(/J’ai parcouru le PDF complet/).check();
  const preview = await (await request.get(`/api/professional/contracts/${contractId}/pdf`)).body();
  await page.getByRole('button', { name: 'Générer et enregistrer ce PDF', exact: true }).click();
  await expect(page.getByText('Document sauvegardé dans l’historique du client.', { exact: false })).toBeVisible();
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Télécharger le contrat PDF', exact: true }).click(); const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${reference}.pdf`); const downloaded = fs.readFileSync((await download.path())!); expect(downloaded.equals(preview)).toBe(true);
  fs.writeFileSync(`${captures}/contract-synthetic-test.pdf`, downloaded);
  await page.screenshot({ path: `${captures}/wizard-generated-synthetic.png` });
  await page.evaluate(() => {
    new MutationObserver(records => {
      for (const r of records) for (const node of r.addedNodes) if (node instanceof HTMLIFrameElement && node.className === 'pdf-print-frame') {
        node.addEventListener('load', () => { (window as Window & { printedPageImages?: number }).printedPageImages = node.contentDocument?.images.length; });
      }
    }).observe(document.body, { childList: true });
  });
  await page.getByRole('button', { name: 'Imprimer le PDF final', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { printedPageImages?: number }).printedPageImages)).toBe(before.pageCount);
});

test('historique et transitions réelles : attente, archivage, refus de suppression et signature sans preuve', async ({ page, request }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Historique', exact: true }).click();
  await page.getByRole('row').filter({ hasText: reference }).getByRole('button', { name: 'Gérer', exact: true }).click();
  await page.getByRole('combobox', { name: 'Nouveau statut', exact: true }).selectOption('pending_signature');
  await page.getByLabel('Motif documenté', { exact: true }).fill('Attente de signature, aucun e-mail envoyé.');
  await page.getByRole('button', { name: 'Enregistrer le changement de statut', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: reference })).toContainText('En attente de signature');
  expect((await request.delete(`/api/contracts/${contractId}?file=1`)).ok()).toBe(false);
  expect((await request.post(`/api/professional/contracts/${contractId}/manual-signature`, { data: {} })).ok()).toBe(false);
  const email = await request.post(`/api/professional/contracts/${contractId}/email`, { data: {} }); expect(email.status()).toBe(501);
  await page.getByRole('combobox', { name: 'Nouveau statut', exact: true }).selectOption('archived');
  await page.getByLabel('Motif documenté', { exact: true }).fill('Archivage du scénario de test sans signature.');
  await page.getByRole('button', { name: 'Enregistrer le changement de statut', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: reference })).toContainText('Archivé');
  await expect(page.getByText('Journal horodaté · identité du compte du poste', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${captures}/history-synthetic.png` });
});

test('API et PDF refusent les appels sans autorisation locale et les origines étrangères', async ({ playwright, request }) => {
  const anonymous = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:5180', extraHTTPHeaders: {} });
  try {
    expect((await anonymous.get('/api/professional/contracts')).status()).toBe(403);
    expect((await anonymous.get(`/api/professional/contracts/${contractId}/pdf`)).status()).toBe(403);
    expect((await request.get('/api/professional/contracts', { headers: { Origin: 'https://evil.example' } })).status()).toBe(403);
  } finally { await anonymous.dispose(); }
});

test('PDF de stress : noms, représentants, conditions et annexe sur plusieurs pages', async ({ page, request }) => {
  test.setTimeout(90000);
  const longClient = { ...testClient(), nom: 'STRESS_TEST', entreprise: 'ATELIER très long d’Œuvre '.repeat(15), adresse: 'Adresse longue française '.repeat(15), representantLegal: 'Élodie Première ; André Deuxième ; '.repeat(12) };
  const c = await (await request.post('/api/clients', { data: longClient })).json();
  const text = syntheticLegalSource.replaceAll('Section synthétique non juridique : donnée à conserver intégralement.', 'Section synthétique RGPD de stress. '.repeat(90));
  const models = await (await request.get('/api/professional/models')).json();
  const m = await (await request.post('/api/professional/models', { data: { ...models[0], title: 'SCÉNARIO SYNTHÉTIQUE DE STRESS — NON JURIDIQUE', text, version: 'stress-test', confirmed: true } })).json();
  const draftResponse = await request.post('/api/professional/contracts', { data: { requestId: crypto.randomUUID(), clientId: c.id, modelId: m.id, terms: { taxRegime: 'vat', firstDueDate: '2020-01-02', legalReviewAccepted: true, specialConditions: 'Conditions longues de TEST, coût 99,99 € et accents à conserver.\n'.repeat(100) + 'FIN_STRESS_CONDITIONS' } } });
  expect(draftResponse.ok()).toBe(true); const draft = await draftResponse.json();
  const previewResponse = await request.post(`/api/professional/contracts/${draft.id}/preview`, { data: {} }); expect(previewResponse.ok()).toBe(true); const preview = await previewResponse.json();
  expect(preview.pageCount).toBeGreaterThan(15);
  await page.goto('/'); await page.getByRole('button', { name: 'Historique', exact: true }).click();
  await page.getByRole('row').filter({ hasText: draft.number }).getByRole('button', { name: 'Reprendre', exact: true }).click();
  await expect(page.locator('canvas')).toHaveAttribute('data-rendered', 'true');
  fs.writeFileSync(`${captures}/stress-cover-synthetic.png`, Buffer.from(await page.locator('canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL().split(',')[1]), 'base64'));
  for (let i = 2; i <= preview.pageCount; i++) {
    await page.getByRole('button', { name: 'Page suivante', exact: true }).click();
    const canvas = page.locator(`canvas[aria-label="PDF réel, page ${i}"]`); await expect(canvas).toHaveAttribute('data-rendered', 'true');
    if ([3, preview.pageCount - 2, preview.pageCount].includes(i)) fs.writeFileSync(`${captures}/stress-page-${i}-synthetic.png`, Buffer.from(await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL().split(',')[1]), 'base64'));
  }
  fs.writeFileSync(`${captures}/stress-synthetic-test.pdf`, await (await request.get(`/api/professional/contracts/${draft.id}/pdf`)).body());
});

test('source originale fournie : parcours réel, toutes les pages, annexe/tableau/signatures et octets immuables', async ({ page, request }) => {
  test.setTimeout(180000);
  const c = await (await request.post('/api/clients', { data: { ...testClient(), entreprise: 'SPÉCIMEN — SOURCE FOURNIE — DONNÉES SYNTHÉTIQUES — NE PAS SIGNER' } })).json();
  expect((await request.put('/api/profile', { data: testProfile() })).ok()).toBe(true);
  expect((await request.put('/api/subscription', { data: testSubscription() })).ok()).toBe(true);
  const models = await (await request.get('/api/professional/models')).json();
  const original = models.find((m: { bundled?: boolean }) => m.bundled);
  expect(original.sha256).toBe('82ff73ad47b495a9091ac9b82d3cd1ddba2305c6f2d3cf60b4f4431aa94dcf5c');
  await page.goto('/'); await page.getByRole('button', { name: 'Clients', exact: true }).click();
  await page.getByPlaceholder('Rechercher un client', { exact: true }).fill('SPÉCIMEN — SOURCE FOURNIE');
  await page.locator('article.pick').filter({ hasText: 'SPÉCIMEN — SOURCE FOURNIE' }).getByRole('button', { name: 'Générer un contrat', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Client professionnel', exact: true })).toHaveValue(c.id);
  await expect(page.getByRole('combobox', { name: 'Version juridique intégrale', exact: true })).toHaveValue(original.id);
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  await page.getByRole('combobox', { name: 'Régime fiscal applicable', exact: true }).selectOption('vat');
  await page.getByLabel('Première échéance réelle*', { exact: true }).fill('2020-01-02');
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  await page.getByLabel('Conditions particulières expresses', { exact: true }).fill('SPÉCIMEN TECHNIQUE UNIQUEMENT — identités fictives de test ; ne pas signer.');
  await page.getByLabel(/J’ai vérifié l’intégralité du modèle/).check();
  await page.getByRole('button', { name: 'Créer l’aperçu PDF exact', exact: true }).click();
  await expect(page.locator('canvas[aria-label="PDF réel, page 1"]')).toHaveAttribute('data-rendered', 'true', { timeout: 30000 });
  const preview = (await (await request.get('/api/professional/contracts')).json()).find((item: { clientId: string }) => item.clientId === c.id);
  expect(preview.model.sha256).toBe(original.sha256); expect(preview.pageCount).toBeGreaterThan(15);
  const bytes = await (await request.get(`/api/professional/contracts/${preview.id}/pdf`)).body();
  const pdfPages = [];
  for (let n = 1; n <= preview.pageCount; n++) {
    if (n > 1) await page.getByRole('button', { name: 'Page suivante', exact: true }).click();
    const canvas = page.locator(`canvas[aria-label="PDF réel, page ${n}"]`);
    await expect(canvas).toHaveAttribute('data-rendered', 'true');
    expect(await canvas.evaluate((c: HTMLCanvasElement) => c.getContext('2d')!.getImageData(10, 10, 1, 1).data[0])).toBeLessThan(30);
    const file = `pdf-source-page-${String(n).padStart(2, '0')}.png`;
    fs.writeFileSync(`${captures}/${file}`, Buffer.from(await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL().split(',')[1]), 'base64'));
    pdfPages.push(file);
  }
  await page.screenshot({ path: `${captures}/wizard-source-original.png` });
  await page.getByLabel(/J’ai parcouru le PDF complet/).check();
  await page.getByRole('button', { name: 'Générer et enregistrer ce PDF', exact: true }).click();
  await expect(page.getByText('Document sauvegardé dans l’historique du client.', { exact: false })).toBeVisible();
  const after = await (await request.get(`/api/professional/contracts/${preview.id}/pdf?variant=original`)).body();
  expect(after.equals(bytes)).toBe(true);
  fs.writeFileSync(`${captures}/modele-fourni-specimen.pdf`, after);
  fs.writeFileSync(`${captures}/source-pages.json`, JSON.stringify({ sourceHash: original.sha256, pdfHash: createHash('sha256').update(after).digest('hex'), pageCount: preview.pageCount, syntheticDataOnly: true, pages: pdfPages }, null, 2));
});
