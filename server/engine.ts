// Pure game engine: apply(state, event, now) => { state, error? }.
// No I/O, no timers, no randomness. The caller (server/index.ts) supplies ids
// and the current time, arms the deadline timer, persists, and broadcasts.
// The input state is never mutated; a fresh copy is returned on success.
import type { Caption, GameState, HostAction, Photo, Player, Round, ScoredCaption, Settings, Team } from '../shared/types.ts';
import { DEFAULT_SETTINGS, POINTS_PER_VOTE, SWEEP_BONUS, TEAM_PRESETS } from '../shared/types.ts';

export type EngineEvent =
  | { type: 'join'; playerId: string; name: string; avatar?: string | null; color?: string | null }
  | { type: 'presence'; online: string[] } // player ids with a live socket
  | { type: 'setAvatar'; playerId: string; avatar: string | null; color: string | null }
  | { type: 'caption'; playerId: string; text: string; id: string } // id: opaque, used only on first submit
  | { type: 'vote'; playerId: string; captionId: string }
  | { type: 'renameTeam'; playerId: string; name: string } // a member renames their own team
  | { type: 'addPhotos'; photos: Photo[] }
  | { type: 'host'; action: HostAction; seed?: number } // seed: randomness for shuffleTeams (pure engine)
  | { type: 'timeout' };

export interface ApplyResult {
  state: GameState;
  error?: string;
}

export const MAX_NAME_LENGTH = 16;
export const MAX_SUBJECT_LENGTH = 40;
export const MAX_TEAM_NAME_LENGTH = 24;
type NumericSetting = 'captionSeconds' | 'voteSeconds' | 'maxCaptionLength' | 'teamCount';
export const SETTINGS_LIMITS: Record<NumericSetting, [min: number, max: number]> = {
  captionSeconds: [10, 600],
  voteSeconds: [5, 300],
  maxCaptionLength: [20, 200],
  teamCount: [2, Math.min(8, TEAM_PRESETS.length)],
};

export function initialState(roomCode: string): GameState {
  const s: GameState = {
    roomCode,
    phase: 'LOBBY',
    players: {},
    teams: [],
    photos: [],
    rounds: [],
    deadline: null,
    settings: { ...DEFAULT_SETTINGS },
  };
  if (s.settings.teamMode) rebuildTeams(s);
  return s;
}

