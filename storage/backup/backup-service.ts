import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { ensureStorageDirectories, getAppDataRoot } from '../storage-paths';
import { resetDatabaseConnection } from '../database/sqlite-db';

function walkFiles(dir: string, base: string, acc: { rel: string; abs: string }[] = []): { rel: string; abs: string }[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(base, abs).split(path.sep).join('/');
    if (entry.isDirectory()) {
      walkFiles(abs, base, acc);
    } else if (!entry.name.endsWith('.tmp')) {
      acc.push({ rel, abs });
    }
  }
  return acc;
}

export async function exportBackupArchive(): Promise<{ buffer: Buffer; fileName: string }> {
  const root = getAppDataRoot();
  ensureStorageDirectories();
  const zip = new JSZip();
  const files = walkFiles(root, root);
  for (const file of files) {
    if (file.rel.startsWith('logs/')) continue;
    if (file.rel.startsWith('backups/')) continue;
    zip.file(file.rel, fs.readFileSync(file.abs));
  }
  zip.file(
    'backup-manifest.json',
    JSON.stringify(
      {
        product: 'GarageFlows Contract Generator',
        createdAt: new Date().toISOString(),
        fileCount: files.length,
      },
      null,
      2
    )
  );
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const fileName = `GarageFlows_Backup_${new Date().toISOString().slice(0, 10)}.zip`;
  return { buffer, fileName };
}

export async function importBackupArchive(buffer: Buffer): Promise<{ restoredFiles: number }> {
  const zip = await JSZip.loadAsync(buffer);
  const manifest = zip.file('backup-manifest.json');
  if (!manifest) {
    throw new Error('Archive de sauvegarde invalide : manifeste manquant.');
  }
  const root = getAppDataRoot();
  ensureStorageDirectories();
  resetDatabaseConnection();

  let restoredFiles = 0;
  const entries = Object.values(zip.files);
  for (const entry of entries) {
    if (entry.dir) continue;
    if (entry.name.includes('..') || path.isAbsolute(entry.name)) {
      throw new Error('Archive de sauvegarde refusée : chemin non autorisé.');
    }
    const target = path.resolve(root, entry.name);
    if (!target.startsWith(path.resolve(root))) {
      throw new Error('Archive de sauvegarde refusée : traversée de répertoire.');
    }
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.writeFileSync(target, await entry.async('nodebuffer'), { mode: 0o600 });
    restoredFiles += 1;
  }
  resetDatabaseConnection();
  return { restoredFiles };
}

export function getStorageSummary(): {
  root: string;
  directories: Record<string, string>;
  bytes: number;
} {
  const dirs = ensureStorageDirectories();
  const files = walkFiles(dirs.root, dirs.root);
  const bytes = files.reduce((sum, file) => sum + fs.statSync(file.abs).size, 0);
  return {
    root: dirs.root,
    directories: {
      database: dirs.database,
      models: dirs.models,
      clients: dirs.clients,
      generated: dirs.generated,
      signatures: dirs.signatures,
      backups: dirs.backups,
      logs: dirs.logs,
      settings: dirs.settings,
    },
    bytes,
  };
}
