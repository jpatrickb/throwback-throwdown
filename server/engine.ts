// Pure game engine: apply(state, event, now) => { state, error? }.
// No I/O, no timers, no randomness. The caller (server/index.ts) supplies ids
// and the current time, arms the deadline timer, persists, and broadcasts.
// The input state is never mutated; a fresh copy is returned on success.
import type { GameState, HostAction, Photo, Player, Round, ScoredCaption, Settings } from '../shared/types.ts';
import { DEFAULT_SETTINGS, POINTS_PER_VOTE, SWEEP_BONUS } from '../shared/types.ts';

export type EngineEvent =
  | { type: 'join'; playerId: string; name: string; avatar?: string | null; color?: string | null }
  | { type: 'presence'; online: string[] } // player ids with a live socket
  | { type: 'setAvatar'; playerId: string; avatar: string | null; color: string | null }
  | { type: 'caption'; playerId: string; text: string; id: string } // id: opaque, used only on first submit
  | { type: 'vote'; playerId: string; captionId: string }
  | { type: 'addPhotos'; photos: Photo[] }
  | { type: 'host'; action: HostAction }
  | { type: 'timeout' };

export interface ApplyResult {
  state: GameState;
  error?: string;
}

export const MAX_NAME_LENGTH = 16;
export const MAX_SUBJECT_LENGTH = 40;
export const SETTINGS_LIMITS: Record<keyof Settings, [min: number, max: number]> = {
  captionSeconds: [10, 600],
  voteSeconds: [5, 300],
  maxCaptionLength: [20, 200],
};

export function initialState(roomCode: string): GameState {
  return {
    roomCode,
    phase: 'LOBBY',
    players: {},
    photos: [],
    rounds: [],
    deadline: null,
    settings: { ...DEFAULT_SETTINGS },
  };
}

class EngineError extends Error {}
const fail = (msg: string): never => {
  throw new EngineError(msg);
};

export function apply(state: GameState, event: EngineEvent, now: number): ApplyResult {
  const s = structuredClone(state);
  try {
    reduce(s, event, now);
    return { state: s };
  } catch (e) {
    if (e instanceof EngineError) return { state, error: e.message };
    throw e;
  }
}

// ---------- helpers ----------

export const currentRound = (s: GameState): Round | null => s.rounds.at(-1) ?? null;
const visibleCaptions = (r: Round) => r.captions.filter((c) => !c.hidden);
const connectedPlayers = (s: GameState) => Object.values(s.players).filter((p) => p.connected);

export function cleanName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH).trim();
}

/** Appends " 2", " 3"... if the name is taken (case-insensitive). */
function uniqueName(s: GameState, name: string, exceptId?: string): string {
  const taken = new Set(
    Object.values(s.players)
      .filter((p) => p.id !== exceptId)
      .map((p) => p.name.toLowerCase()),
  );
  if (!taken.has(name.toLowerCase())) return name;
  let n = 2;
  while (taken.has(`${name} ${n}`.toLowerCase())) n++;
  return `${name} ${n}`;
}

const cleanShort = (v: unknown, max = 32): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

export function scoreRound(s: GameState, r: Round): ScoredCaption[] {
  const visible = visibleCaptions(r);
  const visibleIds = new Set(visible.map((c) => c.id));
  const ballots = Object.values(r.votes).filter((id) => visibleIds.has(id));
  const voters = ballots.length;
  return visible
    .map((c) => {
      const votes = ballots.filter((id) => id === c.id).length;
      const sweep = voters >= 2 && votes === voters;
      return {
        id: c.id,
        text: c.text,
        playerId: c.playerId,
        playerName: s.players[c.playerId]?.name ?? '(gone)',
        votes,
        points: votes * POINTS_PER_VOTE + (sweep ? SWEEP_BONUS : 0),
      };
    })
    .sort((a, b) => b.votes - a.votes || a.playerName.localeCompare(b.playerName));
}

// ---------- transitions ----------

function startRound(s: GameState) {
  const photo = s.photos.find((p) => !p.used);
  if (!photo) fail(s.photos.length ? 'No photos left. End the game instead.' : 'Add a photo first');
  photo!.used = true;
  s.rounds.push({ index: s.rounds.length, photoId: photo!.id, captions: [], votes: {}, subjectRevealed: false });
  s.phase = 'PHOTO_REVEAL';
  s.deadline = null;
}

function toCaptioning(s: GameState, now: number) {
  s.phase = 'CAPTIONING';
  s.deadline = now + s.settings.captionSeconds * 1000;
}

/** Leaves CAPTIONING: to VOTING, or straight to RESULTS if fewer than 2 captions. */
function endCaptioning(s: GameState, now: number) {
  const r = currentRound(s)!;
  if (visibleCaptions(r).length < 2) return toResults(s);
  s.phase = 'VOTING';
  s.deadline = now + s.settings.voteSeconds * 1000;
}

