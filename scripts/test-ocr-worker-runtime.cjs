// Real Tesseract/WASM compatibility regression. The Electron environment flag is simulated in this worker only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { setTimeout, clearTimeout } = require('node:timers');

module.exports = async function verifyElectronOcrWorker(root, temp, image) {
  const { createWorker } = require('tesseract.js');
  const bootstrap = path.join(temp, 'electron-ocr-worker.cjs');
  fs.writeFileSync(bootstrap, `Object.defineProperty(process.versions, 'electron', { value: '28.3.3' }); require(${JSON.stringify(path.join(root, 'dist-electron/core/ocr/tesseract-worker.js'))});`);
  const timer = setTimeout(() => { console.error('[runtime] Electron-environment OCR initialization/rejection timed out'); process.exit(1); }, 30000);
  const options = { workerPath: bootstrap, langPath: path.join(root, 'resources/tessdata'), gzip: false, cacheMethod: 'none', errorHandler: () => undefined };
  let worker;
  const previousCwd = process.cwd();
  try {
    worker = await createWorker('fra', 1, options);
    const result = await worker.recognize(image);
    assert.match(result.data.text, /MARTIN/i, 'Real OCR with Electron environment flag failed');
    const exited = once(worker.worker, 'exit');
    await worker.terminate(); worker = null;
    await exited;
    // Known Tesseract 5 bug: failed initialize normally leaves createWorker pending forever.
    const languageDirectory = path.join(temp, 'resources/tessdata');
    fs.mkdirSync(languageDirectory, { recursive: true });
    fs.writeFileSync(path.join(languageDirectory, 'fra.traineddata'), 'invalid language data');
    process.chdir(temp);
    await assert.rejects(createWorker('fra', 1, { ...options, langPath: languageDirectory }), error => /initializ|traineddata|language/i.test(String(error)));
    console.log('[runtime] Real OCR with Electron worker environment + corrupt-language initialization rejection: PASS (Node regression, not a native Electron installation).');
  } finally {
    process.chdir(previousCwd);
    if (worker) await worker.terminate();
    clearTimeout(timer);
  }
};
