import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';

type Database = InstanceType<Awaited<ReturnType<typeof initSqlJs>>['Database']>;
import { ensureStorageDirectories } from '../storage-paths';

let dbInstance: Database | null = null;
let currentDbFilePath: string | null = null;

let initialization: Promise<Database> | null = null;
export async function getSqliteDatabase(): Promise<Database> {
  if (initialization) return initialization;
  initialization = openSqliteDatabase();
  try { return await initialization; } finally { initialization = null; }
}
async function openSqliteDatabase(): Promise<Database> {
  const dirs = ensureStorageDirectories();
  const dbPath = path.join(dirs.database, 'garageflows.sqlite');

  if (dbInstance && currentDbFilePath === dbPath) {
    return dbInstance;
  }

  const wasmCandidates = [
    path.join(__dirname, '../../../node_modules/sql.js/dist/sql-wasm.wasm'),
    path.join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm'),
    path.join((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath || '', 'app.asar.unpacked/node_modules/sql.js/dist/sql-wasm.wasm'),
  ];
  const wasmFile = wasmCandidates.find((candidate) => fs.existsSync(candidate));
  const SQL = await initSqlJs(wasmFile ? { locateFile: () => wasmFile } : undefined);

  if (fs.existsSync(dbPath)) {
    const fileBuf = fs.readFileSync(dbPath);
    dbInstance = new SQL.Database(new Uint8Array(fileBuf));
  } else {
    dbInstance = new SQL.Database();
  }
  currentDbFilePath = dbPath;

  initializeSchema(dbInstance);
  persistDatabaseToDisk();

  return dbInstance;
}

export function resetDatabaseConnection(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore
    }
  }
  dbInstance = null;
  currentDbFilePath = null;
}

function initializeSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      original_file_name TEXT NOT NULL,
      stored_file_path TEXT NOT NULL,
      format TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      structural_fingerprint TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      is_scanned INTEGER NOT NULL DEFAULT 0,
      ocr_applied INTEGER NOT NULL DEFAULT 0,
      page_count INTEGER NOT NULL DEFAULT 1,
      support_level TEXT NOT NULL,
      supported_exports_json TEXT NOT NULL,
      variables_json TEXT NOT NULL,
      warnings_json TEXT NOT NULL,
      limitations_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS template_mappings_memory (
      fingerprint TEXT PRIMARY KEY,
      sha256 TEXT NOT NULL,
      variables_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      nom TEXT NOT NULL,
      prenom TEXT NOT NULL,
      entreprise TEXT NOT NULL,
      email TEXT NOT NULL,
      telephone TEXT NOT NULL,
      ville TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      template_name TEXT NOT NULL,
      client_id TEXT,
      client_name TEXT NOT NULL,
      export_format TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      values_json TEXT NOT NULL,
      report_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS professional_models (
      id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS professional_contracts (
      id TEXT PRIMARY KEY, number TEXT UNIQUE NOT NULL, client_id TEXT NOT NULL,
      parent_id TEXT, payload_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_professional_client ON professional_contracts(client_id);
    CREATE TABLE IF NOT EXISTS professional_contract_events (
      id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, payload_json TEXT NOT NULL, position INTEGER NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS professional_counters (year TEXT PRIMARY KEY, next_number INTEGER NOT NULL);

    CREATE TABLE IF NOT EXISTS key_value_store (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export function persistDatabaseToDisk(): void {
  if (!dbInstance || !currentDbFilePath) return;
  const data = dbInstance.export();
  const buffer = Buffer.from(data);
  const tempPath = `${currentDbFilePath}.tmp`;
  fs.writeFileSync(tempPath, buffer, { mode: 0o600 });
  fs.renameSync(tempPath, currentDbFilePath);
}
