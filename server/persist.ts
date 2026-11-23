// Save/restore the game to data/state.json so a restart resumes mid-game and
// phones reconnect with their existing tokens (same room code, same slots).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { GameState } from '../shared/types.ts';

export interface Saved {
  version: 1;
  savedAt: number;
  state: GameState;
  tokens: [token: string, playerId: string][];
  hostPin?: string; // reused after a restart so the host's phone stays logged in
}

export function loadSaved(file: string): Saved | null {
  if (!existsSync(file)) return null;
  try {
    const data = JSON.parse(readFileSync(file, 'utf8')) as Saved;
    if (data?.version !== 1 || typeof data.state?.roomCode !== 'string' || !Array.isArray(data.tokens)) {
      console.warn(`⚠️  Ignoring ${file}: unrecognized format`);
      return null;
    }
    return data;
  } catch (e) {
    console.warn(`⚠️  Ignoring ${file}: ${(e as Error).message}`);
    return null;
  }
}

/** Atomic write: write a temp file next to the target, then rename over it. */
export function save(file: string, state: GameState, tokens: Map<string, string>, hostPin?: string) {
  const data: Saved = { version: 1, savedAt: Date.now(), state, tokens: [...tokens], hostPin };
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data));
  renameSync(tmp, file);
}
