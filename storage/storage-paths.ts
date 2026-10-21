import fs from 'fs';
import os from 'os';
import path from 'path';

export interface StorageDirectories {
  root: string;
  database: string;
  models: string;
  clients: string;
  generated: string;
  signatures: string;
  backups: string;
  logs: string;
  settings: string;
}

let customRootOverride: string | null = null;

export function setStorageRootOverride(customPath: string | null): void {
  customRootOverride = customPath;
}

export function getAppDataRoot(): string {
  if (customRootOverride) {
    return customRootOverride;
  }
  if (process.env.GARAGEFLOWS_DATA_DIR) {
    return path.resolve(process.env.GARAGEFLOWS_DATA_DIR);
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'GarageFlowsContractGenerator');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'GarageFlowsContractGenerator');
  }
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(configHome, 'GarageFlowsContractGenerator');
}

export function ensureStorageDirectories(): StorageDirectories {
  const root = getAppDataRoot();
  const dirs: StorageDirectories = {
    root,
    database: path.join(root, 'database'),
    models: path.join(root, 'models'),
    clients: path.join(root, 'clients'),
    generated: path.join(root, 'generated'),
    signatures: path.join(root, 'signatures'),
    backups: path.join(root, 'backups'),
    logs: path.join(root, 'logs'),
    settings: path.join(root, 'settings'),
  };

  for (const dirPath of Object.values(dirs)) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
    }
  }

  return dirs;
}
