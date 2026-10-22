/**
 * Défilement au clavier — logique pure et testable.
 *
 * Contexte : `body { overflow: hidden }` et la zone principale de contenu
 * (`.content { overflow-y: auto }`) n'est pas focalisable ; Chromium/Electron
 * ne fait donc défiler ni le document ni cette zone avec les flèches lorsqu'elle
 * n'a pas le focus clavier. Le gestionnaire installé dans App.tsx s'appuie sur
 * ces fonctions pour choisir la bonne zone et la bonne amplitude, exactement
 * comme le défilement natif d'une page web.
 */

export type ScrollCommand =
  | { kind: 'by'; delta: number }
  | { kind: 'to'; edge: 'top' | 'bottom' }
  | null;

/** Amplitude d'une « ligne » de défilement (proche du pas natif Chromium). */
export const LINE_PX = 56;
/** Fraction de la hauteur visible utilisée pour PageUp/PageDown/Espace. */
export const PAGE_RATIO = 0.9;

/**
 * Traduit une touche en commande de défilement.
 * Retourne null si la touche ne concerne pas le défilement.
 */
export function scrollCommandForKey(key: string, shiftKey: boolean, viewportHeight: number): ScrollCommand {
  const page = Math.max(1, Math.round(viewportHeight * PAGE_RATIO));
  switch (key) {
    case 'ArrowDown':
      return { kind: 'by', delta: LINE_PX };
    case 'ArrowUp':
      return { kind: 'by', delta: -LINE_PX };
    case 'PageDown':
      return { kind: 'by', delta: page };
    case 'PageUp':
      return { kind: 'by', delta: -page };
    case ' ': // Espace : un écran vers le bas ; Maj+Espace : vers le haut.
      return { kind: 'by', delta: shiftKey ? -page : page };
    case 'Home':
      return { kind: 'to', edge: 'top' };
    case 'End':
      return { kind: 'to', edge: 'bottom' };
    default:
      return null;
  }
}

export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** La zone peut-elle défiler verticalement dans la direction demandée ? */
export function canScrollInDirection(el: ScrollMetrics, command: Exclude<ScrollCommand, null>): boolean {
  const maxTop = el.scrollHeight - el.clientHeight;
  if (maxTop <= 0) return false;
  if (command.kind === 'to') return command.edge === 'top' ? el.scrollTop > 0 : el.scrollTop < maxTop;
  if (command.delta > 0) return el.scrollTop < maxTop - 1;
  return el.scrollTop > 1;
}

/**
 * L'élément recevant la touche est-il un champ de saisie / éditeur ?
 * Dans ce cas, flèches, Espace, Home et End conservent leur comportement natif
 * (déplacement du curseur, sélection, saisie) et ne doivent jamais défiler la page.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as (HTMLElement & { closest?: (s: string) => unknown }) | null;
  if (!el || typeof el !== 'object') return false;
  if ((el as HTMLElement).isContentEditable) return true;
  if (typeof el.closest === 'function') {
    return Boolean(el.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));
  }
  const tag = (el as HTMLElement).tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Espace/Entrée sur un élément activable (bouton, lien, case à cocher…) doivent
 * conserver leur comportement natif d'activation.
 */
export function isActivatableTarget(target: EventTarget | null): boolean {
  const el = target as (HTMLElement & { closest?: (s: string) => unknown }) | null;
  if (!el || typeof el !== 'object' || typeof el.closest !== 'function') return false;
  return Boolean(el.closest('button, a[href], [role="button"], [role="menuitem"], [role="option"], summary, input, select, textarea, label'));
}

/** Remonte les ancêtres pour trouver le premier conteneur à défilement vertical. */
export function findScrollableAncestor(start: HTMLElement | null): HTMLElement | null {
  let el: HTMLElement | null = start;
  while (el && el !== document.body) {
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && el.scrollHeight > el.clientHeight + 1) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

/** Applique la commande à la première zone capable de défiler ; true si consommée. */
export function applyScrollCommand(zones: (HTMLElement | null)[], command: Exclude<ScrollCommand, null>): boolean {
  for (const zone of zones) {
    if (!zone) continue;
    if (!canScrollInDirection(zone, command)) continue;
    if (command.kind === 'to') {
      zone.scrollTo({ top: command.edge === 'top' ? 0 : zone.scrollHeight, behavior: 'auto' });
    } else {
      zone.scrollBy({ top: command.delta, behavior: 'auto' });
    }
    return true;
  }
  return false;
}