/** Fills fields added since a state.json was written (e.g. teams), so old saves still load. */
export function normalizeState(raw: GameState): GameState {
  const s = structuredClone(raw);
  s.settings = { ...DEFAULT_SETTINGS, ...s.settings };
  s.teams ??= [];
  for (const p of Object.values(s.players)) p.teamId ??= null;
  for (const r of s.rounds) for (const c of r.captions) c.teamId ??= null;
  if (s.settings.teamMode && s.teams.length === 0) rebuildTeams(s);
  if (!s.settings.teamMode && s.teams.length) {
    s.teams = [];
    for (const p of Object.values(s.players)) p.teamId = null;
  }
  return s;
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
const isTeamMode = (s: GameState) => s.settings.teamMode && s.teams.length > 0;

// ---------- teams ----------

/** THE team assignment rule (one place, so it's easy to change): the team with the fewest
 *  members, ties to the lowest team number. Joining in order 1,2,3... therefore deals players
 *  round-robin (Nth player -> team N mod teamCount) and stays balanced after kicks. */
export function assignTeam(s: GameState): string | null {
  if (!s.settings.teamMode || s.teams.length === 0) return null;
  const counts = new Map(s.teams.map((t) => [t.id, 0]));
  for (const p of Object.values(s.players)) if (p.teamId && counts.has(p.teamId)) counts.set(p.teamId, counts.get(p.teamId)! + 1);
  let best = s.teams[0].id;
  for (const t of s.teams) if (counts.get(t.id)! < counts.get(best)!) best = t.id;
  return best;
}

const teamId = (i: number) => `t${i + 1}`;

/** (Re)creates settings.teamCount teams (keeping names/scores of teams that survive) and
 *  reassigns every player in join order. */
function rebuildTeams(s: GameState) {
  const old = new Map(s.teams.map((t) => [t.id, t]));
  s.teams = Array.from({ length: s.settings.teamCount }, (_, i): Team => {
    const preset = TEAM_PRESETS[i % TEAM_PRESETS.length];
    return old.get(teamId(i)) ?? { id: teamId(i), name: preset.name, color: preset.color, score: 0 };
  });
  const players = Object.values(s.players);
  for (const p of players) p.teamId = null;
  for (const p of players) p.teamId = assignTeam(s);
}

/** Small seeded PRNG so shuffleTeams stays deterministic for a given seed. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random balanced reassignment: shuffle, then deal round-robin. */
function shuffleTeams(s: GameState, seed: number) {
  const rand = mulberry32(seed);
  const players = Object.values(s.players);
  for (let i = players.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [players[i], players[j]] = [players[j], players[i]];
  }
  players.forEach((p, i) => (p.teamId = s.teams[i % s.teams.length].id));
}

const cleanTeamName = (raw: unknown) =>
  typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ').slice(0, MAX_TEAM_NAME_LENGTH).trim() : '';

/** Who "owns" a caption / which side a voter is on: the team in team mode, else the player. */
const captionSide = (c: Caption) => c.teamId ?? c.playerId;
const voterSide = (s: GameState, voterId: string) => (isTeamMode(s) ? s.players[voterId]?.teamId ?? voterId : voterId);
export const myCaption = (s: GameState, r: Round, playerId: string): Caption | undefined => {
  const p = s.players[playerId];
  return isTeamMode(s) && p?.teamId ? r.captions.find((c) => c.teamId === p.teamId) : r.captions.find((c) => c.playerId === playerId && !c.teamId);
};

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
  const ballots = Object.entries(r.votes).filter(([, id]) => visibleIds.has(id));
  return visible
    .map((c) => {
      const votes = ballots.filter(([, id]) => id === c.id).length;
      // Sweep: 2+ votes and every voter who was allowed to pick this caption did.
      const eligible = ballots.filter(([voter]) => voterSide(s, voter) !== captionSide(c)).length;
      const sweep = votes >= 2 && votes === eligible;
      const team = c.teamId ? s.teams.find((t) => t.id === c.teamId) : undefined;
      return {
        id: c.id,
        text: c.text,
        playerId: c.playerId,
        playerName: s.players[c.playerId]?.name ?? '(gone)',
        teamId: c.teamId,
        teamName: team?.name ?? null,
        votes,
        points: votes * POINTS_PER_VOTE + (sweep ? SWEEP_BONUS : 0),
      };
    })
    .sort((a, b) => b.votes - a.votes || (a.teamName ?? a.playerName).localeCompare(b.teamName ?? b.playerName));
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
    if (sc.teamId) {
      const t = s.teams.find((x) => x.id === sc.teamId);
      if (t) t.score += sc.points;
    } else {
      const p = s.players[sc.playerId];
      if (p) p.score += sc.points;
    }
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
    // Team mode: every team with a connected member has a caption. Solo: every connected player.
    if (online.every((p) => myCaption(s, r, p.id))) endCaptioning(s, now);
  } else if (s.phase === 'VOTING') {
    // Only players with something they're allowed to vote for are waited on.
    const visible = visibleCaptions(r);
    const eligible = online.filter((p) => visible.some((c) => captionSide(c) !== voterSide(s, p.id)));
    if (eligible.length && eligible.every((p) => r.votes[p.id])) toResults(s);
  }
}

