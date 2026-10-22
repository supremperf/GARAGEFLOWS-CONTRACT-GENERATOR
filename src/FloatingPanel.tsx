import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Portal avoids clipping by scrollable tables; placement stays inside the viewport. */
export default function FloatingPanel({ anchor, className, label, onClose, children, preserveFocus = false, matchWidth = false, id }: {
  id?: string;
  anchor: HTMLElement | null;
  className: string;
  label: string;
  onClose: () => void;
  children: ReactNode;
  preserveFocus?: boolean;
  matchWidth?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [position, setPosition] = useState({ left: 8, top: 8, maxHeight: 0 });
  useLayoutEffect(() => {
    const panel = ref.current;
    if (!anchor || !panel) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(panel.offsetWidth, window.innerWidth - 16);
      const below = window.innerHeight - rect.bottom - 16;
      const above = rect.top - 16;
      const opensBelow = below >= Math.min(panel.scrollHeight, 240) || below >= above;
      const maxHeight = Math.max(0, Math.min(420, opensBelow ? below : above));
      setPosition({
        left: Math.max(8, Math.min(matchWidth ? rect.left : rect.right - width, window.innerWidth - width - 8)),
        top: opensBelow ? rect.bottom + 8 : Math.max(8, rect.top - Math.min(panel.scrollHeight, maxHeight) - 8),
        maxHeight,
      });
    };
    place();
    if (!preserveFocus) panel.focus({ preventScroll: true });
    const outside = (event: Event) => {
      if (event.target instanceof Node && !panel.contains(event.target) && !anchor.contains(event.target)) close.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      const trigger = anchor.matches('button') ? anchor : anchor.querySelector('button, input');
      if (trigger instanceof HTMLElement) trigger.focus({ preventScroll: true });
      close.current();
    };
    const resize = new ResizeObserver(place);
    resize.observe(panel);
    resize.observe(anchor);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      resize.disconnect();
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, preserveFocus, matchWidth]);
  return createPortal(
    <div ref={ref} id={id} className={`${className} floating-panel`} role="region" aria-label={label} tabIndex={-1}
      data-keyboard-scroll-scope style={{ ...position, ...(matchWidth && anchor ? { width: anchor.getBoundingClientRect().width } : {}) }}>
      {children}
    </div>, document.body,
  );
}
