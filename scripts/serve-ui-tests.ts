import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../electron/server';

// A separate, disposable profile: browser tests never use the user's database.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garageflows-ui-'));
process.env.GARAGEFLOWS_DATA_DIR = dataDir;
startServer({ port: 5180, host: '0.0.0.0', staticDir: path.resolve('dist-renderer') })
  .then(() => console.log('GarageFlows UI test server ready on 5180'));
const stop = () => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