/** Drop votes that point at captions that are hidden or gone. */
function pruneVotes(s: GameState, r: Round) {
  const ok = new Map(visibleCaptions(r).map((c) => [c.id, c]));
  for (const [voter, cid] of Object.entries(r.votes)) {
    const c = ok.get(cid);
    if (!c || captionSide(c) === voterSide(s, voter)) delete r.votes[voter];
  }
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
        teamId: null,
      };
      s.players[e.playerId].teamId = assignTeam(s);
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
      const mine = myCaption(s, r, e.playerId);
      if (mine) {
        mine.text = text; // team mode: a later submission replaces the team's caption
        mine.playerId = e.playerId; // last editor
      } else {
        if (!e.id || r.captions.some((c) => c.id === e.id)) fail('Bad caption id');
        const team = isTeamMode(s) ? s.players[e.playerId].teamId : null;
        r.captions.push({ id: e.id, playerId: e.playerId, teamId: team, text, hidden: false });
      }
      return maybeAutoAdvance(s, now);
    }
    case 'vote': {
      requirePlayer(s, e.playerId);
      if (s.phase !== 'VOTING') fail('Voting is closed');
      const r = currentRound(s)!;
      const c = r.captions.find((x) => x.id === e.captionId);
      if (!c || c.hidden) fail('That caption is not available');
      if (captionSide(c!) === voterSide(s, e.playerId))
        fail(c!.teamId ? "You can't vote for your own team's caption" : "You can't vote for your own caption");
      r.votes[e.playerId] = c!.id;
      return maybeAutoAdvance(s, now);
    }
    case 'renameTeam': {
      const p = requirePlayer(s, e.playerId);
      const t = s.teams.find((x) => x.id === p.teamId);
      if (!t) fail("You're not on a team");
      const name = cleanTeamName(e.name);
      if (!name) fail('Please enter a team name');
      t!.name = name;
      return;
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
      return hostAction(s, e.action, now, e.seed ?? now);
  }
}

function hostAction(s: GameState, a: HostAction, now: number, seed: number) {
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
      for (const t of s.teams) t.score = 0; // teams (and members) are kept
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
      pruneVotes(s, r);
      return maybeAutoAdvance(s, now);
    }
    case 'kick': {
      requirePlayer(s, a.playerId);
      delete s.players[a.playerId];
      const r = currentRound(s);
      if (r && (s.phase === 'CAPTIONING' || s.phase === 'VOTING')) {
        // Solo captions leave with their author; a team caption stays with the team.
        r.captions = r.captions.filter((c) => c.teamId !== null || c.playerId !== a.playerId);
        delete r.votes[a.playerId];
        pruneVotes(s, r);
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
      // Team mode: points live on teams, so playerId may be a team id or a member (-> their team).
      const d = Math.round(Number(a.delta));
      if (!Number.isFinite(d) || Math.abs(d) > 100_000) fail('Bad score change');
      const team = isTeamMode(s) ? s.teams.find((t) => t.id === a.playerId || t.id === s.players[a.playerId]?.teamId) : undefined;
      if (team) team.score += d;
      else requirePlayer(s, a.playerId).score += d;
      return;
    }
    case 'moveToTeam': {
      const p = requirePlayer(s, a.playerId);
      if (!isTeamMode(s) || !s.teams.some((t) => t.id === a.teamId)) fail('Team not found');
      p.teamId = a.teamId;
      const r = currentRound(s);
      if (r && s.phase === 'VOTING') pruneVotes(s, r); // a vote for your new team no longer counts
      return;
    }
    case 'shuffleTeams': {
      if (!isTeamMode(s)) fail('Team mode is off');
      if (s.phase === 'PHOTO_REVEAL' || s.phase === 'CAPTIONING' || s.phase === 'VOTING') fail('Shuffle between rounds');
      shuffleTeams(s, seed);
      return;
    }
    case 'renameTeam': {
      const t = s.teams.find((x) => x.id === a.teamId);
      if (!t) fail('Team not found');
      const name = cleanTeamName(a.name);
      if (!name) fail('Please enter a team name');
      t!.name = name;
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
      for (const key of Object.keys(SETTINGS_LIMITS) as NumericSetting[]) {
        const v = a.settings?.[key];
        if (v === undefined) continue;
        const n = Math.round(Number(v));
        if (!Number.isFinite(n)) fail(`Bad value for ${key}`);
        const [min, max] = SETTINGS_LIMITS[key];
        next[key] = Math.min(max, Math.max(min, n));
      }
      if (a.settings?.teamMode !== undefined) next.teamMode = Boolean(a.settings.teamMode);
      const teamsChanged = next.teamMode !== s.settings.teamMode || (next.teamMode && next.teamCount !== s.settings.teamCount);
      if (teamsChanged && s.phase !== 'LOBBY') fail('Teams can only be changed in the lobby');
      s.settings = next;
      if (teamsChanged) {
        if (next.teamMode) rebuildTeams(s);
        else {
          s.teams = [];
          for (const p of Object.values(s.players)) p.teamId = null;
        }
      }
      return;
    }
    default:
      fail('Unknown host action');
  }
}
