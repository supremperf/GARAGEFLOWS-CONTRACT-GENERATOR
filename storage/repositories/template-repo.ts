import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DetectedVariable, DocumentFormat, TemplateRecord } from '../../core/types';
import { parseDocumentBuffer } from '../../core/document-parser';
import { getSqliteDatabase, persistDatabaseToDisk } from '../database/sqlite-db';
import { ensureStorageDirectories } from '../storage-paths';
import { getCustomVariableDefinitions } from './profile-repo';

function rowToTemplate(row: Record<string, unknown>): TemplateRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    category: String(row.category),
    description: String(row.description),
    originalFileName: String(row.original_file_name),
    storedFilePath: String(row.stored_file_path),
    format: row.format as DocumentFormat,
    fileSize: Number(row.file_size),
    sha256: String(row.sha256),
    structuralFingerprint: String(row.structural_fingerprint),
    isDefault: Number(row.is_default) === 1,
    isScanned: Number(row.is_scanned) === 1,
    ocrApplied: Number(row.ocr_applied) === 1,
    pageCount: Number(row.page_count),
    supportLevel: row.support_level as TemplateRecord['supportLevel'],
    supportedExports: JSON.parse(String(row.supported_exports_json)),
    variables: JSON.parse(String(row.variables_json)),
    warnings: JSON.parse(String(row.warnings_json)),
    limitations: JSON.parse(String(row.limitations_json)),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastUsedAt: row.last_used_at ? String(row.last_used_at) : undefined,
  };
}

export async function listTemplates(): Promise<TemplateRecord[]> {
  const db = await getSqliteDatabase();
  const stmt = db.prepare('SELECT * FROM templates ORDER BY is_default DESC, updated_at DESC');
  const items: TemplateRecord[] = [];
  while (stmt.step()) {
    items.push(rowToTemplate(stmt.getAsObject()));
  }
  stmt.free();
  return items;
}

export async function getTemplate(id: string): Promise<TemplateRecord | null> {
  const db = await getSqliteDatabase();
  const stmt = db.prepare('SELECT * FROM templates WHERE id = ?');
  stmt.bind([id]);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const tpl = rowToTemplate(stmt.getAsObject());
  stmt.free();
  return tpl;
}

async function rememberMappings(fingerprint: string, sha256: string, variables: DetectedVariable[]): Promise<void> {
  const db = await getSqliteDatabase();
  db.run(
    'INSERT OR REPLACE INTO template_mappings_memory (fingerprint, sha256, variables_json, updated_at) VALUES (?, ?, ?, ?)',
    [fingerprint, sha256, JSON.stringify(variables), new Date().toISOString()]
  );
}

async function recallMappings(fingerprint: string, sha256: string): Promise<DetectedVariable[] | null> {
  const db = await getSqliteDatabase();
  const stmt = db.prepare(
    'SELECT variables_json FROM template_mappings_memory WHERE fingerprint = ? OR sha256 = ? ORDER BY updated_at DESC LIMIT 1'
  );
  stmt.bind([fingerprint, sha256]);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject() as { variables_json: string };
  stmt.free();
  return JSON.parse(row.variables_json);
}

function mergeRecalledMappings(detected: DetectedVariable[], recalled: DetectedVariable[]): DetectedVariable[] {
  return detected.map((variable) => {
    const match = recalled.find((old) => {
      if (variable.occurrenceIndex && old.occurrenceIndex) {
        return old.occurrenceIndex === variable.occurrenceIndex && old.originalText === variable.originalText;
      }
      return old.originalText === variable.originalText && old.syntaxType === variable.syntaxType;
    });
    if (!match) return variable;
    return {
      ...variable,
      name: match.name || variable.name,
      canonicalField: match.canonicalField || variable.canonicalField,
      dataType: match.dataType || variable.dataType,
      category: match.category || variable.category,
      required: match.required,
      defaultValue: match.defaultValue || variable.defaultValue,
      ambiguous: match.validatedByHuman ? false : variable.ambiguous,
      validatedByHuman: match.validatedByHuman,
      customRule: match.customRule,
    };
  });
}

