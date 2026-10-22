import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { fetchLocalOcrLanguage, ocrLanguageDirectories } from '../core/ocr/local-language-fetch';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-local-language-'));
const allowed = path.join(root, 'resources with spaces');
fs.mkdirSync(allowed);
const file = path.join(allowed, 'fra.traineddata');
fs.writeFileSync(file, Buffer.from([1, 2, 3, 4]));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('strictly offline Electron OCR language adapter', () => {
  it('returns exactly the local file bytes, without exposing the backing Buffer pool', async () => {
    const response = await fetchLocalOcrLanguage(file, [allowed]);
    expect(response.ok).toBe(true);
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3, 4]);
  });
  it('rejects network access instead of falling back to a CDN', async () => {
    await expect(fetchLocalOcrLanguage('https://example.test/fra.traineddata', [allowed])).rejects.toThrow('network access is disabled');
  });
  it('rejects files outside the known language directories', async () => {
    await expect(fetchLocalOcrLanguage(path.join(root, 'fra.traineddata'), [allowed])).rejects.toThrow('outside');
  });
  it('rejects arbitrary files even in a known directory', async () => {
    await expect(fetchLocalOcrLanguage(path.join(allowed, 'settings.json'), [allowed])).rejects.toThrow('local fra/eng');
  });
  it('retains development resources outside ASAR', () => {
    expect(ocrLanguageDirectories(path.join(root, 'dist-electron/core/ocr'), root).at(-1)).toBe(path.join(root, 'resources/tessdata'));
  });
  it('prefers installed resources over the current working directory', () => {
    const directories = ocrLanguageDirectories(path.join(root, 'app.asar/dist-electron/core/ocr'), '/untrusted-cwd', path.join(root, 'installed-resources'));
    expect(directories[0]).toBe(path.join(root, 'installed-resources/tessdata'));
    expect(directories).toEqual([path.join(root, 'installed-resources/tessdata')]);
  });
});
