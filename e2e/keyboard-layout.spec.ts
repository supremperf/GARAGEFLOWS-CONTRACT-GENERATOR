import { test, expect, type Page } from '@playwright/test';

const pages = ['Dashboard', 'Générer un contrat', 'Mes modèles', 'Clients', 'Mes informations', 'Historique', 'Paramètres'];
let dashboard: Record<string, unknown> = {};
const longName = 'Contrat professionnel de maintenance et abonnement pour un établissement automobile avec des conditions détaillées';
const report = {
  totalDetectedFields: 30, replacedFieldsCount: 30, remainingEmptyFieldsCount: 0, ambiguousFieldsCount: 0,
  legalRecap: { fournisseurIdentite: longName, clientIdentite: longName, clientCoordonnees: longName, abonnementNom: longName, prixTTC: '99,99', prixHT: '83,33', periodicite: 'mois', datePriseEffet: '22/10/2026', dateSignature: '22/10/2026', ibanUtilise: 'masqué' },
  fidelityReport: { fidelityScore: 100, summary: longName.repeat(12) },
  anomalies: Array.from({ length: 20 }, (_, i) => `Observation ${i + 1} : ${longName}`),
};
const contracts = Array.from({ length: 8 }, (_, i) => ({ id: `ui-${i}`, fileName: `${longName.replaceAll(' ', '_')}_${i}.pdf`, clientName: 'Camille Martin — Établissement de Strasbourg', templateName: longName, exportFormat: 'pdf', createdAt: '2026-10-22T10:00:00Z', report }));

async function navigate(page: Page, name: string) {
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  await expect(page.locator('.content')).toBeFocused();
  await expect(page.locator('.content')).not.toContainText('Chargement…');
  await expect(page.locator('.content')).not.toContainText('Chargement des données locales…');
  // Clients/templates/history initially render an empty list, not a loading label.
  // Wait for the actual fixture before sending End; otherwise its height can grow AFTER the key.
  if (name === 'Clients') await expect(page.locator('.content')).toContainText('Martin 0');
  if (['Dashboard', 'Générer un contrat', 'Mes modèles', 'Historique'].includes(name)) await expect(page.locator('.content')).toContainText(longName);
  if (name === 'Paramètres') await expect(page.locator('.content')).toContainText('Ligne 100');

}
async function top(page: Page, selector = '.content') { return page.locator(selector).evaluate(e => e.scrollTop); }
async function noOuterOverflow(page: Page) {
  const dimensions = await page.locator('.content').evaluate(e => ({ width: e.clientWidth, scrollWidth: e.scrollWidth, height: e.clientHeight, bottom: e.getBoundingClientRect().bottom, viewport: innerHeight, bodyWidth: document.body.scrollWidth, viewportWidth: innerWidth }));
  expect(dimensions.height).toBeGreaterThan(100);
  expect(dimensions.bottom).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
  expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
}
async function cleanButtons(page: Page, scope = '.content') {
  const problems = await page.locator(scope).evaluate(root => {
    const buttons = Array.from(root.querySelectorAll<HTMLElement>('button')).filter(e => e.offsetWidth > 0 && !e.closest('dialog:not([open])'));
    const failures: string[] = [];
    for (const b of buttons) {
      const r = b.getBoundingClientRect();
      if (b.scrollWidth > b.clientWidth + 2 || b.scrollHeight > b.clientHeight + 2) failures.push(`Clipped text: ${b.textContent}`);
      const card = b.closest('.card, .pick, .modal');
      const table = b.closest('.table-wrap');
      if (card && !table) {
        const c = card.getBoundingClientRect();
        if (r.left < c.left - 1 || r.right > c.right + 1) failures.push(`Outside card: ${b.textContent}`);
      }
    }
    // Sibling actions must never occupy the same pixels.
    for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) {
      const a = buttons[i], b = buttons[j];
      if (a.contains(b) || b.contains(a)) continue;
      const x = a.getBoundingClientRect(), y = b.getBoundingClientRect();
      if (Math.min(x.right, y.right) - Math.max(x.left, y.left) > 2 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 2) failures.push(`Overlapping buttons: ${a.textContent} / ${b.textContent}`);
    }
    return failures;
  });
  expect(problems).toEqual([]);
}

