import path from 'path';
import { writeAppLog } from './logger';

const ALLOWED_DOCUMENT_EXTENSIONS = new Set([
  '.pdf', '.docx', '.doc', '.odt', '.rtf', '.txt', '.html',
  '.xlsx', '.xls', '.ods', '.csv', '.pptx',
  '.png', '.jpg', '.jpeg', '.tiff',
]);

const FORBIDDEN_EXECUTABLE_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.ps1', '.vbs', '.js', '.mjs', '.cjs',
  '.msi', '.scr', '.com', '.pif', '.dll', '.sys', '.sh', '.bash',
]);

export const MAX_IMPORT_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 Mo

export function validateSafeFilePath(inputPath: string, allowRelative: boolean = false): string {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('Chemin de fichier manquant ou invalide.');
  }
  if (inputPath.includes('\0')) {
    writeAppLog('SECURITY', 'Tentative d’injection d’octet nul dans un chemin de fichier bloquée');
    throw new Error('Chemin de fichier malveillant détecté (octet nul interdit).');
  }
  const normalized = path.normalize(inputPath);
  if (!allowRelative && !path.isAbsolute(normalized)) {
    // Vérifier qu'il n'y a pas de traversée .. en dehors du dossier courant
    if (normalized.startsWith('..') || normalized.includes(`..${path.sep}`)) {
      writeAppLog('SECURITY', `Tentative de traversée de répertoire bloquée : ${inputPath}`);
      throw new Error('Chemin de fichier non autorisé (traversée de répertoire interdite).');
    }
  }
  // Bloquer l'accès aux fichiers système sensibles
  const lower = normalized.toLowerCase();
  if (
    lower.includes('/etc/passwd') ||
    lower.includes('/etc/shadow') ||
    lower.includes('\\windows\\system32\\') ||
    lower.includes('/proc/self')
  ) {
    writeAppLog('SECURITY', `Tentative d’accès à un fichier système bloquée : ${inputPath}`);
    throw new Error('Accès interdit aux fichiers système.');
  }
  return path.resolve(normalized);
}

export function validateImportedFileSecurity(params: {
  fileName: string;
  buffer: Buffer;
}): void {
  const { fileName, buffer } = params;
  if (!fileName || typeof fileName !== 'string' || fileName.includes('\0')) {
    throw new Error('Nom de fichier invalide.');
  }

  const ext = path.extname(fileName).toLowerCase();
  if (FORBIDDEN_EXECUTABLE_EXTENSIONS.has(ext)) {
    writeAppLog('SECURITY', `Tentative d’importation d’un exécutable bloquée : ${fileName}`);
    throw new Error(`Sécurité : Les fichiers exécutables ou scripts (${ext}) sont strictement interdits.`);
  }

  if (!ALLOWED_DOCUMENT_EXTENSIONS.has(ext)) {
    throw new Error(
      `Format non pris en charge (${ext || 'sans extension'}). Formats autorisés : PDF, DOCX, DOC, ODT, RTF, TXT, HTML, XLSX, XLS, ODS, CSV, PPTX, PNG, JPG, JPEG, TIFF.`
    );
  }

  if (!buffer || buffer.length === 0) {
    throw new Error('Le fichier sélectionné est vide (0 octet).');
  }

  if (buffer.length > MAX_IMPORT_FILE_SIZE_BYTES) {
    throw new Error(
      `Le fichier est trop volumineux (${(buffer.length / (1024 * 1024)).toFixed(1)} Mo). Limite maximale : 50 Mo.`
    );
  }

  // Vérification de la signature binaire (Magic Bytes) contre les exécutables Windows PE (MZ) déguisés
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    writeAppLog('SECURITY', `Exécutable Windows PE (MZ) déguisé en document bloqué : ${fileName}`);
    throw new Error('Sécurité : Ce fichier contient un en-tête d’exécutable binaire (MZ) et a été bloqué.');
  }
  // Vérification contre les exécutables Linux ELF déguisés
  if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    writeAppLog('SECURITY', `Exécutable ELF déguisé en document bloqué : ${fileName}`);
    throw new Error('Sécurité : Ce fichier contient un en-tête d’exécutable binaire (ELF) et a été bloqué.');
  }

  // Vérifications de cohérence d'en-tête pour PDF et archives Office (DOCX/XLSX/ODT/PPTX)
  if (ext === '.pdf') {
    const header = buffer.subarray(0, Math.min(1024, buffer.length)).toString('ascii');
    if (!header.includes('%PDF-')) {
      throw new Error('Document PDF invalide ou corrompu : en-tête %PDF- manquant.');
    }
  } else if (ext === '.docx' || ext === '.xlsx' || ext === '.odt' || ext === '.pptx') {
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new Error(`Archive ${ext.toUpperCase()} invalide ou corrompue (signature ZIP PK attendue).`);
    }
  }
}
