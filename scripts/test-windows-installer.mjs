/** Destructive installer operations are restricted to a disposable CI/VM, never existing user installs. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { _electron, expect } from '@playwright/test';
import { readBuildPolicy, projectRoot } from './windows-metadata.mjs';

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
const destination = path.join(temp, 'Application');
const profile = path.join(temp, 'IsolatedData');
const executablePath = path.join(destination, `${policy.productName}.exe`);
const installer = path.join(projectRoot, 'dist/GarageFlows-Contract-Generator-Setup.exe');
fs.mkdirSync('test-results', { recursive: true });
const report = { host: os.release(), node: process.versions.node, appVersion: policy.appVersion, temporaryRoot: temp, stages: [] };
const stage = name => { report.stages.push(name); console.log(`[installed] ${name}: PASS`); };
function run(file, args) {
  const result = spawnSync(file, args, { timeout: 180000, encoding: 'utf8', windowsVerbatimArguments: true });
  assert.equal(result.status, 0, `${file}: ${result.error || result.stderr || result.stdout}`);
}
function snapshot() {
  return Object.fromEntries(fs.readdirSync(profile, { recursive: true }).filter(p => fs.statSync(path.join(profile, p)).isFile()).map(p => [p, createHash('sha256').update(fs.readFileSync(path.join(profile, p))).digest('hex')]));
}
let electronApp;
async function launch() {
  electronApp = await _electron.launch({ executablePath, env: { ...process.env, GARAGEFLOWS_DATA_DIR: profile }, timeout: 60000 });
  await expect.poll(() => electronApp.windows().filter(p => p.url().startsWith('http://127.0.0.1:')).length, { timeout: 60000 }).toBe(1);
  const page = electronApp.windows().find(p => p.url().startsWith('http://127.0.0.1:'));
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('img.brand-lockup').first()).toBeVisible();
  assert.ok(await page.locator('img.brand-lockup').first().evaluate(img => img.naturalWidth > 0), 'Installed logo not loaded');
  return page;
}
try {
  run(installer, ['/S', `/D=${destination}`]);
  assert.ok(fs.existsSync(executablePath));
  stage('native NSIS installation');
  const page = await launch();
  await page.screenshot({ path: 'test-results/windows-installed.png', fullPage: true });
  stage('installed Electron window, renderer and official logo');
  report.runtime = await electronApp.evaluate(async ({ app }) => {
    const require = (await import('node:module')).createRequire(`${app.getAppPath()}/package.json`);
    const path = require('node:path');
    const fs = require('node:fs');
    const { createCanvas } = require('canvas');
    const canvas = createCanvas(1200, 200);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1200, 200);
    ctx.fillStyle = 'black'; ctx.font = '65px Arial'; ctx.fillText('GARAGEFLOWS CLIENT MARTIN', 40, 125);
    const { runLocalOcrOnBuffer } = require(path.join(app.getAppPath(), 'dist-electron/core/ocr/ocr-engine.js'));
    const ocr = await runLocalOcrOnBuffer(canvas.toBuffer('image/png'), 'native-runtime.png');
    if (!/MARTIN/i.test(ocr.text)) throw new Error(`Offline OCR failed: ${JSON.stringify(ocr)}`);
    const { PDFDocument, StandardFonts } = require('pdf-lib');
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf.addPage().drawText('GarageFlows Martin Contrat abonnement 99,99 EUR', { x: 40, y: 700, font });
    const { parsePdfBuffer } = require(path.join(app.getAppPath(), 'dist-electron/core/document-parser/pdf-parser.js'));
    const parsed = await parsePdfBuffer(Buffer.from(await pdf.save()));
    if (!parsed.pdfItems.length || !/Martin/.test(parsed.fullText) || parsed.isScanned) throw new Error(`Packaged PDF.js failed: ${JSON.stringify(parsed.warnings)}`);
    const repo = require(path.join(app.getAppPath(), 'dist-electron/storage/repositories/client-repo.js'));
    await repo.createClient({ nom: 'TEST_INSTALLATION_ISOLE', prenom: 'Martin' });
    const branding = path.join(process.resourcesPath, 'branding/icon.ico');
    if (!fs.existsSync(branding)) throw new Error('Missing installed ICO');
    return { electron: process.versions.electron, node: process.versions.node, arch: process.arch, appVersion: app.getVersion(), canvasPngBytes: canvas.toBuffer('image/png').length, ocrText: ocr.text, positionedPdfItems: parsed.pdfItems.length, appPath: app.getAppPath() };
  });
  assert.equal(report.runtime.arch, 'x64');
  assert.equal(report.runtime.appVersion, policy.appVersion);
  assert.equal(report.runtime.electron, policy.config.electronVersion);
  stage('packaged x64 canvas native binding/DLL, real offline OCR, ESM PDF.js and SQLite/WASM');
  const escapedExe = executablePath.replaceAll("'", "''");
  const shortcuts = powershell(`$shell=New-Object -ComObject WScript.Shell; @(Get-ChildItem ([Environment]::GetFolderPath('Desktop')),([Environment]::GetFolderPath('Programs')) -Filter '*GarageFlows*.lnk' -Recurse | Where-Object { $shell.CreateShortcut($_.FullName).TargetPath -eq '${escapedExe}' }).Count`);
  assert.ok(Number(shortcuts) >= 2, `Desktop/Start Menu shortcuts missing: ${shortcuts}`);
  stage('installed desktop and Start Menu shortcut targets');
  await electronApp.close(); electronApp = null;
  const before = snapshot();
  const uninstaller = path.join(destination, fs.readdirSync(destination).find(name => /^Uninstall .*\.exe$/.test(name)));
  run(uninstaller, ['/S', `_?=${destination}`]);
  assert.ok(!fs.existsSync(executablePath), 'Application executable remains after uninstall');
  assert.deepEqual(snapshot(), before, 'Uninstaller changed isolated business data');
  stage('real uninstall preserves all isolated business files byte for byte');
  run(installer, ['/S', `/D=${destination}`]);
  await launch();
  const names = await electronApp.evaluate(async ({ app }) => {
    const require = (await import('node:module')).createRequire(`${app.getAppPath()}/package.json`);
    return (await require(`${app.getAppPath()}/dist-electron/storage/repositories/client-repo.js`).listClients()).map(c => c.nom);
  });
  assert.ok(names.includes('TEST_INSTALLATION_ISOLE'));
  stage('real reinstall/relaunch retains SQLite client');
  await electronApp.close(); electronApp = null;
  run(uninstaller, ['/S', `_?=${destination}`]);
  stage('final isolated uninstall');
} finally {
  if (electronApp) await electronApp.close();
  fs.writeFileSync('test-results/windows-installed.json', JSON.stringify(report, null, 2));
  // Do not remove temp on failure: retain proof/data. Never delete AppData or any existing install.
}
