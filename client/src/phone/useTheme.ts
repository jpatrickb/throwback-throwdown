// Phones follow the TV's theme: view.settings.theme -> <html data-theme>.
// Token blocks live in client/src/theme/tokens.css (tv-owned); berry is :root (no attribute).
import { useEffect, useRef } from 'react';
import { THEMES, type ThemeId } from '../../../shared/types.ts';

const KEY = 'ccp:theme';
const FADE_MS = 450;

function known(id: string | null | undefined): ThemeId | null {
  return THEMES.some((t) => t.id === id) ? (id as ThemeId) : null;
}

function set(id: ThemeId) {
  const root = document.documentElement;
  if (id === 'berry') delete root.dataset.theme;
  else root.dataset.theme = id;
}

function current(): ThemeId {
  return known(document.documentElement.dataset.theme) ?? 'berry';
}

/** Switch theme with a crossfade (View Transitions where supported, else colour transitions). */
function applySmooth(id: ThemeId) {
  if (id === current()) return;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (!reduced && doc.startViewTransition && document.visibilityState === 'visible') {
    doc.startViewTransition(() => set(id));
    return;
  }
  const root = document.documentElement;
  if (!reduced) {
    root.classList.add('ph-theme-fading');
    setTimeout(() => root.classList.remove('ph-theme-fading'), FADE_MS);
  }
  set(id);
}

/** Apply the last-known theme instantly (before the first view) to avoid a flash. */
export function applySavedTheme() {
  // ?theme=<id> (dev/screenshots) wins, so the join/PIN screens can be checked per theme.
  let saved: string | null = new URLSearchParams(window.location.search).get('theme');
  try {
    saved ??= localStorage.getItem(KEY);
  } catch {
    /* ignore */
  }
  const id = known(saved);
  if (id) set(id);
}

export function useTheme(theme: string | null | undefined) {
  const first = useRef(true);
  useEffect(() => {
    const id = known(theme);
    if (!id) return;
    if (first.current) {
      first.current = false;
      // First real view after load: no fade, just snap to it.
      if (id !== current()) {
        set(id);
        try {
          localStorage.setItem(KEY, id);
        } catch {
          /* ignore */
        }
      }
      return;
    }
    applySmooth(id);
  }, [theme]);
}
