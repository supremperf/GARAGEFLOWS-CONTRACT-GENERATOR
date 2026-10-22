/** Verify actual distribution contents and PE resources, not only YAML. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Data, Resource } from 'resedit';
import { readBuildPolicy, verifyPeMetadata } from './windows-metadata.mjs';
const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const root = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => fs.readFileSync(path.join(root, p));
const policy = readBuildPolicy();
const { appVersion, productName } = policy;
const ico = Data.IconFile.from(read('public/branding/icon.ico'));
assert.deepEqual(ico.icons.map((i) => i.width || 256), [16, 24, 32, 48, 64, 128, 256]);
for (const [filename, kind] of [[`${productName}.exe`, 'application'], ['../GarageFlows-Contract-Generator-Setup.exe', 'installer']]) {
  const info = verifyPeMetadata(read(`dist/win-unpacked/${filename}`), policy, kind, filename);
  const res = info.resources;
  console.log(`[verify] ${filename}: fixed FileVersion=${info.versions[0].fileVersion}, fixed ProductVersion=${info.versions[0].productVersion}, strings=${JSON.stringify(info.versions.map(v => v.strings))}; machine=0x${info.machine.toString(16)} (NSIS stub may be x86; payload is x64).`);
  const groups = Resource.IconGroupEntry.fromEntries(res.entries);
  assert.ok(groups.length > 0, `${filename}: missing icon group`);
  // Every icon in every group must be from the official ICO, including NSIS.
  for (const group of groups) {
    const icons = group.getIconItemsFromEntries(res.entries);
    assert.equal(icons.length, ico.icons.length, `${filename}: resolution count`);
    for (const icon of icons) {
      const data = icon.isRaw() ? icon.bin : icon.generate();
      assert.ok(ico.icons.some((i) => Buffer.from(i.data.bin).equals(Buffer.from(data))), `${filename}: non-official icon`);
    }
  }
  console.log(`[verify] ${filename}: ${groups.length} official PE icon group(s), seven resolutions.`);
}
const resources = 'dist/win-unpacked/resources';
const assets = fs.readdirSync(path.join(root, 'public/branding'));
const archive = path.join(root, resources, 'app.asar');
const packageFiles = asar.listPackage(archive);
const digestBuffer = buffer => createHash('sha256').update(buffer).digest('hex');
const exeInfo = verifyPeMetadata(read(`dist/win-unpacked/${productName}.exe`), policy, 'application');
const integrityEntries = exeInfo.resources.entries.filter(e => e.type === 'INTEGRITY' && e.id === 'ELECTRONASAR');
assert.equal(integrityEntries.length, 1, 'Missing/ambiguous Electron ASAR integrity PE resource');
const integrity = JSON.parse(Buffer.from(integrityEntries[0].bin).toString('utf8'));
const appIntegrity = integrity.find(e => e.file.replaceAll('\\', '/') === 'resources/app.asar');
assert.equal(appIntegrity?.alg, 'SHA256', 'Missing ASAR SHA256 declaration');
assert.equal(appIntegrity.value, digestBuffer(asar.getRawHeader(archive).headerString), 'Electron ASAR header integrity mismatch');
let verifiedAsarFiles = 0;
for (const name of packageFiles) {
  const relative = name.replace(/^\//, '');
  const entry = asar.statFile(archive, relative, false);
  if (entry.files || entry.link) continue;
  assert.equal(entry.integrity?.algorithm, 'SHA256', `Missing file integrity: ${name}`);
  assert.equal(digestBuffer(asar.extractFile(archive, relative)), entry.integrity.hash, `ASAR file integrity mismatch: ${name}`);
  verifiedAsarFiles++;
}
console.log(`[verify] PE ASAR header SHA256 and ${verifiedAsarFiles} actual ASAR/unpacked file hashes verified.`);
for (const tool of ['electron', '@assistant-ai/electron-win32-x64', '@electron/asar', '@electron/rebuild', 'electron-builder', 'typescript', 'eslint', 'vite', 'sharp', 'resedit', '@playwright/test']) {
  assert.ok(!packageFiles.some(name => name.startsWith(`/node_modules/${tool}/`)), `Build-only dependency shipped: ${tool}`);
}
let nativeCount = 0;
for (const name of packageFiles.filter(name => name.endsWith('.node'))) {
  const relative = name.replace(/^\//, '');
  const physical = path.join(root, resources, 'app.asar.unpacked', relative);
  assert.ok(fs.existsSync(physical), `Native addon not unpacked: ${name}`);
  verifyNativeAddon(fs.readFileSync(physical), name);
  nativeCount++;
}
function verifyNativeAddon(binary, name) {
  // PE machine is in the COFF header at e_lfanew + 4. No executing foreign DLLs.
  assert.equal(binary.toString('ascii', 0, 2), 'MZ', `Non-Windows native addon shipped: ${name}`);
  const pe = binary.readUInt32LE(0x3c);
  assert.equal(binary.readUInt32LE(pe), 0x00004550, `Invalid native PE: ${name}`);
  assert.equal(binary.readUInt16LE(pe + 4), 0x8664, `Wrong native architecture: ${name}`);
}
const unpackedRoot = path.join(root, 'dist/win-unpacked');
const payloadFiles = fs.readdirSync(unpackedRoot, { recursive: true }).filter(name => fs.statSync(path.join(unpackedRoot, name)).isFile());
const dlls = payloadFiles.filter(name => name.toLowerCase().endsWith('.dll'));
for (const name of dlls) verifyNativeAddon(fs.readFileSync(path.join(unpackedRoot, name)), name);
console.log(`[verify] ${dlls.length} DLL(s) inspected as Windows AMD64.`);
console.log(`[verify] ${nativeCount} native addon(s) inspected as unpacked Windows AMD64; build tools absent.`);
for (const name of assets) {
  const original = read(`public/branding/${name}`);
  assert.ok(read(`${resources}/branding/${name}`).equals(original), `extraResources: ${name}`);
  assert.ok(asar.extractFile(archive, `dist-renderer/branding/${name}`).equals(original), `renderer ASAR: ${name}`);
}
for (const name of fs.readdirSync(path.join(root, 'dist-renderer/assets'))) {
  assert.ok(asar.extractFile(archive, `dist-renderer/assets/${name}`).equals(read(`dist-renderer/assets/${name}`)), `Compiled UI mismatch: ${name}`);
}
assert.equal(JSON.parse(asar.extractFile(archive, 'package.json')).version, appVersion);
console.log(`[verify] Compiled renderer byte-checked in ASAR; installed version ${appVersion}.`);
assert.ok(asar.extractFile(archive, 'dist-electron/electron/main.js').toString().includes('com.garageflows.contractgenerator'));
assert.ok(read('public/branding/logo-full.png').equals(read('resources/branding/logo-official.png')));
console.log(`[verify] ${assets.length} branding files byte-checked in ASAR and extraResources; original source unchanged.`);
// Extract the shipped payload as well: win-unpacked alone is not proof of Setup contents.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'garageflows-branding-'));
try {
  const sevenZip = require('7zip-bin').path7za;
  const result = spawnSync(sevenZip, ['x', '-y', `-o${temp}`,
    path.join(root, 'dist/GarageFlows-Contract-Generator-Setup.exe')], { encoding: 'utf8' });
  // p7zip returns warning 1 for the extra NSIS data surrounding its embedded 7z.
  assert.ok(result.status === 0 || result.status === 1, result.stderr || String(result.error));
  const digest = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  for (const file of payloadFiles) {
    assert.equal(digest(path.join(temp, file)), digest(path.join(root, 'dist/win-unpacked', file)), `Setup payload mismatch: ${file}`);
  }
  console.log(`[verify] Entire Setup payload extracted: ${payloadFiles.length} files (EXE, ASAR, unpacked modules/WASM, DLLs, resources, examples) match win-unpacked by SHA-256.`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
console.log('[verify] Windows shell display, installed shortcuts and uninstall UI still require a real Windows installation test.');
