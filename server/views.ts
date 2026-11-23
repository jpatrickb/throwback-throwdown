import type {
  GameState,
  HostView,
  Player,
  PlayerView,
  Round,
  RoundView,
  TvView,
} from '../shared/types.ts';
import { scoreRound } from './engine.ts';

export { scoreRound };

export interface JoinInfo {
  joinUrl: string;
  joinQrDataUrl: string;
  lanJoinUrl: string | null;
}

const currentRound = (s: GameState): Round | null => s.rounds.at(-1) ?? null;

function sortedPlayers(s: GameState): Player[] {
  return Object.values(s.players).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/** Deterministic shuffle so every client sees the same caption order. */
function shuffleStable<T extends { id: string }>(items: T[], seed: string): T[] {
  const hash = (str: string) => {
    let h = 2166136261;
    for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return h >>> 0;
  };
  return [...items].sort((a, b) => hash(seed + a.id) - hash(seed + b.id));
}

function roundView(s: GameState): RoundView | null {
  const r = currentRound(s);
  if (!r || s.phase === 'LOBBY') return null;
  const photo = s.photos.find((p) => p.id === r.photoId);
  if (!photo) return null;
  const showResults = s.phase === 'RESULTS' || s.phase === 'SCOREBOARD' || s.phase === 'FINAL';
  return {
    index: r.index,
    totalPhotosQueued: s.photos.length,
    photo: { ...photo, subject: r.subjectRevealed ? photo.subject : null },
    subjectRevealed: r.subjectRevealed,
    submittedPlayerIds: r.captions.map((c) => c.playerId),
    votedPlayerIds: Object.keys(r.votes),
    captions:
      s.phase === 'VOTING'
        ? shuffleStable(r.captions.filter((c) => !c.hidden), `${s.roomCode}:${r.index}`).map((c) => ({
            id: c.id,
            text: c.text,
          }))
        : null,
    results: showResults ? scoreRound(s, r) : null,
  };
}

function base(s: GameState) {
  return {
    roomCode: s.roomCode,
    phase: s.phase,
    deadline: s.deadline,
    serverNow: Date.now(),
    players: sortedPlayers(s),
    round: roundView(s),
    settings: s.settings,
  };
}

export function tvView(s: GameState, join: JoinInfo): TvView {
  return { ...base(s), role: 'tv', ...join };
}

export function playerView(s: GameState, playerId: string): PlayerView | null {
  const me = s.players[playerId];
  if (!me) return null;
  const r = currentRound(s);
  const mine = r?.captions.find((c) => c.playerId === playerId) ?? null;
  return {
    ...base(s),
    role: 'player',
    me,
    myCaption: mine?.text ?? null,
    myCaptionId: mine?.id ?? null,
    myVoteCaptionId: r?.votes[playerId] ?? null,
  };
}

export function hostView(s: GameState, join: JoinInfo): HostView {
  const r = currentRound(s);
  return {
    ...base(s),
    role: 'host',
    photos: s.photos,
    allCaptions: s.phase === 'LOBBY' ? null : (r?.captions ?? null),
    joinUrl: join.joinUrl,
  };
}