test.beforeAll(async ({ request }) => {
  const dictionary = await (await request.get('/api/dictionary')).json();
  const text = dictionary.slice(0, 40).map((entry: { key: string }) => `Champ ${entry.key} : {{${entry.key}}}`).join('\n');
  const imported = await request.post('/api/templates/import', { data: { fileName: 'clavier-ui.txt', name: longName, base64: Buffer.from(text).toString('base64') } });
  expect(imported.ok()).toBeTruthy();
  expect((await imported.json()).id).toBeTruthy();
  for (let i = 0; i < 8; i++) {
    const response = await request.post('/api/clients', { data: { nom: `Martin ${i}`, prenom: 'Camille', email: `test${i}@example.invalid`, ville: 'Strasbourg', notes: longName } });
    expect(response.ok()).toBeTruthy();
  }
  dashboard = await (await request.get('/api/dashboard')).json();
});

test.beforeEach(async ({ page }) => {
  // Read-only stress fixtures. Real storage and APIs are used for import, forms and preview.
  await page.route('**/api/contracts', route => route.fulfill({ json: contracts }));
  await page.route('**/api/dashboard', route => route.fulfill({ json: { ...dashboard, recentContracts: contracts, contractsCount: 8 } }));
  await page.route('**/api/logs', route => route.fulfill({ json: { lines: Array.from({ length: 100 }, (_, i) => `Ligne ${i + 1} : journal de test local`) } }));
  await page.goto('/');
  await expect(page.locator('.dash')).toBeVisible();
});

test('flèches, PageUp/Down, Espace, Maj+Espace, Début/Fin après navigation', async ({ page }) => {
  await navigate(page, 'Paramètres');
  await noOuterOverflow(page);
  expect(await page.locator('.content').evaluate(e => e.scrollHeight - e.clientHeight)).toBeGreaterThan(100);
  for (const key of ['ArrowDown', 'PageDown', 'Space', 'End']) {
    await page.keyboard.press('Home');
    await expect.poll(() => top(page)).toBe(0);
    await page.keyboard.press(key);
    await expect.poll(() => top(page)).toBeGreaterThan(0);
  }
  for (const key of ['ArrowUp', 'PageUp', 'Shift+Space', 'Home']) {
    await page.keyboard.press('End');
    const bottom = await top(page);
    await page.keyboard.press(key);
    await expect.poll(() => top(page)).toBeLessThan(bottom);
  }
  // No click or focus in the content is required when focus is on the document.
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => top(page)).toBeGreaterThan(0);
});

test('saisie, sélections et activation des boutons ne déclenchent pas le scroll personnalisé', async ({ page }) => {
  await navigate(page, 'Clients');
  const input = page.getByLabel('Nom*', { exact: true });
  await input.fill('Clavier');
  const before = await top(page);
  await page.keyboard.press('Home');
  await page.keyboard.type('Test ');
  await expect(input).toHaveValue('Test Clavier');
  await page.keyboard.press('ArrowDown');
  expect(await top(page)).toBe(before);
  await page.keyboard.press('Control+End');
  expect(await top(page)).toBe(before);
  await navigate(page, 'Paramètres');
  const restore = page.getByRole('button', { name: 'Restaurer une archive' });
  await restore.focus();
  const stable = await top(page);
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Space');
  await chooser;
  expect(await top(page)).toBe(stable);
});

