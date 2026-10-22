import fs from 'node:fs';
import path from 'node:path';

/** Tesseract 5 classifies Electron as a browser for langPath; serve ONLY bundled local language bytes. */
export async function fetchLocalOcrLanguage(request: string, allowedDirectories: string[]) {
  if (!path.isAbsolute(request) || !/^(?:fra|eng)\.traineddata$/.test(path.basename(request))) {
    throw new Error('OCR language must be a local fra/eng.traineddata file; network access is disabled.');
  }
  const file = path.resolve(request);
  const fold = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
  if (!allowedDirectories.some(directory => fold(path.resolve(directory)) === fold(path.dirname(file)))) {
    throw new Error('OCR language is outside the application resource directories.');
  }
  const realFile = fs.realpathSync(file);
  if (fold(path.dirname(realFile)) !== fold(fs.realpathSync(path.dirname(file)))) {
    throw new Error('OCR language symlink escapes its resource directory.');
  }
  const bytes = fs.readFileSync(realFile);
  return { ok: true, status: 200, arrayBuffer: async () => Uint8Array.from(bytes).buffer };
}

export function ocrLanguageDirectories(moduleDirectory: string, cwd: string, resourcesPath?: string): string[] {
  const archiveParent = moduleDirectory.match(/^(.*)[\\/]app\.asar(?:[\\/]|$)/)?.[1];
  if (archiveParent) return [path.join(resourcesPath || archiveParent, 'tessdata')];
  return [
    ...(resourcesPath || archiveParent ? [path.join(resourcesPath || archiveParent!, 'tessdata')] : []),
    path.resolve(moduleDirectory, '../../../resources/tessdata'),
    path.resolve(cwd, 'resources/tessdata'),
  ];
}
