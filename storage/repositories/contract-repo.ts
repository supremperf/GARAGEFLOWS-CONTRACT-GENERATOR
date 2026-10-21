import fs from 'fs';
import { GeneratedContractRecord } from '../../core/types';
import { getSqliteDatabase, persistDatabaseToDisk } from '../database/sqlite-db';

function rowToContract(row: Record<string, unknown>): GeneratedContractRecord {
  return {
    id: String(row.id),
    templateId: String(row.template_id),
    templateName: String(row.template_name),
    clientId: row.client_id ? String(row.client_id) : undefined,
    clientName: String(row.client_name),
    exportFormat: row.export_format as GeneratedContractRecord['exportFormat'],
    fileName: String(row.file_name),
    filePath: String(row.file_path),
    fileSize: Number(row.file_size),
    sha256: String(row.sha256),
    valuesUsed: JSON.parse(String(row.values_json)),
    report: JSON.parse(String(row.report_json)),
    createdAt: String(row.created_at),
  };
}

export async function listContracts(): Promise<GeneratedContractRecord[]> {
  const db = await getSqliteDatabase();
  const stmt = db.prepare('SELECT * FROM contracts ORDER BY created_at DESC');
  const items: GeneratedContractRecord[] = [];
  while (stmt.step()) {
    items.push(rowToContract(stmt.getAsObject()));
  }
  stmt.free();
  return items;
}

export async function getContract(id: string): Promise<GeneratedContractRecord | null> {
  const db = await getSqliteDatabase();
  const stmt = db.prepare('SELECT * FROM contracts WHERE id = ?');
  stmt.bind([id]);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const item = rowToContract(stmt.getAsObject());
  stmt.free();
  return item;
}

export async function listContractsByClient(clientId: string): Promise<GeneratedContractRecord[]> {
  const all = await listContracts();
  return all.filter((c) => c.clientId === clientId);
}

export async function saveContract(record: GeneratedContractRecord): Promise<GeneratedContractRecord> {
  const db = await getSqliteDatabase();
  db.run(
    `INSERT INTO contracts (
      id, template_id, template_name, client_id, client_name, export_format, file_name, file_path,
      file_size, sha256, values_json, report_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.templateId,
      record.templateName,
      record.clientId || null,
      record.clientName,
      record.exportFormat,
      record.fileName,
      record.filePath,
      record.fileSize,
      record.sha256,
      JSON.stringify(record.valuesUsed),
      JSON.stringify(record.report),
      record.createdAt,
    ]
  );
  persistDatabaseToDisk();
  return record;
}

export async function deleteContract(id: string, deleteFile: boolean): Promise<void> {
  const current = await getContract(id);
  if (!current) throw new Error('Contrat introuvable.');
  const db = await getSqliteDatabase();
  db.run('DELETE FROM contracts WHERE id = ?', [id]);
  persistDatabaseToDisk();
  if (deleteFile && current.filePath && fs.existsSync(current.filePath)) {
    fs.unlinkSync(current.filePath);
  }
}
