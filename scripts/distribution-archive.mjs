/** Inspect the actual ASAR tree. Logical paths are portable; API/physical paths use host separators. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const asar = require('@electron/asar');

export function archiveRelativePath(name) {
  assert.ok(typeof name === 'string' && name && !name.includes('\0'), `Invalid ASAR path: ${JSON.stringify(name)}`);
  const relative = name.replaceAll('\\', '/').replace(/^\/+/, '');
  assert.ok(relative && !/^[a-z]:/i.test(relative), `Drive/root is not an ASAR entry: ${name}`);
  assert.ok(relative.split('/').every(part => part && part !== '.' && part !== '..'), `Unsafe ASAR entry: ${name}`);
  return relative;
}

export function archiveApiPath(name, hostPath = path) {
  return archiveRelativePath(name).split('/').join(hostPath.sep);
}

export function openDistributionArchive(filename) {
  assert.ok(fs.existsSync(filename) && fs.statSync(filename).isFile(), `ASAR file missing: ${filename}`);
  let raw;
  try { raw = asar.getRawHeader(filename); } catch (error) {
    throw new Error(`Unreadable ASAR ${filename}: ${error.message}`, { cause: error });
  }
  assert.ok(raw.header?.files, `ASAR root has no file tree: ${filename}`);
  const entries = new Map();
  function visit(files, parent = '') {
    for (const [name, entry] of Object.entries(files)) {
      assert.ok(name && !/[\\/:\0]/.test(name) && name !== '.' && name !== '..', `Unsafe ASAR header component: ${name}`);
      const logical = parent ? `${parent}/${name}` : name;
      entries.set(logical, entry);
      if (entry.files) visit(entry.files, logical);
    }
  }
  visit(raw.header.files);
  // listPackage includes directories and rooted display paths; statFile requires RELATIVE paths.
  const listed = asar.listPackage(filename).map(archiveRelativePath);
  assert.equal(new Set(listed).size, entries.size, 'ASAR listing/header size disagreement');
  for (const name of listed) assert.ok(entries.has(name), `ASAR listing/header disagreement: ${name}`);

  function read(name, seen = new Set()) {
    const logical = archiveRelativePath(name);
    const entry = entries.get(logical);
    assert.ok(entry, `Required ASAR entry missing: ${logical} in ${filename}`);
    assert.ok(!entry.files, `Expected file, found ASAR directory: ${logical}`);
    if (entry.link) {
      assert.ok(!seen.has(logical), `Cyclic ASAR link: ${logical}`);
      seen.add(logical);
      return read(entry.link, seen);
    }
    if (entry.unpacked) {
      const physical = path.join(`${filename}.unpacked`, ...logical.split('/'));
      assert.ok(fs.existsSync(physical) && fs.statSync(physical).isFile(), `Unpacked ASAR file missing: ${logical}; expected ${physical}`);
      return fs.readFileSync(physical);
    }
    return asar.extractFile(filename, archiveApiPath(logical), false);
  }
  const resources = path.dirname(filename);
  function runtimePackage(name, required = true) {
    assert.match(name, /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i, `Invalid package name: ${name}`);
    const logical = `node_modules/${name}/package.json`;
    if (entries.has(logical)) {
      const entry = entries.get(logical);
      return { manifest: JSON.parse(read(logical)), location: entry.unpacked ? 'ASAR-unpacked' : 'ASAR', has: relative => { const e = entries.get(`node_modules/${name}/${archiveRelativePath(relative)}`); return !!e && !e.files; }, read: relative => read(`node_modules/${name}/${archiveRelativePath(relative)}`) };
    }
    // Node also searches resources/node_modules when resolving from resources/app.asar.
    // An unindexed app.asar.unpacked tree is NOT a valid substitute for an ASAR module.
    const directory = path.join(resources, 'node_modules', ...name.split('/'));
    const physical = path.join(directory, 'package.json');
    if (fs.existsSync(physical)) return {
      manifest: JSON.parse(fs.readFileSync(physical, 'utf8')), location: physical,
      has: relative => { const file = path.join(directory, ...archiveRelativePath(relative).split('/')); return fs.existsSync(file) && fs.statSync(file).isFile(); },
      read: relative => fs.readFileSync(path.join(directory, ...archiveRelativePath(relative).split('/'))),
    };
    assert.ok(!required, `Runtime dependency missing: ${name}; checked ${logical} in ${filename} and ${physical}`);
    return undefined;
  }
  return { filename, entries, headerString: raw.headerString, read, runtimePackage };
}
