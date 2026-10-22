import {
  applyScrollCommand, findScrollableAncestor, isActivatableTarget, isEditableTarget, scrollCommandForKey,
} from './scroll-utils';

/** Connect the scroll helpers to real keyboard events, independently of React renders. */
export function installKeyboardScrolling(getMain: () => HTMLElement | null): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (isEditableTarget(target)) return;
    if (event.key === ' ' && isActivatableTarget(target)) return;
    // Composite controls (menus, sliders, etc.) own their arrow keys.
    if (target?.closest('[role="menu"], [role="listbox"], [role="tree"], [role="slider"], [role="tablist"]')) return;

    const modal = document.querySelector<HTMLElement>('dialog[open], .modal[aria-modal="true"]');
    const popup = target?.closest<HTMLElement>('[data-keyboard-scroll-scope]');
    const boundary = modal || popup || getMain();
    if (!boundary) return;
    const zones: HTMLElement[] = [];
    // Scroll inner tables/panels first, but never leak behind a modal or popup.
    let inner = target && boundary.contains(target) ? findScrollableAncestor(target) : null;
    while (inner && boundary.contains(inner)) {
      zones.push(inner);
      if (inner === boundary) break;
      inner = findScrollableAncestor(inner.parentElement);
    }
    if (!zones.includes(boundary)) zones.push(boundary);
    const active = zones.find((zone) => zone.scrollHeight > zone.clientHeight + 1) || boundary;
    const command = scrollCommandForKey(event.key, event.shiftKey, active.clientHeight);
    if (!command) return;
    if (applyScrollCommand(zones, command) || modal || popup) event.preventDefault();
  };
  document.addEventListener('keydown', onKeyDown);
  return () => document.removeEventListener('keydown', onKeyDown);
}
