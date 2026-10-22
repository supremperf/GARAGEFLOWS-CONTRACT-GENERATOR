import fs from 'fs';
import path from 'path';
import { digest, validateModel } from './context';
import type { LegalModel } from './types';

const manifestName = 'garageflows-professional-v1.0-2026-10-22.json';
interface Manifest extends Pick<LegalModel, 'title' | 'version' | 'date' | 'bindings' | 'requiredFields' | 'reviewNotes'> { fileName: string; sha256: string }
let cached: LegalModel | undefined;
export function bundledProfessionalModel(): LegalModel {
  if (cached) return JSON.parse(JSON.stringify(cached));
  const resourceRoot = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const folders = [resourceRoot && path.join(resourceRoot, 'contracts'), path.resolve('resources/contracts'), path.join(__dirname, '../../../resources/contracts')].filter(Boolean) as string[];
  const folder = folders.find(dir => fs.existsSync(path.join(dir, manifestName)));
  if (!folder) throw new Error('Source juridique intégrale embarquée introuvable. Réinstaller les ressources officielles.');
  const manifest: Manifest = JSON.parse(fs.readFileSync(path.join(folder, manifestName), 'utf8'));
  if (path.basename(manifest.fileName) !== manifest.fileName) throw new Error('Chemin du manifeste juridique invalide.');
  const bytes = fs.readFileSync(path.join(folder, manifest.fileName)), text = bytes.toString('utf8');
  if (digest(bytes) !== manifest.sha256) throw new Error('Intégrité de la source juridique embarquée incorrecte.');
  const errors = validateModel(text, manifest.bindings);
  if (errors.length) throw new Error(`Modèle embarqué incomplet : ${errors.join(' ')}`);
  cached = { id: digest(JSON.stringify({ title: manifest.title, text, version: manifest.version, date: manifest.date, bindings: manifest.bindings })),
    title: manifest.title, version: manifest.version, date: manifest.date, text, sha256: manifest.sha256,
    bindings: manifest.bindings, requiredFields: manifest.requiredFields, reviewNotes: manifest.reviewNotes,
    createdAt: new Date().toISOString(), bundled: true };
  return JSON.parse(JSON.stringify(cached));
}