test('onglets de navigation compacts et actions d’import sont accessibles au clavier', async ({ page }) => {
  await navigate(page, 'Mes modèles');
  const picker = page.getByRole('button', { name: 'Déposez un document ou cliquez pour le sélectionner' });
  await picker.focus();
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await chooser;
  await page.getByRole('navigation').getByRole('button', { name: 'Clients', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.content')).toBeFocused();
  await page.keyboard.press('PageDown');
  await expect.poll(() => top(page)).toBeGreaterThan(0);
});

test('modale : scroll isolé, focus piégé, Échap et restauration du focus', async ({ page }, testInfo) => {
  await navigate(page, 'Mes modèles');
  const trigger = page.getByRole('button', { name: 'Variables', exact: true }).first();
  await trigger.click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('modal-variables.png') });
  const background = await top(page);
  await page.keyboard.press('PageDown');
  await expect.poll(() => top(page, 'dialog')).toBeGreaterThan(0);
  expect(await top(page)).toBe(background);
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowDown');
  expect(await top(page)).toBe(background);
  await page.keyboard.press('Tab');
  expect(await modal.evaluate(e => e.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Shift+Tab');
  expect(await modal.evaluate(e => e.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('rapport : modal natif défilant et fermeture par Échap', async ({ page }) => {
  await navigate(page, 'Historique');
  await page.getByRole('button', { name: 'Rapport', exact: true }).first().click();
  await page.keyboard.press('End');
  await expect.poll(() => top(page, 'dialog')).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('aperçu et zoom : barre d’actions séparée du document, boutons toujours accessibles', async ({ page }) => {
  await navigate(page, 'Générer un contrat');
  await page.locator('.pick').filter({ hasText: longName }).first().click();
  await page.getByRole('button', { name: '5. Aperçu', exact: true }).click();
  await expect(page.locator('.sheet')).toBeVisible();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Augmenter le zoom' }).click();
  const bounds = await page.locator('.preview-viewport').evaluate(e => ({ bottom: e.getBoundingClientRect().bottom, contentBottom: e.closest('.content')!.getBoundingClientRect().bottom }));
  expect(bounds.bottom).toBeGreaterThan(0);
  await cleanButtons(page);
  await noOuterOverflow(page);
  await page.locator('.preview-viewport').focus();
  const background = await top(page);
  await page.keyboard.press('PageDown');
  await expect.poll(() => top(page, '.preview-viewport')).toBeGreaterThan(0);
  expect(await top(page)).toBe(background);
  await page.getByRole('button', { name: '6. Export', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Générer et exporter' })).toBeVisible();
});

test('journal imbriqué : les touches défilent le panneau ciblé, pas la page derrière', async ({ page }) => {
  await navigate(page, 'Paramètres');
  const log = page.getByRole('region', { name: 'Journal technique' });
  await log.focus();
  const background = await top(page);
  await page.keyboard.press('PageDown');
  await expect.poll(() => log.evaluate(e => e.scrollTop)).toBeGreaterThan(0);
  expect(await top(page)).toBe(background);
  await page.keyboard.press('Home');
  await expect.poll(() => log.evaluate(e => e.scrollTop)).toBe(0);
});

test('recherche : résultats accessibles par la flèche bas et fermeture par Échap', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.keyboard.press('Control+k');
  const search = page.getByRole('textbox', { name: 'Recherche globale' });
  await expect(search).toBeFocused();
  await search.fill('Martin');
  const results = page.getByRole('region', { name: 'Résultats de recherche' });
  await expect(results).toBeVisible();
  const box = await results.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  await page.keyboard.press('ArrowDown');
  await expect(results.getByRole('button').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(results).toHaveCount(0);
  await expect(search).toBeFocused();
});

test('Fin atteint le bas après le chargement réel retardé des clients', async ({ page }) => {
  await page.route('**/api/clients*', async route => {
    await new Promise(resolve => setTimeout(resolve, 250));
    await route.continue(); // real API and data; only transport latency is added by the test
  });
  await navigate(page, 'Clients');
  await page.keyboard.press('End');
  await expect.poll(() => page.locator('.content').evaluate(e => Math.abs(e.scrollHeight - e.clientHeight - e.scrollTop))).toBeLessThanOrEqual(1);
});

for (const [width, height] of [[1440, 900], [1100, 720], [900, 650], [600, 720], [375, 667], [320, 568], [1100, 480]]) {
  test(`aucun chevauchement ni débordement des boutons : ${width}×${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const name of pages) {
      await navigate(page, name);
      await noOuterOverflow(page);
      await cleanButtons(page);
      if (name === 'Mes modèles' && (width === 1100 || width === 375)) await page.screenshot({ path: testInfo.outputPath(`buttons-templates-${width}.png`) });
      await page.keyboard.press('End');
      const content = page.locator('.content');
      await expect.poll(() => content.evaluate(e => Math.abs(e.scrollHeight - e.clientHeight - e.scrollTop)), { message: `End doit atteindre le bas de ${name} à ${width}×${height}` }).toBeLessThanOrEqual(1);
      if (name === 'Paramètres' && width === 1100 && height === 720) await page.screenshot({ path: testInfo.outputPath('keyboard-settings-bottom.png') });
      await cleanButtons(page);
    }
    await navigate(page, 'Mes modèles');
    await page.getByRole('button', { name: 'Variables', exact: true }).first().click();
    await cleanButtons(page, 'dialog');
    const modal = await page.locator('dialog').boundingBox();
    expect(modal!.x).toBeGreaterThanOrEqual(0);
    expect(modal!.x + modal!.width).toBeLessThanOrEqual(width);
    expect(modal!.y + modal!.height).toBeLessThanOrEqual(height);
    await page.keyboard.press('Escape');
    // Floating menus remain visible inside the viewport, even in horizontally scrolled tables.
    for (const trigger of [page.getByRole('button', { name: 'Notifications', exact: true }), page.getByRole('button', { name: /Menu utilisateur/ })]) {
      await trigger.click();
      await expect(page.locator('.floating-panel')).toBeVisible();
      const box = await page.locator('.floating-panel').boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
    }
    await navigate(page, 'Dashboard');
    await page.getByRole('button', { name: /^Actions :/ }).first().click();
    await expect(page.getByRole('region', { name: 'Actions du contrat' })).toBeVisible();
    const box = await page.locator('.floating-panel').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
    await cleanButtons(page, '.floating-panel');
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });
}
