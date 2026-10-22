import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

// Runs before application imports, including security logging. Never use an existing profile.
const previous = process.env.GARAGEFLOWS_DATA_DIR;
const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'garageflows-unit-'));
process.env.GARAGEFLOWS_DATA_DIR = isolated;
afterAll(() => {
  fs.rmSync(isolated, { recursive: true, force: true });
  if (previous === undefined) delete process.env.GARAGEFLOWS_DATA_DIR;
  else process.env.GARAGEFLOWS_DATA_DIR = previous;
});
