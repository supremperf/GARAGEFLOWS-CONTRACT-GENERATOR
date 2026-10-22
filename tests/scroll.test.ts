import { describe, expect, it } from 'vitest';
import {
  applyScrollCommand, canScrollInDirection, isActivatableTarget, isEditableTarget,
  LINE_PX, scrollCommandForKey,
} from '../src/scroll-utils';

/** Faux élément défilant minimal (métriques + enregistrement des appels). */
class FakeScroller {
  scrollTop: number;
  scrollHeight = 2000;
  clientHeight = 500;
  byCalls: number[] = [];
  toCalls: number[] = [];
  constructor(scrollTop = 0) { this.scrollTop = scrollTop; }
  scrollBy(opts: { top: number }) { this.byCalls.push(opts.top); this.scrollTop += opts.top; }
  scrollTo(opts: { top: number }) { this.toCalls.push(opts.top); this.scrollTop = opts.top; }
}

function fakeTarget(matchingSelector: string | null, tagName = 'DIV') {
  return {
    tagName,
    isContentEditable: false,
    closest: (selector: string) => (matchingSelector && selector.split(',').some((s) => matchingSelector.includes(s.trim().split('[')[0].split(' ')[0]) || selector.includes(matchingSelector)) ? {} : null),
  };
}

describe('défilement clavier — correspondance des touches (§2 mission)', () => {
  it('Flèche bas/haut : défilement progressif', () => {
    expect(scrollCommandForKey('ArrowDown', false, 600)).toEqual({ kind: 'by', delta: LINE_PX });
    expect(scrollCommandForKey('ArrowUp', false, 600)).toEqual({ kind: 'by', delta: -LINE_PX });
  });

  it('Page Down / Page Up : un écran (90 % de la zone visible)', () => {
    expect(scrollCommandForKey('PageDown', false, 600)).toEqual({ kind: 'by', delta: 540 });
    expect(scrollCommandForKey('PageUp', false, 600)).toEqual({ kind: 'by', delta: -540 });
  });

  it('Espace : un écran vers le bas ; Maj+Espace : vers le haut', () => {
    expect(scrollCommandForKey(' ', false, 600)).toEqual({ kind: 'by', delta: 540 });
    expect(scrollCommandForKey(' ', true, 600)).toEqual({ kind: 'by', delta: -540 });
  });

  it('Home / End : extrémités de la zone active', () => {
    expect(scrollCommandForKey('Home', false, 600)).toEqual({ kind: 'to', edge: 'top' });
    expect(scrollCommandForKey('End', false, 600)).toEqual({ kind: 'to', edge: 'bottom' });
  });

  it('Tab, Entrée et les autres touches ne sont pas interceptées', () => {
    expect(scrollCommandForKey('Tab', false, 600)).toBeNull();
    expect(scrollCommandForKey('Enter', false, 600)).toBeNull();
    expect(scrollCommandForKey('a', false, 600)).toBeNull();
    expect(scrollCommandForKey('Escape', false, 600)).toBeNull();
  });
});

describe('défilement clavier — capacité et routage des zones', () => {
  const down = { kind: 'by', delta: 100 } as const;
  const up = { kind: 'by', delta: -100 } as const;

  it('refuse de défiler au-delà des extrémités', () => {
    expect(canScrollInDirection(new FakeScroller(0), up)).toBe(false);
    expect(canScrollInDirection(new FakeScroller(1500), down)).toBe(false); // 2000-500
    expect(canScrollInDirection(new FakeScroller(400), down)).toBe(true);
    expect(canScrollInDirection(new FakeScroller(400), up)).toBe(true);
  });

  it('zone non défilante (contenu plus petit que la vue) ignorée', () => {
    const flat = new FakeScroller(0); flat.scrollHeight = 300; // < clientHeight 500
    expect(canScrollInDirection(flat, down)).toBe(false);
  });

  it('route vers la première zone capable, sinon la zone principale', () => {
    const stuck = new FakeScroller(1500); // déjà en bas
    const main = new FakeScroller(200);
    const used = applyScrollCommand([stuck as never, main as never], down);
    expect(used).toBe(true);
    expect(stuck.byCalls).toEqual([]);
    expect(main.byCalls).toEqual([100]);
    expect(main.scrollTop).toBe(300);
  });

  it('aucune zone capable : la touche n’est pas consommée (pas de blocage)', () => {
    const stuck = new FakeScroller(1500);
    expect(applyScrollCommand([stuck as never], down)).toBe(false);
    expect(stuck.byCalls).toEqual([]);
  });

  it('Home/End positionnent exactement aux extrémités', () => {
    const zone = new FakeScroller(700);
    expect(applyScrollCommand([zone as never], { kind: 'to', edge: 'bottom' })).toBe(true);
    expect(zone.toCalls).toEqual([2000]);
    expect(applyScrollCommand([zone as never], { kind: 'to', edge: 'top' })).toBe(true);
    expect(zone.toCalls).toEqual([2000, 0]);
  });
});

describe('défilement clavier — protection de la saisie et de l’activation', () => {
  it('champs de saisie et éditeurs : jamais interceptés', () => {
    expect(isEditableTarget(fakeTarget('input', 'INPUT'))).toBe(true);
    expect(isEditableTarget(fakeTarget('textarea', 'TEXTAREA'))).toBe(true);
    expect(isEditableTarget(fakeTarget('select', 'SELECT'))).toBe(true);
    expect(isEditableTarget(fakeTarget(null, 'P'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });

  it('boutons et liens restent activables à Espace/Entrée nativement', () => {
    expect(isActivatableTarget(fakeTarget('button', 'BUTTON'))).toBe(true);
    expect(isActivatableTarget(fakeTarget('a', 'A'))).toBe(true);
    expect(isActivatableTarget(fakeTarget(null, 'SECTION'))).toBe(false);
    expect(isActivatableTarget(null)).toBe(false);
  });
});
