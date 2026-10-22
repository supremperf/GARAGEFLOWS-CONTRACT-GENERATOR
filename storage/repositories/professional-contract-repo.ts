import { randomUUID } from 'crypto';
import { bundledProfessionalModel } from '../../core/contracts/bundled-model';
import os from 'os';
import type { ContractEvent, LegalModel, ProfessionalContract } from '../../core/contracts/types';
import { calendarDay, digest } from '../../core/contracts/context';
import { getSqliteDatabase, persistDatabaseToDisk } from '../database/sqlite-db';

export const localActor = (): string => `Utilisateur du poste : ${os.userInfo().username}`;
export async function listProfessionalModels(): Promise<LegalModel[]> {
  const db = await getSqliteDatabase(), bundled = bundledProfessionalModel();
  const probe = db.prepare('SELECT payload_json FROM professional_models WHERE id = ?'); probe.bind([bundled.id]);
  let exists = false;
  try { if (probe.step()) { const old = JSON.parse(String(probe.getAsObject().payload_json)) as LegalModel; if (old.text !== bundled.text || old.sha256 !== bundled.sha256 || JSON.stringify(old.bindings) !== JSON.stringify(bundled.bindings)) throw new Error('Source juridique enregistrée altérée.'); exists = true; } } finally { probe.free(); }
  if (!exists) { db.run('INSERT INTO professional_models(id, payload_json, created_at) VALUES (?, ?, ?)', [bundled.id, JSON.stringify(bundled), bundled.createdAt]); persistDatabaseToDisk(); }
  const stmt = db.prepare('SELECT payload_json FROM professional_models ORDER BY created_at DESC');
  const items: LegalModel[] = [];
  try { while (stmt.step()) items.push(JSON.parse(String(stmt.getAsObject().payload_json))); } finally { stmt.free(); }
  return items;
}
export async function saveProfessionalModel(model: LegalModel): Promise<void> {
  const db = await getSqliteDatabase();
  db.run('INSERT INTO professional_models(id, payload_json, created_at) VALUES (?, ?, ?)', [model.id, JSON.stringify(model), model.createdAt]);
  persistDatabaseToDisk();
}
export async function listProfessionalContracts(clientId?: string): Promise<ProfessionalContract[]> {
  const db = await getSqliteDatabase();
  const stmt = db.prepare(`SELECT payload_json FROM professional_contracts ${clientId ? 'WHERE client_id = ?' : ''} ORDER BY created_at DESC`);
  if (clientId) stmt.bind([clientId]);
  const items: ProfessionalContract[] = [];
  try { while (stmt.step()) items.push(JSON.parse(String(stmt.getAsObject().payload_json))); } finally { stmt.free(); }
  return items;
}
export async function getProfessionalContract(id: string): Promise<ProfessionalContract | null> {
  const db = await getSqliteDatabase(), stmt = db.prepare('SELECT payload_json FROM professional_contracts WHERE id = ?'); stmt.bind([id]);
  try { return stmt.step() ? JSON.parse(String(stmt.getAsObject().payload_json)) : null; } finally { stmt.free(); }
}
export async function allocateContractNumber(): Promise<string> {
  const year = calendarDay().slice(0, 4), db = await getSqliteDatabase();
  const stmt = db.prepare('SELECT next_number FROM professional_counters WHERE year = ?'); stmt.bind([year]);
  let next: number;
  try { next = stmt.step() ? Number(stmt.getAsObject().next_number) : 1; } finally { stmt.free(); }
  db.run('INSERT OR REPLACE INTO professional_counters(year, next_number) VALUES (?, ?)', [year, next + 1]);
  return `GF-ABO-${year}-${String(next).padStart(6, '0')}`;
}
export async function listContractEvents(id: string): Promise<ContractEvent[]> {
  const db = await getSqliteDatabase(), stmt = db.prepare('SELECT payload_json FROM professional_contract_events WHERE contract_id = ? ORDER BY position'); stmt.bind([id]);
  const events: ContractEvent[] = [];
  try { while (stmt.step()) events.push(JSON.parse(String(stmt.getAsObject().payload_json))); } finally { stmt.free(); }
  return events;
}
export async function appendContractEvent(id: string, action: string, detail: string): Promise<void> {
  const db = await getSqliteDatabase(), previous = (await listContractEvents(id)).at(-1)?.hash || '';
  const event = { id: randomUUID(), contractId: id, at: new Date().toISOString(), actor: localActor(), action, detail, previousHash: previous };
  const hash = digest(JSON.stringify(event));
  db.run('INSERT INTO professional_contract_events(id, contract_id, payload_json, position) VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM professional_contract_events))', [event.id, id, JSON.stringify({ ...event, hash })]);
}
export async function saveProfessionalContract(item: ProfessionalContract, action: string, detail: string, persist = true): Promise<void> {
  const db = await getSqliteDatabase();
  db.run('INSERT INTO professional_contracts(id, number, client_id, parent_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json',
    [item.id, item.number, item.clientId, item.parentId || null, JSON.stringify(item), item.createdAt]);
  await appendContractEvent(item.id, action, detail);
  if (persist) persistDatabaseToDisk();
}
export async function hasSavedSubscription(): Promise<boolean> {
  const db = await getSqliteDatabase(), stmt = db.prepare("SELECT 1 FROM key_value_store WHERE key = 'subscription_config'");
  try { return stmt.step(); } finally { stmt.free(); }
}
