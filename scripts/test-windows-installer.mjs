/** Destructive installer operations are restricted to a disposable CI/VM, never existing user installs. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { _electron, expect } from '@playwright/test';
import { Data, Resource } from 'resedit';
import { readBuildPolicy, projectRoot, verifyPeMetadata } from './windows-metadata.mjs';

assert.equal(process.platform, 'win32', 'Run this test on a disposable Windows VM');
assert.ok(process.env.CI === 'true' || process.env.GARAGEFLOWS_ALLOW_INSTALL_SMOKE === '1', 'Installer smoke requires an explicitly disposable CI/VM');
const policy = readBuildPolicy();
function powershell(command) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
const installed = powershell(String.raw`@(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq 'GarageFlows Contract Generator' }).Count`);
assert.equal(installed, '0', 'Refusing to touch an existing GarageFlows installation');
const businessRoot = path.join(process.env.APPDATA, 'GarageFlowsContractGenerator');
assert.ok(!fs.existsSync(businessRoot), 'Refusing to touch an existing business data directory');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-installed-'));
const destination = path.join(temp, 'Application GarageFlows');
const profile = path.join(temp, 'IsolatedData');
const executablePath = path.join(destination, `${policy.productName}.exe`);
const installer = path.join(projectRoot, 'dist/GarageFlows-Contract-Generator-Setup.exe');
fs.mkdirSync('test-results', { recursive: true });
const report = { host: os.release(), node: process.versions.node, appVersion: policy.appVersion, temporaryRoot: temp, stages: [] };
const stage = name => { report.stages.push(name); console.log(`::notice title=Installed test::${name}: PASS`); };
function run(file, args) {
  const result = spawnSync(file, args, { timeout: 180000, encoding: 'utf8', windowsVerbatimArguments: true });
  assert.equal(result.status, 0, `${file}: ${result.error || result.stderr || result.stdout}`);
}
function snapshot() {
  return Object.fromEntries(fs.readdirSync(profile, { recursive: true }).filter(p => fs.statSync(path.join(profile, p)).isFile()).map(p => [p, createHash('sha256').update(fs.readFileSync(path.join(profile, p))).digest('hex')]));
}
async function deadline(promise, operation, milliseconds = 120000) {
  report.activeOperation = operation;
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${operation} timed out; last runtime step: ${report.lastRuntimeStep || 'none'}; uncaught: ${report.lastNativeError || 'none'}; stderr: ${report.lastNativeStderr || 'none'}`)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
let electronApp;
let applicationPid;
async function closeInstalledApp() {
  if (!electronApp) return;
  const current = electronApp;
  // Playwright disposes its channel on close: retain the child handle while it exists.
  const launcher = current.process();
  const pid = applicationPid;
  electronApp = null;
  let observer;
  try {
    assert.ok(Number.isInteger(pid) && pid > 0, 'Missing installed Electron main PID');
    // On Windows Playwright launches cmd.exe. Its close event is not the app's exit status.
    // Open the actual process handle BEFORE requesting a normal user-window close.
    observer = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$p=Get-Process -Id ${pid} -ErrorAction Stop; [void]$p.Handle; [Console]::Out.WriteLine('GF_PROCESS_READY'); $p.WaitForExit(); $code=$p.ExitCode; if ($null -eq $code) { throw 'Missing native process exit code' }; exit $code`], { windowsHide: true });
    let output = '';
    let errors = '';
    const ready = new Promise((resolve, reject) => {
      observer.stdout.on('data', chunk => { output += chunk; if (output.includes('GF_PROCESS_READY')) resolve(); });
      observer.once('error', reject);
      observer.once('exit', () => { if (!output.includes('GF_PROCESS_READY')) reject(new Error(`Native exit observer failed: ${errors}`)); });
    });
    observer.stderr.on('data', chunk => { errors += chunk; });
    const exited = new Promise((resolve, reject) => { observer.once('exit', resolve); observer.once('error', reject); });
    exited.catch(() => {}); // ready can reject first; retain the original failure for the awaited exit below.
    await deadline(ready, 'open native Electron process handle', 15000);
    const request = current.evaluate(({ BrowserWindow }) => {
      // Let the inspector evaluation return before app.quit runs via window-all-closed.
      globalThis.setImmediate(() => { for (const window of BrowserWindow.getAllWindows()) window.close(); });
    }).catch(error => {
      if (!/closed|destroyed|disconnected/i.test(String(error))) throw error;
    });
    request.catch(() => {});
    const code = await deadline(exited, 'normal installed Electron process exit', 30000);
    await request;
    assert.equal(code, 0, `Installed application did not exit normally: ${errors}`);
    (report.nativeExitCodes ||= []).push(code);
    stage('normal native Electron exit (code 0)');
  } catch (error) {
    // Only the launcher/tree created by this test; never kill by executable name.
    spawnSync('taskkill.exe', ['/PID', String(launcher.pid), '/T', '/F'], { timeout: 10000, encoding: 'utf8' });
    throw error;
  } finally {
    if (observer && observer.exitCode === null) observer.kill();
    // After verified native exit this is harness cleanup, not forced product shutdown.
    if (launcher.exitCode === null && launcher.pid !== pid) launcher.kill();
  }
}
async function launch() {
  electronApp = await _electron.launch({ executablePath, cwd: temp, args: [`--user-data-dir=${path.join(temp, 'ChromiumProfile')}`], env: { ...process.env, PATH: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32'), NODE_PATH: '', NODE_OPTIONS: '', GARAGEFLOWS_DATA_DIR: profile }, timeout: 60000 });
  applicationPid = await electronApp.evaluate(() => process.pid);
  electronApp.process().stderr.on('data', chunk => { report.lastNativeStderr = `${report.lastNativeStderr || ''}${chunk}`.slice(-16000); });
  electronApp.on('console', message => {
    const text = message.text();
    if (text.startsWith('GF_SMOKE_ERROR:')) report.lastNativeError = text.slice('GF_SMOKE_ERROR:'.length);
    if (text.startsWith('GF_SMOKE_STEP:')) {
      report.lastRuntimeStep = text.slice('GF_SMOKE_STEP:'.length);
      console.log(`[Installed runtime] BEGIN ${report.lastRuntimeStep}`);
    }
  });
  await expect.poll(() => electronApp.windows().filter(p => p.url().startsWith('http://127.0.0.1:')).length, { timeout: 60000 }).toBe(1);
  const page = electronApp.windows().find(p => p.url().startsWith('http://127.0.0.1:'));
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('img.brand-emblem').first()).toBeVisible();
  // Visibility precedes image decoding, especially on the second launch after reinstall.
  await expect.poll(() => page.locator('img.brand-emblem').first().evaluate(img => img.complete && img.naturalWidth > 0), { timeout: 15000, message: 'Installed logo not loaded' }).toBe(true);
  return page;
}
try {
  run(installer, ['/S', `/D=${destination}`]);
  assert.ok(fs.existsSync(executablePath));
  stage('native NSIS installation');
  const page = await launch();
  await page.screenshot({ path: 'test-results/windows-installed.png', fullPage: true });
  assert.equal(await page.evaluate(() => window.garageflows?.isElectron), true, 'Installed sandboxed preload bridge missing');
  stage('installed Electron window, renderer, sandboxed preload and official logo');
  report.runtime = await deadline(electronApp.evaluate(async ({ app }) => {
    const require = process.mainModule.require('node:module').createRequire(`${app.getAppPath()}/package.json`);
    process.once('uncaughtExceptionMonitor', error => console.log(`GF_SMOKE_ERROR:${error.stack || error}`));
    const path = require('node:path');
    const fs = require('node:fs');
    console.log('GF_SMOKE_STEP:load native canvas binding and DLLs');
    const { createCanvas } = require('canvas');
    console.log('GF_SMOKE_STEP:draw and encode native canvas');
    const canvas = createCanvas(1200, 200);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1200, 200);
    ctx.fillStyle = 'black'; ctx.font = '65px Arial'; ctx.fillText('GARAGEFLOWS CLIENT MARTIN', 40, 125);
    const { runLocalOcrOnBuffer } = require(path.join(app.getAppPath(), 'dist-electron/core/ocr/ocr-engine.js'));
    console.log(`GF_SMOKE_STEP:offline OCR worker at ${require(path.join(app.getAppPath(), 'dist-electron/core/ocr/ocr-engine.js')).resolveOcrWorkerPath()}`);
    const ocr = await runLocalOcrOnBuffer(canvas.toBuffer('image/png'), 'native-runtime.png');
    if (!/MARTIN/i.test(ocr.text)) throw new Error(`Offline OCR failed: ${JSON.stringify(ocr)}`);
    console.log('GF_SMOKE_STEP:positioned PDF.js extraction');
    const { PDFDocument, StandardFonts } = require('pdf-lib');
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf.addPage().drawText('GarageFlows Martin Contrat abonnement 99,99 EUR', { x: 40, y: 700, font });
    const { parsePdfBuffer } = require(path.join(app.getAppPath(), 'dist-electron/core/document-parser/pdf-parser.js'));
    const parsed = await parsePdfBuffer(Buffer.from(await pdf.save()), 'native-runtime.pdf');
    if (!parsed.pdfItems.length || !/Martin/.test(parsed.fullText) || parsed.isScanned) throw new Error(`Packaged PDF.js failed: ${JSON.stringify(parsed.warnings)}`);
    console.log('GF_SMOKE_STEP:SQLite and profile persistence');
    const repo = require(path.join(app.getAppPath(), 'dist-electron/storage/repositories/client-repo.js'));
    await repo.createClient({ nom: 'TEST_INSTALLATION_ISOLE', prenom: 'Martin' });
    const profileRepo = require(path.join(app.getAppPath(), 'dist-electron/storage/repositories/profile-repo.js'));
    await profileRepo.saveProfessionalProfile({ entrepriseNom: 'TEST INSTALLATION', siret: '12345678901234', iban: 'FR1420041010050500013M02606', bic: 'PSSTFRPPXXX' });
    await profileRepo.saveSubscriptionConfig({ prixTTC: '99,99', tvaTaux: '20' });
    console.log('GF_SMOKE_STEP:import and generate DOCX');
    const originalPath = path.join(process.resourcesPath, 'examples/contrat-abonnement-garageflows.docx');
    const original = fs.readFileSync(originalPath);
    const templates = require(path.join(app.getAppPath(), 'dist-electron/storage/repositories/template-repo.js'));
    const template = await templates.importTemplate({ fileName: 'smoke.docx', name: 'TEST_MODELE_ISOLE', buffer: original });
    const { generateContractDocument } = require(path.join(app.getAppPath(), 'dist-electron/core/replacement-engine/index.js'));
    const values = { ENTREPRISE_SIRET: '12345678901234', CLIENT_EMAIL: 'test@example.test', ENTREPRISE_IBAN: 'FR1420041010050500013M02606', ENTREPRISE_BIC: 'PSSTFRPPXXX', ABONNEMENT_PRIX_TTC: '99,99', ABONNEMENT_PRIX_MONTANT: '99,99', ABONNEMENT_PRIX_HT: '83,33', ABONNEMENT_TVA: '20' };
    const generated = await generateContractDocument({ templateId: template.id, templateName: template.name, originalBuffer: original, originalFilePath: originalPath, originalFileName: 'smoke.docx', variables: template.variables, valuesByVariableId: Object.fromEntries(template.variables.map(v => [v.id, values[v.canonicalField] || 'TEST INSTALLATION'])), targetFormat: 'docx' });
    const dirs = require(path.join(app.getAppPath(), 'dist-electron/storage/storage-paths.js')).ensureStorageDirectories();
    fs.writeFileSync(path.join(dirs.generated, 'contrat-test.docx'), generated.buffer);
    fs.writeFileSync(path.join(dirs.signatures, 'signature-test.png'), canvas.toBuffer('image/png'));
    console.log('GF_SMOKE_STEP:runtime security preferences');
    const windows = require('electron').BrowserWindow.getAllWindows();
    const main = windows.find(w => w.webContents.getURL().startsWith('http://127.0.0.1:'));
    const preferences = main.webContents.getLastWebPreferences();
    if (!preferences.contextIsolation || preferences.nodeIntegration || !preferences.sandbox) throw new Error('Electron security flags changed');
    const branding = path.join(process.resourcesPath, 'branding/icon.ico');
    if (!fs.existsSync(branding)) throw new Error('Missing installed ICO');
    return { electron: process.versions.electron, node: process.versions.node, arch: process.arch, appVersion: app.getVersion(), security: { contextIsolation: preferences.contextIsolation, nodeIntegration: preferences.nodeIntegration, sandbox: preferences.sandbox }, canvasPngBytes: canvas.toBuffer('image/png').length, ocrText: ocr.text, positionedPdfItems: parsed.pdfItems.length, appPath: app.getAppPath() };
  }), 'installed business runtime');
  assert.equal(report.runtime.arch, 'x64');
  assert.equal(report.runtime.appVersion, policy.appVersion);
  assert.equal(report.runtime.electron, policy.config.electronVersion);
  stage('packaged x64 canvas native binding/DLL, real offline OCR, ESM PDF.js, SQLite/WASM, imported DOCX and generated contract without Node/npm on PATH');
  const shortcutTargets = JSON.parse(powershell("$shell=New-Object -ComObject WScript.Shell; ConvertTo-Json -Compress -InputObject @(Get-ChildItem ([Environment]::GetFolderPath('Desktop')),([Environment]::GetFolderPath('Programs')) -Filter '*GarageFlows*.lnk' -Recurse | ForEach-Object { $shell.CreateShortcut($_.FullName).TargetPath })"));
  assert.ok(Array.isArray(shortcutTargets), 'Shortcut inspection must return an array');
  // Shell links can expand RUNNER~1 to runneradmin: compare real file identity, not display spelling.
  const canonicalExecutable = fs.realpathSync.native(executablePath).toLowerCase();
  const shortcuts = shortcutTargets.filter(target => typeof target === 'string' && fs.existsSync(target) && fs.realpathSync.native(target).toLowerCase() === canonicalExecutable);
  assert.ok(shortcuts.length >= 2, `Desktop/Start Menu shortcuts missing or point elsewhere: ${JSON.stringify(shortcutTargets)}`);
  stage('installed desktop and Start Menu shortcut targets');
  await closeInstalledApp();
  const before = snapshot();
  const uninstaller = path.join(destination, fs.readdirSync(destination).find(name => /^Uninstall .*\.exe$/.test(name)));
  const uninstallInfo = verifyPeMetadata(fs.readFileSync(uninstaller), policy, 'installer', 'installed uninstaller');
  const official = Data.IconFile.from(fs.readFileSync(path.join(destination, 'resources/branding/icon.ico')));
  const groups = Resource.IconGroupEntry.fromEntries(uninstallInfo.resources.entries);
  assert.ok(groups.length, 'Missing uninstaller icon');
  for (const group of groups) {
    const icons = group.getIconItemsFromEntries(uninstallInfo.resources.entries);
    assert.equal(icons.length, official.icons.length);
    for (const icon of icons) assert.ok(official.icons.some(i => Buffer.from(i.data.bin).equals(Buffer.from(icon.isRaw() ? icon.bin : icon.generate()))), 'Non-official uninstaller icon');
  }
  stage('installed uninstaller PE versions and official multi-resolution icon');
  run(uninstaller, ['/S', `_?=${destination}`]);
  assert.ok(!fs.existsSync(executablePath), 'Application executable remains after uninstall');
  assert.deepEqual(snapshot(), before, 'Uninstaller changed isolated business data');
  stage('real uninstall preserves all isolated business files byte for byte');
  run(installer, ['/S', `/D=${destination}`]);
  await launch();
  const retained = await deadline(electronApp.evaluate(async ({ app }) => {
    const require = process.mainModule.require('node:module').createRequire(`${app.getAppPath()}/package.json`);
    const clients = await require(`${app.getAppPath()}/dist-electron/storage/repositories/client-repo.js`).listClients();
    const templates = await require(`${app.getAppPath()}/dist-electron/storage/repositories/template-repo.js`).listTemplates();
    const profile = await require(`${app.getAppPath()}/dist-electron/storage/repositories/profile-repo.js`).getProfessionalProfile();
    const subscription = await require(`${app.getAppPath()}/dist-electron/storage/repositories/profile-repo.js`).getSubscriptionConfig();
    return { clients: clients.map(c => c.nom), templates: templates.map(t => t.name), company: profile.entrepriseNom, price: subscription.prixTTC };
  }), 'reinstalled business persistence');
  assert.ok(retained.clients.includes('TEST_INSTALLATION_ISOLE'));
  assert.ok(retained.templates.includes('TEST_MODELE_ISOLE'));
  assert.equal(retained.company, 'TEST INSTALLATION');
  assert.equal(retained.price, '99,99');
  stage('real reinstall/relaunch retains clients, imported template, company and subscription');
  await closeInstalledApp();
  run(uninstaller, ['/S', `_?=${destination}`]);
  stage('final isolated uninstall');
} catch (error) {
  console.error(`::error title=Installed test::${String(error.stack || error).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`);
  throw error;
} finally {
  try { await closeInstalledApp(); }
  finally { fs.writeFileSync('test-results/windows-installed.json', JSON.stringify(report, null, 2)); }
  // Do not remove temp on failure: retain proof/data. Never delete AppData or any existing install.
}
