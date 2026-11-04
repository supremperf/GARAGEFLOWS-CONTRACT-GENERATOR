import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';

type Database = InstanceType<Awaited<ReturnType<typeof initSqlJs>>['Database']>;
import { ensureStorageDirectories } from '../storage-paths';

let dbInstance: Database | null = null;
let currentDbFilePath: string | null = null;

export async function getSqliteDatabase(): Promise<Database> {
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

    CREATE TABLE IF NOT EXISTS key_value_store (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Tables de synchronisation GarageFlows Sync Core
    CREATE TABLE IF NOT EXISTS sync_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      source_app TEXT NOT NULL,
      global_id TEXT NOT NULL,
      local_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      field_sources TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 5,
      next_retry_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      last_error TEXT,
      created_at TEXT NOT NULL,
      processed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_sync_outbox_status ON sync_outbox(status, next_retry_at);
    CREATE INDEX IF NOT EXISTS ix_sync_outbox_global ON sync_outbox(global_id);
    CREATE INDEX IF NOT EXISTS ix_sync_outbox_idempotency ON sync_outbox(idempotency_key);

    CREATE TABLE IF NOT EXISTS sync_processed_events (
      idempotency_key TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      global_id TEXT NOT NULL,
      source_app TEXT NOT NULL,
      processed_at TEXT NOT NULL,
      result TEXT NOT NULL DEFAULT 'applied',
      conflict_details TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_sync_processed_global ON sync_processed_events(global_id);

    CREATE TABLE IF NOT EXISTS global_customers (
      global_id TEXT PRIMARY KEY,
      nexa_id INTEGER,
      contract_gen_id TEXT,
      facture_pro_id TEXT,
      nexa_payload_hash TEXT,
      contract_gen_payload_hash TEXT,
      facture_pro_payload_hash TEXT,
      field_sources TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active',
      merge_confidence INTEGER DEFAULT 0,
      merged_into_global_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_synced_at TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_global_nexa ON global_customers(nexa_id);
    CREATE INDEX IF NOT EXISTS ix_global_contract_gen ON global_customers(contract_gen_id);
    CREATE INDEX IF NOT EXISTS ix_global_facture_pro ON global_customers(facture_pro_id);
    CREATE INDEX IF NOT EXISTS ix_global_status ON global_customers(status);

    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      global_id TEXT NOT NULL,
      field_name TEXT NOT NULL,
      local_value TEXT,
      remote_value TEXT,
      local_source TEXT NOT NULL,
      remote_source TEXT NOT NULL,
      master_source TEXT NOT NULL,
      resolution TEXT DEFAULT 'pending',
      resolved_value TEXT,
      resolved_at TEXT,
      resolved_by TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_conflicts_global ON sync_conflicts(global_id, resolution);

    CREATE TABLE IF NOT EXISTS sync_metrics (
      key TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    INSERT OR IGNORE INTO sync_metrics (key, value, updated_at) VALUES
      ('eventsPending', 0, datetime('now')),
      ('eventsProcessedTotal', 0, datetime('now')),
      ('eventsFailedTotal', 0, datetime('now')),
      ('eventsDeadLetter', 0, datetime('now')),
      ('conflictsOpen', 0, datetime('now')),
      ('latencyP50', 0, datetime('now')),
      ('latencyP95', 0, datetime('now')),
      ('latencyP99', 0, datetime('now')),
      ('deduplicationRuns', 0, datetime('now')),
      ('deduplicationMerges', 0, datetime('now'));
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
