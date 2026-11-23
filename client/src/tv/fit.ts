// Shrink-to-fit for grids of text cards. Sets one shared scale (--fit) on the container,
// the largest that keeps every `.fit-cell` from overflowing, so all cards share a font size.
// Unrevealed cards should stay in the layout (visibility: hidden) so the size is fitted once.
import { useLayoutEffect, useRef, type RefObject } from 'react';

export function useFitText<T extends HTMLElement>(
  deps: unknown[],
  { max = 1.6, min = 0.6, step = 0.04 }: { max?: number; min?: number; step?: number } = {},
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const cells = Array.from(el.querySelectorAll<HTMLElement>('.fit-cell'));
      let s = max;
      el.style.setProperty('--fit', String(s));
      const overflows = () => cells.some((c) => c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1);
      while (s > min && overflows()) {
        s = Math.max(min, s - step);
        el.style.setProperty('--fit', s.toFixed(3));
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    // Webfonts change text metrics once they load.
    document.fonts?.ready.then(fit).catch(() => {});
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}