/** Enters RESULTS and awards points. The only place scores are applied, and it
 *  runs once per round because RESULTS can only be entered from CAPTIONING/VOTING. */
function toResults(s: GameState) {
  const r = currentRound(s)!;
  for (const sc of scoreRound(s, r)) {
    const p = s.players[sc.playerId];
    if (p) p.score += sc.points;
  }
  s.phase = 'RESULTS';
  s.deadline = null;
}

function toFinal(s: GameState) {
  s.phase = 'FINAL';
  s.deadline = null;
}

function next(s: GameState, now: number) {
  switch (s.phase) {
    case 'LOBBY':
      return startRound(s);
    case 'PHOTO_REVEAL':
      return toCaptioning(s, now);
    case 'CAPTIONING':
      return endCaptioning(s, now);
    case 'VOTING':
      return toResults(s);
    case 'RESULTS':
      s.phase = 'SCOREBOARD';
      return;
    case 'SCOREBOARD':
      return s.photos.some((p) => !p.used) ? startRound(s) : toFinal(s);
    case 'FINAL':
      return fail('The game is over. Reset to play again.');
  }
}

/** CAPTIONING/VOTING end early once every connected player is done. */
function maybeAutoAdvance(s: GameState, now: number) {
  const r = currentRound(s);
  if (!r) return;
  const online = connectedPlayers(s);
  if (online.length === 0) return;
  if (s.phase === 'CAPTIONING') {
    const submitted = new Set(r.captions.map((c) => c.playerId));
    if (online.every((p) => submitted.has(p.id))) endCaptioning(s, now);
  } else if (s.phase === 'VOTING') {
    // Everyone can vote: with 2+ visible captions there's always one that isn't yours.
    if (online.every((p) => r.votes[p.id])) toResults(s);
  }
}

/** Drop votes that point at captions that are hidden or gone. */
function pruneVotes(r: Round) {
  const ok = new Set(visibleCaptions(r).map((c) => c.id));
  for (const [voter, cid] of Object.entries(r.votes)) if (!ok.has(cid)) delete r.votes[voter];
}

const requirePlayer = (s: GameState, id: unknown): Player => {
  const p = typeof id === 'string' ? s.players[id] : undefined;
  if (!p) fail('Player not found');
  return p!;
};

// ---------- reducer ----------

function reduce(s: GameState, e: EngineEvent, now: number) {
  switch (e.type) {
    case 'join': {
      if (s.players[e.playerId]) fail('Player already exists');
      const name = cleanName(e.name ?? '');
      if (!name) fail('Please enter a name');
      s.players[e.playerId] = {
        id: e.playerId,
        name: uniqueName(s, name),
        avatar: cleanShort(e.avatar),
        color: cleanShort(e.color),
        score: 0,
        connected: true,
      };
      return; // a late joiner never ends a phase on their own
    }
    case 'presence': {
      const online = new Set(e.online);
      for (const p of Object.values(s.players)) p.connected = online.has(p.id);
      return;
    }
    case 'setAvatar': {
      const p = requirePlayer(s, e.playerId);
      p.avatar = cleanShort(e.avatar);
      p.color = cleanShort(e.color);
      return;
    }
    case 'caption': {
      requirePlayer(s, e.playerId);
      if (s.phase !== 'CAPTIONING') fail('Captions are closed');
      const r = currentRound(s)!;
      const text = String(e.text ?? '').trim().replace(/\s+/g, ' ').slice(0, s.settings.maxCaptionLength).trim();
      if (!text) fail('Write something first');
      const mine = r.captions.find((c) => c.playerId === e.playerId);
      if (mine) mine.text = text;
      else {
        if (!e.id || r.captions.some((c) => c.id === e.id)) fail('Bad caption id');
        r.captions.push({ id: e.id, playerId: e.playerId, text, hidden: false });
      }
      return maybeAutoAdvance(s, now);
    }
    case 'vote': {
      requirePlayer(s, e.playerId);
      if (s.phase !== 'VOTING') fail('Voting is closed');
      const r = currentRound(s)!;
      const c = r.captions.find((x) => x.id === e.captionId);
      if (!c || c.hidden) fail('That caption is not available');
      if (c!.playerId === e.playerId) fail("You can't vote for your own caption");
      r.votes[e.playerId] = c!.id;
      return maybeAutoAdvance(s, now);
    }
    case 'addPhotos': {
      const have = new Set(s.photos.map((p) => p.id));
      for (const p of e.photos) {
        if (have.has(p.id)) continue;
        have.add(p.id);
        s.photos.push({ ...p, used: false });
      }
      return;
    }
    case 'timeout': {
      if (s.deadline === null || now < s.deadline) return; // stale timer: no-op
      if (s.phase === 'CAPTIONING') return endCaptioning(s, now);
      if (s.phase === 'VOTING') return toResults(s);
      s.deadline = null;
      return;
    }
    case 'host':
      return hostAction(s, e.action, now);
  }
}

