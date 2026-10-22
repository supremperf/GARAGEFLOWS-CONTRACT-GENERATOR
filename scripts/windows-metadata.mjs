/** Shared release policy and strict, translation-aware PE inspection. No binary mutation. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import semver from 'semver';
import { NtExecutable, NtExecutableResource, Resource } from 'resedit';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export function versionPolicy(version) {
  const parsed = semver.parse(version);
  assert.ok(parsed, `package.json: invalid SemVer ${version}`);
  const canonical = parsed.version + (parsed.build.length ? `+${parsed.build.join('.')}` : '');
  assert.equal(canonical, version, `package.json: invalid canonical SemVer ${version}`);
  const parts = [parsed.major, parsed.minor, parsed.patch, 0];
  assert.ok(parts.every(n => n <= 65535), `Version exceeds Windows WORD fields: ${version}`);
  return { appVersion: version, windowsVersion: parts.join('.'), parts };
}

export function readBuildPolicy(root = projectRoot) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const config = yaml.load(fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8'));
  const policy = versionPolicy(pkg.version);
  assert.equal(lock.version, pkg.version, 'package-lock.json root version is stale');
  assert.equal(lock.packages[''].version, pkg.version, 'package-lock.json package version is stale');
  assert.equal(pkg.build, undefined, 'Use electron-builder.yml only, not package.json.build');
  assert.equal(config.extraMetadata?.version, undefined, 'Version override forbidden: package.json is authoritative');
  assert.equal(config.buildVersion, undefined, 'buildVersion must be derived, not hard-coded in YAML');
  assert.equal(config.buildNumber, undefined, 'buildNumber must be derived, not inherited from a CI counter');
  assert.ok(config.productName && config.appId, 'Missing Windows product identity');
  const runtime = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/@assistant-ai/electron-win32-x64/package.json'), 'utf8'));
  assert.equal(config.electronVersion, runtime.version, 'Electron runtime/config mismatch (not the app version)');
  return { ...policy, productName: config.productName, appId: config.appId, config, pkg };
}

function quad(value, label) {
  assert.match(value || '', /^\d+\.\d+\.\d+(?:\.\d+)?$/, `${label}: invalid Windows version ${JSON.stringify(value)}`);
  const parts = value.split('.').map(Number);
  if (parts.length === 3) parts.push(0);
  assert.ok(parts.every(n => n <= 65535), `${label}: Windows component exceeds 65535`);
  return parts.join('.');
}
function fixedQuad(ms, ls) {
  return [ms >>> 16, ms & 65535, ls >>> 16, ls & 65535].join('.');
}

export function inspectPe(buffer) {
  const exe = NtExecutable.from(buffer, { ignoreCert: true });
  const resources = NtExecutableResource.from(exe);
  return {
    machine: exe.newHeader.fileHeader.machine,
    resources,
    versions: Resource.VersionInfo.fromEntries(resources.entries).map(vi => ({
      resourceLanguage: vi.lang,
      fileVersion: fixedQuad(vi.fixedInfo.fileVersionMS, vi.fixedInfo.fileVersionLS),
      productVersion: fixedQuad(vi.fixedInfo.productVersionMS, vi.fixedInfo.productVersionLS),
      translations: vi.getAvailableLanguages(),
      strings: vi.getAllLanguagesForStringValues().map(translation => ({ ...translation, values: vi.getStringValues(translation) })),
    })),
  };
}

export function verifyPeMetadata(buffer, policy, kind, label = kind) {
  const info = inspectPe(buffer);
  const diagnostics = JSON.stringify(info.versions);
  assert.ok(info.versions.length, `${label}: missing VERSIONINFO`);
  if (kind === 'application') assert.equal(info.machine, 0x8664, `${label}: application must be AMD64`);
  else assert.ok(info.machine === 0x14c || info.machine === 0x8664, `${label}: invalid NSIS stub architecture`);
  for (const vi of info.versions) {
    assert.equal(vi.fileVersion, policy.windowsVersion, `${label}: fixed FileVersion; actual ${diagnostics}`);
    assert.equal(vi.productVersion, policy.windowsVersion, `${label}: fixed ProductVersion; actual ${diagnostics}`);
    assert.ok(vi.strings.length, `${label}: no StringFileInfo tables; actual ${diagnostics}`);
    assert.ok(vi.translations.length, `${label}: missing VarFileInfo translations`);
    for (const lang of vi.translations) {
      assert.ok(vi.strings.some(s => s.lang === lang.lang && s.codepage === lang.codepage), `${label}: declared translation without strings ${JSON.stringify(lang)}`);
    }
    for (const { lang, codepage, values } of vi.strings) {
      const table = `${label} lang=${lang} codepage=${codepage}`;
      assert.ok(vi.translations.some(t => t.lang === lang && t.codepage === codepage), `${table}: undeclared strings table`);
      assert.equal(values.ProductName, policy.productName, `${table}: wrong ProductName`);
      assert.equal(quad(values.FileVersion, table), policy.windowsVersion, `${table}: wrong string FileVersion`);
      // Stable releases may use Windows' four-component notation; prereleases must retain their identity.
      const product = values.ProductVersion;
      const matches = product === policy.appVersion || (!semver.prerelease(policy.appVersion) && semver.parse(policy.appVersion).build.length === 0 && /^\d+\.\d+\.\d+(?:\.\d+)?$/.test(product || '') && quad(product, table) === policy.windowsVersion);
      assert.ok(matches, `${table}: wrong string ProductVersion ${JSON.stringify(product)}; expected ${policy.appVersion}; actual ${diagnostics}`);
    }
  }
  return info;
}
