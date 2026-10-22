import type JSZip from 'jszip';

/**
 * Garde-fous appliqués à tout document fourni par l'utilisateur avant analyse.
 * Les fichiers proviennent de l'extérieur (modèles reçus) : ils sont traités
 * comme non fiables, même dans une application locale.
 */

export const MAX_ZIP_ENTRIES = 2000;
export const MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES = 300 * 1024 * 1024; // 300 Mo
export const MAX_ZIP_ENTRY_BYTES = 200 * 1024 * 1024; // 200 Mo

/** Rejette les archives dont la taille décompressée annoncée est abusive (bombe de décompression). */
export function assertZipWithinLimits(zip: JSZip, context: string): void {
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.length > MAX_ZIP_ENTRIES) {
    throw new Error(`${context} : archive refusée, trop d'entrées (${entries.length}).`);
  }
  let total = 0;
  for (const entry of entries) {
    const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
    if (size > MAX_ZIP_ENTRY_BYTES) {
      throw new Error(`${context} : entrée trop volumineuse dans l'archive (${entry.name}).`);
    }
    total += size;
    if (total > MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error(`${context} : archive refusée, taille décompressée excessive (bombe de décompression suspectée).`);
    }
  }
}

/**
 * Neutralise une éventuelle pollution de Object.prototype par un parseur tiers
 * (cf. CVE-2023-30533 sur SheetJS <= 0.18.5, sans correctif publié sur npm) :
 * toute propriété ajoutée à Object.prototype pendant l'exécution est supprimée
 * immédiatement après. Le parseur SheetJS s'exécute de façon synchrone :
 * aucune autre tâche ne peut observer l'état intermédiaire.
 */
export function withPrototypePollutionGuard<T>(operation: () => T): T {
  const before = new Set(Object.getOwnPropertyNames(Object.prototype));
  try {
    return operation();
  } finally {
    for (const key of Object.getOwnPropertyNames(Object.prototype)) {
      if (!before.has(key)) {
        try {
          delete (Object.prototype as Record<string, unknown>)[key];
        } catch {
          // Propriété non configurable : on la neutralise en la rendant inoffensive.
          try {
            Object.defineProperty(Object.prototype, key, { value: undefined, configurable: true, writable: true });
          } catch { /* ignoré : le garde-fou a fait son maximum */ }
        }
      }
    }
  }
}