function hostAction(s: GameState, a: HostAction, now: number) {
  switch (a.type) {
    case 'start':
      if (s.phase !== 'LOBBY') fail('The game already started');
      return startRound(s);
    case 'next':
      return next(s, now);
    case 'nextRound':
      if (s.phase !== 'RESULTS' && s.phase !== 'SCOREBOARD') fail('Finish this round first');
      return startRound(s);
    case 'end': {
      if (s.phase === 'LOBBY') fail("The game hasn't started");
      if (s.phase === 'FINAL') return;
      if (s.phase === 'VOTING') toResults(s); // keep the votes that were cast
      else if (s.phase === 'PHOTO_REVEAL' || s.phase === 'CAPTIONING') {
        // Abandon the unfinished round so its photo can be used next game.
        const r = s.rounds.pop()!;
        const photo = s.photos.find((p) => p.id === r.photoId);
        if (photo) photo.used = false;
      }
      return toFinal(s);
    }
    case 'reset': {
      s.phase = 'LOBBY';
      s.rounds = [];
      s.deadline = null;
      for (const p of Object.values(s.players)) p.score = 0;
      for (const p of s.photos) p.used = false;
      return;
    }
    case 'addTime': {
      if (s.deadline === null) fail('No timer is running');
      const secs = Math.round(Number(a.seconds));
      if (!Number.isFinite(secs) || secs < 1 || secs > 600) fail('Bad number of seconds');
      s.deadline = Math.max(s.deadline!, now) + secs * 1000;
      return;
    }
    case 'revealSubject': {
      const r = currentRound(s);
      if (!r || s.phase === 'LOBBY') fail('No round in progress');
      r!.subjectRevealed = true;
      return;
    }
    case 'hideCaption': {
      if (s.phase !== 'CAPTIONING' && s.phase !== 'VOTING') fail('Captions can only be hidden before results');
      const r = currentRound(s)!;
      const c = r.captions.find((x) => x.id === a.captionId);
      if (!c) fail('Caption not found');
      c!.hidden = Boolean(a.hidden);
      pruneVotes(r);
      return maybeAutoAdvance(s, now);
    }
    case 'kick': {
      requirePlayer(s, a.playerId);
      delete s.players[a.playerId];
      const r = currentRound(s);
      if (r && (s.phase === 'CAPTIONING' || s.phase === 'VOTING')) {
        r.captions = r.captions.filter((c) => c.playerId !== a.playerId);
        delete r.votes[a.playerId];
        pruneVotes(r);
        maybeAutoAdvance(s, now);
      }
      return;
    }
    case 'rename': {
      const p = requirePlayer(s, a.playerId);
      const name = cleanName(String(a.name ?? ''));
      if (!name) fail('Please enter a name');
      p.name = uniqueName(s, name, p.id);
      return;
    }
    case 'adjustScore': {
      const p = requirePlayer(s, a.playerId);
      const d = Math.round(Number(a.delta));
      if (!Number.isFinite(d) || Math.abs(d) > 100_000) fail('Bad score change');
      p.score += d;
      return;
    }
    case 'reorderPhotos': {
      if (!Array.isArray(a.photoIds)) fail('Bad photo order');
      const byId = new Map(s.photos.map((p) => [p.id, p]));
      const ordered: Photo[] = [];
      for (const id of a.photoIds) {
        const p = byId.get(id);
        if (p) {
          ordered.push(p);
          byId.delete(id);
        }
      }
      s.photos = [...ordered, ...byId.values()]; // anything not listed keeps its relative order at the end
      return;
    }
    case 'setSubject': {
      const p = s.photos.find((x) => x.id === a.photoId);
      if (!p) fail('Photo not found');
      p!.subject = typeof a.subject === 'string' && a.subject.trim() ? a.subject.trim().slice(0, MAX_SUBJECT_LENGTH) : null;
      return;
    }
    case 'removePhoto': {
      if (!s.photos.some((x) => x.id === a.photoId)) fail('Photo not found');
      if (s.rounds.some((r) => r.photoId === a.photoId)) fail('That photo was already played. Reset first.');
      s.photos = s.photos.filter((x) => x.id !== a.photoId);
      return;
    }
    case 'updateSettings': {
      const next = { ...s.settings };
      for (const key of Object.keys(SETTINGS_LIMITS) as (keyof Settings)[]) {
        const v = a.settings?.[key];
        if (v === undefined) continue;
        const n = Math.round(Number(v));
        if (!Number.isFinite(n)) fail(`Bad value for ${key}`);
        const [min, max] = SETTINGS_LIMITS[key];
        next[key] = Math.min(max, Math.max(min, n));
      }
      s.settings = next;
      return;
    }
    default:
      fail('Unknown host action');
  }
}
