/** Verify actual distribution contents and PE resources, not only YAML. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Data, NtExecutable, NtExecutableResource, Resource } from 'resedit';
const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const root = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => fs.readFileSync(path.join(root, p));
const appVersion = JSON.parse(read('package.json')).version;
const ico = Data.IconFile.from(read('public/branding/icon.ico'));
assert.deepEqual(ico.icons.map((i) => i.width || 256), [16, 24, 32, 48, 64, 128, 256]);
for (const filename of ['GarageFlows Contract Generator.exe', '../GarageFlows-Contract-Generator-Setup.exe']) {
  const exe = NtExecutable.from(read(`dist/win-unpacked/${filename}`));
  const res = NtExecutableResource.from(exe);
  const versions = Resource.VersionInfo.fromEntries(res.entries);
  assert.ok(versions.some((vi) => vi.getStringValues({ lang: 1033, codepage: 1200 }).ProductVersion?.startsWith(appVersion)), `${filename}: incorrect product version`);
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
    path.join(root, 'dist/GarageFlows-Contract-Generator-Setup.exe'),
    'GarageFlows Contract Generator.exe', 'resources/branding/*', 'resources/app.asar'], { encoding: 'utf8' });
  // p7zip returns warning 1 for the extra NSIS data surrounding its embedded 7z.
  assert.ok(result.status === 0 || result.status === 1, result.stderr || String(result.error));
  const digest = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  for (const file of ['GarageFlows Contract Generator.exe', 'resources/app.asar', ...assets.map((name) => `resources/branding/${name}`)]) {
    assert.equal(digest(path.join(temp, file)), digest(path.join(root, 'dist/win-unpacked', file)), `Setup payload mismatch: ${file}`);
  }
  console.log('[verify] Setup payload extracted: executable, ASAR and all official assets match win-unpacked by SHA-256.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
console.log('[verify] Windows shell display, installed shortcuts and uninstall UI still require a real Windows installation test.');