export async function importTemplate(params: {
  fileName: string;
  buffer: Buffer;
  name?: string;
  category?: string;
  description?: string;
}): Promise<TemplateRecord> {
  const dirs = ensureStorageDirectories();
  const customDefs = await getCustomVariableDefinitions();
  const parsed = await parseDocumentBuffer(params.buffer, params.fileName, params.fileName, customDefs);

  const recalled = await recallMappings(parsed.structuralFingerprint, parsed.sha256);
  const variables = recalled ? mergeRecalledMappings(parsed.detectedVariables, recalled) : parsed.detectedVariables;

  const id = `tpl_${crypto.randomBytes(8).toString('hex')}`;
  const ext = path.extname(params.fileName).toLowerCase() || '.bin';
  const storedDir = path.join(dirs.models, id);
  fs.mkdirSync(storedDir, { recursive: true, mode: 0o700 });
  const storedFilePath = path.join(storedDir, `original${ext}`);
  fs.writeFileSync(storedFilePath, params.buffer, { mode: 0o600 });

  const existing = await listTemplates();
  const isDefault = existing.length === 0;
  const now = new Date().toISOString();
  const record: TemplateRecord = {
    id,
    name: params.name?.trim() || path.basename(params.fileName, ext),
    category: params.category?.trim() || 'Abonnement',
    description: params.description?.trim() || '',
    originalFileName: path.basename(params.fileName),
    storedFilePath,
    format: parsed.format,
    fileSize: params.buffer.length,
    sha256: parsed.sha256,
    structuralFingerprint: parsed.structuralFingerprint,
    isDefault,
    isScanned: parsed.isScanned,
    ocrApplied: parsed.ocrApplied,
    pageCount: parsed.pageCount,
    supportLevel: parsed.supportLevel,
    supportedExports: parsed.supportedExports,
    variables,
    warnings: parsed.warnings,
    limitations: parsed.limitations,
    createdAt: now,
    updatedAt: now,
  };

  const db = await getSqliteDatabase();
  db.run(
    `INSERT INTO templates (
      id, name, category, description, original_file_name, stored_file_path, format, file_size, sha256,
      structural_fingerprint, is_default, is_scanned, ocr_applied, page_count, support_level,
      supported_exports_json, variables_json, warnings_json, limitations_json, created_at, updated_at, last_used_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.name,
      record.category,
      record.description,
      record.originalFileName,
      record.storedFilePath,
      record.format,
      record.fileSize,
      record.sha256,
      record.structuralFingerprint,
      record.isDefault ? 1 : 0,
      record.isScanned ? 1 : 0,
      record.ocrApplied ? 1 : 0,
      record.pageCount,
      record.supportLevel,
      JSON.stringify(record.supportedExports),
      JSON.stringify(record.variables),
      JSON.stringify(record.warnings),
      JSON.stringify(record.limitations),
      record.createdAt,
      record.updatedAt,
      null,
    ]
  );
  await rememberMappings(record.structuralFingerprint, record.sha256, record.variables);
  persistDatabaseToDisk();
  return record;
}

export async function updateTemplate(
  id: string,
  patch: Partial<Pick<TemplateRecord, 'name' | 'category' | 'description' | 'variables' | 'isDefault'>>
): Promise<TemplateRecord> {
  const current = await getTemplate(id);
  if (!current) throw new Error('Modèle introuvable.');
  const updated: TemplateRecord = {
    ...current,
    name: patch.name !== undefined ? patch.name : current.name,
    category: patch.category !== undefined ? patch.category : current.category,
    description: patch.description !== undefined ? patch.description : current.description,
    variables: patch.variables !== undefined ? patch.variables : current.variables,
    isDefault: patch.isDefault !== undefined ? patch.isDefault : current.isDefault,
    updatedAt: new Date().toISOString(),
  };

  const db = await getSqliteDatabase();
  if (updated.isDefault) {
    db.run('UPDATE templates SET is_default = 0');
  }
  db.run(
    `UPDATE templates SET name = ?, category = ?, description = ?, is_default = ?, variables_json = ?, updated_at = ? WHERE id = ?`,
    [
      updated.name,
      updated.category,
      updated.description,
      updated.isDefault ? 1 : 0,
      JSON.stringify(updated.variables),
      updated.updatedAt,
      id,
    ]
  );
  await rememberMappings(updated.structuralFingerprint, updated.sha256, updated.variables);
  persistDatabaseToDisk();
  return updated;
}

export async function deleteTemplate(id: string): Promise<void> {
  const current = await getTemplate(id);
  if (!current) throw new Error('Modèle introuvable.');
  const db = await getSqliteDatabase();
  db.run('DELETE FROM templates WHERE id = ?', [id]);
  persistDatabaseToDisk();
  const dir = path.dirname(current.storedFilePath);
  if (dir.includes(`${path.sep}models${path.sep}`) && fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (current.isDefault) {
    const remaining = await listTemplates();
    if (remaining[0]) {
      await updateTemplate(remaining[0].id, { isDefault: true });
    }
  }
}

export async function duplicateTemplate(id: string): Promise<TemplateRecord> {
  const current = await getTemplate(id);
  if (!current) throw new Error('Modèle introuvable.');
  if (!fs.existsSync(current.storedFilePath)) {
    throw new Error('Le fichier modèle original est introuvable sur le disque.');
  }
  const buffer = fs.readFileSync(current.storedFilePath);
  return importTemplate({
    fileName: current.originalFileName,
    buffer,
    name: `${current.name} (copie)`,
    category: current.category,
    description: current.description,
  });
}

export async function reanalyzeTemplate(id: string): Promise<TemplateRecord> {
  const current = await getTemplate(id);
  if (!current) throw new Error('Modèle introuvable.');
  if (!fs.existsSync(current.storedFilePath)) {
    throw new Error('Fichier modèle inaccessible.');
  }
  const buffer = fs.readFileSync(current.storedFilePath);
  const customDefs = await getCustomVariableDefinitions();
  const parsed = await parseDocumentBuffer(buffer, current.originalFileName, current.storedFilePath, customDefs);
  const variables = mergeRecalledMappings(parsed.detectedVariables, current.variables);
  return updateTemplate(id, { variables });
}

export function readTemplateBuffer(template: TemplateRecord): Buffer {
  if (!fs.existsSync(template.storedFilePath)) {
    throw new Error('Fichier modèle inaccessible ou supprimé.');
  }
  return fs.readFileSync(template.storedFilePath);
}

export async function touchTemplateUsed(id: string): Promise<void> {
  const db = await getSqliteDatabase();
  db.run('UPDATE templates SET last_used_at = ? WHERE id = ?', [new Date().toISOString(), id]);
  persistDatabaseToDisk();
}
