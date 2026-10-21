import fs from 'fs';
import path from 'path';
import { ensureStorageDirectories } from '../../storage/storage-paths';

/**
 * Masque systématiquement les données bancaires (IBAN, BIC), signatures base64 et données personnelles
 * avant tout enregistrement dans les journaux techniques (Section 9, 18 & 20).
 */
export function sanitizeLogMessage(input: string): string {
  if (!input) return '';
  return input
    // Masquer les images/signatures en base64
    .replace(/data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+/g, '[SIGNATURE_IMAGE_REDACTED]')
    // Masquer les IBAN (ex: FR76 3000 4000 ...)
    .replace(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?\b/g, '[IBAN_REDACTED]')
    // Masquer les clés JSON iban / bic / rib / signature
    .replace(
      /"(iban|bic|rib|signatureClient|signatureImage|signatureDessinee)"\s*:\s*"[^"]*"/gi,
      '"$1":"[REDACTED]"'
    )
    // Masquer les adresses email dans les logs techniques
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]');
}

export function writeAppLog(level: 'INFO' | 'WARN' | 'ERROR' | 'SECURITY', message: string, meta?: unknown): void {
  try {
    const dirs = ensureStorageDirectories();
    const logFile = path.join(dirs.logs, 'app.log');
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` | ${sanitizeLogMessage(JSON.stringify(meta))}` : '';
    const line = `[${timestamp}] [${level}] ${sanitizeLogMessage(message)}${metaStr}\n`;
    fs.appendFileSync(logFile, line, { encoding: 'utf8', mode: 0o600 });
  } catch {
    // Ignorer en cas de système de fichiers en lecture seule
  }
}

export function readRecentLogs(limitLines: number = 100): string[] {
  try {
    const dirs = ensureStorageDirectories();
    const logFile = path.join(dirs.logs, 'app.log');
    if (!fs.existsSync(logFile)) return [];
    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.split(/\r?\n/).filter(Boolean);
    return lines.slice(-limitLines);
  } catch {
    return [];
  }
}
