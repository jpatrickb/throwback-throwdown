// Small corner pill for the TV: shows "Muted" while muted, flashes the volume after
// a change, and hints "click for sound" until audio is unlocked. Render it once in Tv.tsx.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { audio } from './manager.ts';
import './audio-indicator.css';

const FLASH_MS = 1600;

export function AudioIndicator({ showLockedHint = true }: { showLockedHint?: boolean }) {
  const s = useSyncExternalStore(audio.subscribe, audio.getSnapshot);
  const [, rerender] = useState(0);
  const flashing = Date.now() - s.changedAt < FLASH_MS;

  useEffect(() => {
    if (!flashing) return;
    const t = setTimeout(() => rerender((n) => n + 1), FLASH_MS - (Date.now() - s.changedAt) + 20);
    return () => clearTimeout(t);
  }, [flashing, s.changedAt]);

  let text: string | null = null;
  if (s.muted) text = '🔇 Muted · press M';
  else if (flashing) text = `${s.volume === 0 ? '🔈' : '🔊'} ${Math.round(s.volume * 100)}%`;
  else if (!s.unlocked && showLockedHint) text = '🔈 Click anywhere for sound';

  return (
    <div className={`audio-indicator${text ? ' is-visible' : ''}`} role="status" aria-live="polite">
      {text}
    </div>
  );
}
