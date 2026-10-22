import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import type { Filesystem } from '@electron/asar/lib/filesystem';
import { archiveRelativePath, archiveApiPath, openDistributionArchive } from '../scripts/distribution-archive.mjs';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-asar-regression-'));
const archive = path.join(temp, 'resources', 'app.asar');

beforeAll(async () => {
  const source = path.join(temp, 'source');
  const write = (name: string, value: string) => {
    const file = path.join(source, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value);
  };
  write('package.json', '{"name":"real-asar-fixture","version":"1.0.1"}');
  write('node_modules/packed/package.json', '{"name":"packed","main":"index.js"}');
  write('node_modules/packed/index.js', 'module.exports = 42;');
  write('node_modules/unpacked/package.json', '{"name":"unpacked","main":"index.js"}');
  write('node_modules/unpacked/index.js', 'module.exports = 43;');
  fs.mkdirSync(path.dirname(archive), { recursive: true });
  await asar.createPackageWithOptions(source, archive, { unpack: '**/unpacked/**' });
  const external = path.join(temp, 'resources/node_modules/external');
  fs.mkdirSync(external, { recursive: true });
  fs.writeFileSync(path.join(external, 'package.json'), '{"name":"external","main":"index.js"}');
  fs.writeFileSync(path.join(external, 'index.js'), 'module.exports = 44;');
});
afterAll(() => fs.rmSync(temp, { recursive: true, force: true }));

describe('portable ASAR inspection', () => {
  it.each(['/node_modules/packed/index.js', '\\node_modules\\packed\\index.js', 'node_modules/packed/index.js', 'node_modules\\packed\\index.js'])('normalizes actual listing/API path %s', name => {
    expect(archiveRelativePath(name)).toBe('node_modules/packed/index.js');
    expect(archiveApiPath(name, path.win32)).toBe('node_modules\\packed\\index.js');
    expect(archiveApiPath(name, path.posix)).toBe('node_modules/packed/index.js');
  });
  it.each(['../escape', '/a/../escape', 'a\\..\\escape', 'C:\\escape', 'a//b', 'a\0b', '/', ''])('rejects unsafe/empty logical path %s', name => {
    expect(() => archiveRelativePath(name)).toThrow();
  });
  it('reproduces the exact old failure with the real ASAR Filesystem and Windows path API', () => {
    const filename = require.resolve('@electron/asar/lib/filesystem');
    const localRequire = createRequire(filename);
    const exports = {} as { Filesystem: typeof Filesystem };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { exports, require: (name: string) => name === 'path' ? path.win32 : localRequire(name), Buffer, BigInt });
    const filesystem = new exports.Filesystem('C:\\out\\app.asar');
    filesystem.setHeader({ files: { node_modules: { files: { packed: { files: {} } } } } }, 0);
    const original = filesystem.listFiles()[0];
    expect(original).toBe('\\node_modules');
    expect(() => filesystem.getFile(original.replace(/^\//, ''), false)).toThrow('"\\node_modules" was not found in this archive');
    expect(filesystem.getFile(archiveApiPath(original, path.win32), false)).toHaveProperty('files.packed');
  });
  it('reads a real packed file without treating a directory as a file', () => {
    const dist = openDistributionArchive(archive);
    expect(dist.entries.has('node_modules')).toBe(true);
    expect(dist.read('\\node_modules\\packed\\index.js').toString()).toContain('42');
    expect(() => dist.read('node_modules')).toThrow(/directory/);
  });
  it('reads unpacked entries at their real physical location', () => {
    const pkg = openDistributionArchive(archive).runtimePackage('unpacked');
    expect(pkg.location).toBe('ASAR-unpacked');
    expect(pkg.read('index.js').toString()).toContain('43');
  });
  it('finds a truly external module in resources/node_modules, not inside ASAR', () => {
    const pkg = openDistributionArchive(archive).runtimePackage('external');
    expect(pkg.location).toContain(path.join('resources', 'node_modules', 'external'));
    expect(pkg.read('index.js').toString()).toContain('44');
  });
  it('does not assume every package exists', () => {
    const dist = openDistributionArchive(archive);
    expect(dist.runtimePackage('missing', false)).toBeUndefined();
    expect(() => dist.runtimePackage('missing')).toThrow(/Runtime dependency missing/);
    expect(() => dist.read('nonexistent.js')).toThrow(/Required ASAR entry missing/);
  });
  it('fails explicitly for an unpacked file absent on disk', () => {
    const file = path.join(`${archive}.unpacked`, 'node_modules/unpacked/index.js');
    fs.renameSync(file, `${file}.test-backup`);
    try { expect(() => openDistributionArchive(archive).read('node_modules/unpacked/index.js')).toThrow(/Unpacked ASAR file missing/); }
    finally { fs.renameSync(`${file}.test-backup`, file); }
  });
  it('fails explicitly for missing and corrupt archives', () => {
    expect(() => openDistributionArchive(path.join(temp, 'missing.asar'))).toThrow(/ASAR file missing/);
    const corrupt = path.join(temp, 'corrupt.asar');
    fs.writeFileSync(corrupt, 'not an ASAR archive');
    expect(() => openDistributionArchive(corrupt)).toThrow(/Unreadable ASAR/);
  });
  it('does not require a node_modules directory for a genuinely bundled archive', async () => {
    const source = path.join(temp, 'bundled');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'main.js'), 'console.log("bundled");');
    const file = path.join(temp, 'bundled.asar');
    await asar.createPackage(source, file);
    const dist = openDistributionArchive(file);
    expect(dist.entries.has('node_modules')).toBe(false);
    expect(dist.read('main.js').toString()).toContain('bundled');
  });
});
