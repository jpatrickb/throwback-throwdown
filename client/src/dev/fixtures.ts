// Sample views for every phase, so UI work never waits on the engine.
// Open any screen with ?mock=<PHASE>, e.g. /tv?mock=VOTING, /play?mock=CAPTIONING,
// /host?mock=RESULTS. Add ?mockme=<playerId> on /play to pick who "you" are.
import type {
  HostView,
  Phase,
  Player,
  PlayerView,
  RoundView,
  Settings,
  TvView,
  View,
} from '../../../shared/types.ts';
import { DEFAULT_SETTINGS } from '../../../shared/types.ts';

export const PHASES: Phase[] = ['LOBBY', 'PHOTO_REVEAL', 'CAPTIONING', 'VOTING', 'RESULTS', 'SCOREBOARD', 'FINAL'];

const players: Player[] = [
  { id: 'p1', name: 'Jake', avatar: null, color: null, score: 700, connected: true },
  { id: 'p2', name: 'Aunt Linda', avatar: null, color: null, score: 500, connected: true },
  { id: 'p3', name: 'Maddie', avatar: null, color: null, score: 500, connected: true },
  { id: 'p4', name: 'Grandpa Joe', avatar: null, color: null, score: 300, connected: false },
  { id: 'p5', name: 'Sam', avatar: null, color: null, score: 200, connected: true },
  { id: 'p6', name: 'Priya', avatar: null, color: null, score: 100, connected: true },
  { id: 'p7', name: 'Tyler', avatar: null, color: null, score: 0, connected: true },
  { id: 'p8', name: 'Cousin Bea', avatar: null, color: null, score: 0, connected: true },
];

const photo = { id: 'ph1', url: '/dev/sample-photo.svg', subject: 'Cousin Jake, age 4', used: true };

const captions = [
  { id: 'c1', playerId: 'p2', text: 'When they say the buffet closes in 5 minutes' },
  { id: 'c2', playerId: 'p3', text: 'Future HOA president' },
  { id: 'c3', playerId: 'p5', text: 'This is my villain origin story' },
  { id: 'c4', playerId: 'p6', text: 'Me after one (1) grape juice box' },
  { id: 'c5', playerId: 'p7', text: 'He has seen things. Terrible, crayon things.' },
  { id: 'c6', playerId: 'p8', text: 'Already plotting the Thanksgiving seating chart' },
];

function round(phase: Phase): RoundView | null {
  if (phase === 'LOBBY') return null;
  const after = phase === 'RESULTS' || phase === 'SCOREBOARD' || phase === 'FINAL';
  const votes: Record<string, number> = { c1: 1, c2: 3, c3: 0, c4: 2, c5: 1, c6: 0 };
  return {
    index: 2,
    totalPhotosQueued: 10,
    photo: { ...photo, subject: phase === 'PHOTO_REVEAL' || phase === 'CAPTIONING' || phase === 'VOTING' ? null : photo.subject },
    subjectRevealed: after,
    submittedPlayerIds: phase === 'CAPTIONING' ? ['p2', 'p3', 'p6'] : captions.map((c) => c.playerId),
    votedPlayerIds: phase === 'VOTING' ? ['p1', 'p2', 'p5'] : after ? ['p1', 'p2', 'p3', 'p5', 'p6', 'p7', 'p8'] : [],
    captions: phase === 'VOTING' ? captions.map(({ id, text }) => ({ id, text })) : null,
    results: after
      ? captions
          .map((c) => ({
            id: c.id,
            text: c.text,
            playerId: c.playerId,
            playerName: players.find((p) => p.id === c.playerId)!.name,
            votes: votes[c.id],
            points: votes[c.id] * 100,
          }))
          .sort((a, b) => b.votes - a.votes)
      : null,
  };
}

function base(phase: Phase) {
  const timed = phase === 'CAPTIONING' || phase === 'VOTING';
  const settings: Settings = { ...DEFAULT_SETTINGS };
  return {
    roomCode: 'GRFW',
    phase,
    deadline: timed ? Date.now() + 1000 * (phase === 'CAPTIONING' ? 48 : 21) : null,
    serverNow: Date.now(),
    players: phase === 'LOBBY' ? players.map((p) => ({ ...p, score: 0 })) : players,
    round: round(phase),
    settings,
  };
}

const JOIN_URL = 'https://party.jpatrickbeal.com/play?room=GRFW';

export function mockView(role: View['role'], phase: Phase, meId = 'p3'): View {
  const b = base(phase);
  if (role === 'tv') {
    const v: TvView = {
      ...b,
      role: 'tv',
      joinUrl: JOIN_URL,
      // Tiny placeholder; the real server sends a scannable QR.
      joinQrDataUrl:
        'data:image/svg+xml;utf8,' +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="white"/><rect x="1" y="1" width="3" height="3"/><rect x="6" y="1" width="3" height="3"/><rect x="1" y="6" width="3" height="3"/><rect x="5" y="5" width="1" height="1"/><rect x="7" y="7" width="2" height="2"/></svg>',
        ),
      lanJoinUrl: 'http://192.168.1.20:3000/play?room=GRFW',
    };
    return v;
  }
  if (role === 'host') {
    const v: HostView = {
      ...b,
      role: 'host',
      joinUrl: JOIN_URL,
      photos: [
        photo,
        { id: 'ph2', url: '/dev/sample-photo.svg', subject: 'Maddie, age 6', used: false },
        { id: 'ph3', url: '/dev/sample-photo.svg', subject: null, used: false },
      ],
      allCaptions: phase === 'LOBBY' ? null : captions.map((c) => ({ ...c, hidden: c.id === 'c5' && phase === 'VOTING' })),
    };
    return v;
  }
  const me = b.players.find((p) => p.id === meId) ?? b.players[0];
  const mine = captions.find((c) => c.playerId === me.id) ?? null;
  const v: PlayerView = {
    ...b,
    role: 'player',
    me,
    myCaption: phase === 'CAPTIONING' || !mine ? null : mine.text,
    myCaptionId: phase === 'CAPTIONING' || !mine ? null : mine.id,
    myVoteCaptionId: phase === 'VOTING' ? null : 'c2',
  };
  return v;
}

/** Reads ?mock= and ?mockme= from the URL. Returns null when not mocking. */
export function mockFromUrl(role: View['role']): View | null {
  const q = new URLSearchParams(window.location.search);
  const phase = q.get('mock')?.toUpperCase() as Phase | undefined;
  if (!phase || !PHASES.includes(phase)) return null;
  return mockView(role, phase, q.get('mockme') ?? undefined);
}
