/** Node adapter compatibility for pinned Tesseract 5.1.1, without changing Electron's identity/security. */
import path from 'node:path';
import { createRequire } from 'node:module';
import { parentPort } from 'node:worker_threads';
import { fetchLocalOcrLanguage, ocrLanguageDirectories } from './local-language-fetch';

const moduleRequire = createRequire(__filename);
const directories = ocrLanguageDirectories(__dirname, process.cwd(), (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath);
let initialLoad: { workerId: string; jobId: string; action: string } | undefined;
parentPort?.on('message', packet => { if (packet.action === 'load') initialLoad = packet; });

try {
  const nodeEntry = moduleRequire.resolve('tesseract.js/src/worker-script/node/index.js');
  const nodeDirectory = path.dirname(nodeEntry);
  moduleRequire(nodeEntry);
  const script = moduleRequire(path.join(nodeDirectory, '../index.js'));
  script.setAdapter({
    getCore: moduleRequire(path.join(nodeDirectory, 'getCore.js')),
    gunzip: moduleRequire(path.join(nodeDirectory, 'gunzip.js')),
    ...moduleRequire(path.join(nodeDirectory, 'cache.js')),
    fetch: (request: string) => fetchLocalOcrLanguage(request, directories),
  });
  const dispatch = script.dispatchHandlers;
  let initialized = false;
  script.dispatchHandlers = (packet: { workerId: string; jobId: string; action: string }, send: (response: Record<string, unknown>) => void) => {
    dispatch(packet, (response: Record<string, unknown>) => {
      send(response);
      if (packet.action === 'initialize' && response.status === 'resolve') initialized = true;
      // Tesseract 5 swallows loadLanguage/initialize errors, leaving createWorker pending forever.
      // Its documented load rejection also rejects workerRes; retain original job IDs, no fake success.
      if (!initialized && response.status === 'reject' && initialLoad && packet.action !== 'load') {
        send({ ...response, ...initialLoad, status: 'reject' });
        parentPort?.close();
      }
    });
  };
} catch (error) {
  // Surface bootstrap/module errors as a real failed load, not an uncaught Electron modal dialog.
  parentPort?.once('message', packet => {
    parentPort?.postMessage({ ...packet, status: 'reject', data: error instanceof Error ? error.message : String(error) });
    parentPort?.close();
  });
}
