import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ExportFormat } from '../types';
import { parseDocumentFile } from '../document-parser';

export interface ExportResult {
  filePath: string;
  fileName: string;
  format: ExportFormat;
  fileSize: number;
  sha256: string;
  verifiedReadable: boolean;
  verifiedPageCount: number;
}

export function buildRecommendedContractFileName(params: {
  nom?: string;
  prenom?: string;
  format: ExportFormat;
  dateIso?: string;
}): string {
  const cleanPart = (s?: string, fallback: string = 'CLIENT') => {
    const raw = (s || fallback)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    return raw || fallback;
  };

  const nomClean = cleanPart(params.nom, 'NOM').toUpperCase();
  const prenomClean = cleanPart(params.prenom, 'PRENOM');
  const datePart =
    params.dateIso && /^\d{4}-\d{2}-\d{2}$/.test(params.dateIso)
      ? params.dateIso
      : new Date().toISOString().slice(0, 10);

  return `Contrat_GarageFlows_${nomClean}_${prenomClean}_${datePart}.${params.format}`;
}

export async function exportGeneratedDocumentToDisk(params: {
  buffer: Buffer;
  destinationDir: string;
  fileName: string;
  format: ExportFormat;
  overwriteConfirmed?: boolean;
}): Promise<ExportResult> {
  const {
    buffer,
    destinationDir,
    fileName,
    format,
    overwriteConfirmed = false,
  } = params;

  if (!buffer || buffer.length === 0) {
    throw new Error('Erreur d’exportation : le tampon du document généré est vide.');
  }

  // Nettoyer le nom de fichier contre toute traversée de répertoire
  const safeFileName = path.basename(fileName).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  const finalFileName = safeFileName.toLowerCase().endsWith(`.${format}`)
    ? safeFileName
    : `${safeFileName}.${format}`;

  if (!fs.existsSync(destinationDir)) {
    fs.mkdirSync(destinationDir, { recursive: true });
  }

  const targetPath = path.resolve(destinationDir, finalFileName);
  const resolvedDir = path.resolve(destinationDir);
  if (!targetPath.startsWith(resolvedDir)) {
    throw new Error('Chemin de destination invalide ou tentative de traversée de dossier bloquée.');
  }

  // Protection stricte contre l'écrasement silencieux (Section 14 & Règle 13)
  if (fs.existsSync(targetPath) && !overwriteConfirmed) {
    const err = new Error(`FILE_ALREADY_EXISTS: Un fichier nommé « ${finalFileName} » existe déjà dans ce dossier.`);
    (err as any).code = 'FILE_ALREADY_EXISTS';
    (err as any).existingPath = targetPath;
    throw err;
  }

  fs.writeFileSync(targetPath, buffer);

  // Vérification post-export obligatoire (Section 14 & Règle 18/23)
  if (!fs.existsSync(targetPath)) {
    throw new Error('Échec de vérification post-export : le fichier généré est introuvable sur le disque.');
  }

  const stat = fs.statSync(targetPath);
  if (stat.size === 0) {
    fs.unlinkSync(targetPath);
    throw new Error('Échec de vérification post-export : le fichier généré sur le disque est vide (0 octet).');
  }

  const writtenBuf = fs.readFileSync(targetPath);
  const sha256 = crypto.createHash('sha256').update(writtenBuf).digest('hex');

  // Relire et analyser réellement le fichier exporté pour prouver son intégrité
  const parsedExport = await parseDocumentFile(targetPath);

  return {
    filePath: targetPath,
    fileName: finalFileName,
    format,
    fileSize: stat.size,
    sha256,
    verifiedReadable: parsedExport.fullText.length > 0 || parsedExport.tables.length > 0,
    verifiedPageCount: parsedExport.pageCount,
  };
}
