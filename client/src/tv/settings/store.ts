// Tiny persisted preference store for TV-only, this-device settings (reactions, ...).
// The theme is NOT here: it's server state (view.settings.theme) so phones follow it.
// localStorage access is wrapped in try/catch: private windows or blocked storage just
// fall back to defaults for this session.
import { useSyncExternalStore } from 'react';

const KEY = 'tvPrefs';

export interface TvPrefs {
  reactions: boolean;
}
export const DEFAULT_PREFS: TvPrefs = { reactions: true };

function load(): TvPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<TvPrefs>) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_PREFS };
}

let prefs: TvPrefs = load();
const listeners = new Set<() => void>();

export function getPrefs(): TvPrefs {
  return prefs;
}

export function setPref<K extends keyof TvPrefs>(key: K, value: TvPrefs[K]): void {
  prefs = { ...prefs, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useTvPref<K extends keyof TvPrefs>(key: K): [TvPrefs[K], (v: TvPrefs[K]) => void] {
  const value = useSyncExternalStore(subscribe, () => prefs[key]);
  return [value, (v) => setPref(key, v)];
}
