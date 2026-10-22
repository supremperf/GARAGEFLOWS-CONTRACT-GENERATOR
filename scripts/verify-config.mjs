import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import { readBuildPolicy, projectRoot } from './windows-metadata.mjs';

const policy = readBuildPolicy();
assert.ok(semver.satisfies(process.versions.node, policy.pkg.engines.node), `Build requires Node ${policy.pkg.engines.node}, actual ${process.versions.node}`);
const { config } = policy;
assert.equal(config.nsis.deleteAppDataOnUninstall, false, 'Keep user data on uninstall/update');
assert.equal(config.asar, true, 'ASAR must be enabled');
assert.ok(config.asarUnpack.includes('**/*.node'), 'Native addons must be unpacked');
assert.ok(config.win.target.some(t => t.target === 'nsis' && t.arch.includes('x64')), 'Missing Windows x64 NSIS target');
for (const key of ['icon', 'installerIcon', 'uninstallerIcon', 'installerHeaderIcon']) {
  const file = key === 'icon' ? config.win[key] : config.nsis[key];
  assert.ok(file && !path.isAbsolute(file), `Invalid relative icon path: ${key}`);
  assert.ok(fs.existsSync(path.join(projectRoot, file)), `Missing icon ${file}`);
}
assert.equal(config.nsis.createDesktopShortcut, true);
assert.equal(config.nsis.createStartMenuShortcut, true);
console.log(`[config] app=${policy.appVersion}; Windows fixed/file=${policy.windowsVersion}; Electron runtime=${config.electronVersion}; Node=${process.versions.node}; x64 NSIS; data preservation enabled.`);
