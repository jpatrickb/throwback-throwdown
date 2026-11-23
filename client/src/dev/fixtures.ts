// Sample views for every phase, so UI work never waits on the engine.
// Open any screen with ?mock=<PHASE>, e.g. /tv?mock=VOTING, /play?mock=CAPTIONING,
// /host?mock=RESULTS. Extra params:
//   ?mockme=<playerId>  which player "you" are on /play (default p3)
//   ?solo=1             individual mode (no teams); default is team mode, 5 teams
//   ?theme=<id>         berry | cork | arcade | picnic (settings.theme)
import type {
  Caption,
  HostView,
  Phase,
  Player,
  PlayerView,
  RoundView,
  ScoredCaption,
  Settings,
  TeamView,
  TvView,
  View,
} from '../../../shared/types.ts';
import { DEFAULT_SETTINGS, TEAM_PRESETS } from '../../../shared/types.ts';

export const PHASES: Phase[] = ['LOBBY', 'PHOTO_REVEAL', 'CAPTIONING', 'VOTING', 'RESULTS', 'SCOREBOARD', 'FINAL'];

const NAMES = [
  'Jake', 'Aunt Linda', 'Maddie', 'Grandpa Joe', 'Sam', 'Priya', 'Tyler', 'Cousin Bea', 'Marcus', 'Uncle Ray',
  'Sofia', 'Ben', 'Nana', 'Olivia', 'Dev', 'Hannah', 'Luis', 'Grace', 'Theo', 'Aunt Carol', 'Mia', 'Eli', 'Rosa', 'Max', 'June',
];
const AVATARS = ['🦖', '🦄', '🐸', '🤠', '👽', '🐙', '🦊', '🐼'];

const photo = { id: 'ph1', url: '/dev/sample-photo.svg', subject: null, used: true };

const TEAM_CAPTIONS = [
  'When they say the buffet closes in 5 minutes',
  'Future HOA president',
  'This is my villain origin story',
  'Me after one (1) grape juice box',
  'He has seen things. Terrible, crayon things.',
];
const SOLO_CAPTIONS = [...TEAM_CAPTIONS, 'Already plotting the Thanksgiving seating chart'];

function build(solo: boolean) {
  const teamCount = solo ? 0 : 5;
  const nPlayers = solo ? 8 : 25;
  const teams = TEAM_PRESETS.slice(0, teamCount).map((t, i) => ({ id: `t${i + 1}`, ...t, score: [900, 700, 700, 400, 200][i] }));
  const players: Player[] = NAMES.slice(0, nPlayers).map((name, i) => ({
    id: `p${i + 1}`,
    name,
    avatar: AVATARS[i % AVATARS.length],
    color: null,
    score: solo ? [700, 500, 500, 300, 200, 100, 0, 0][i] ?? 0 : 0,
    connected: i !== 3,
    teamId: solo ? null : `t${(i % teamCount) + 1}`,
  }));
  const teamViews: TeamView[] = teams.map((t) => ({ ...t, memberIds: players.filter((p) => p.teamId === t.id).map((p) => p.id) }));
  // Team mode: one caption per team, last edited by its first member. Solo: one per player p2,p3,p5..p8.
  const captions: Caption[] = solo
    ? SOLO_CAPTIONS.map((text, i) => ({ id: `c${i + 1}`, playerId: ['p2', 'p3', 'p5', 'p6', 'p7', 'p8'][i], teamId: null, text, hidden: false }))
    : TEAM_CAPTIONS.map((text, i) => ({ id: `c${i + 1}`, playerId: teamViews[i].memberIds[0], teamId: teams[i].id, text, hidden: false }));
  return { teams: teamViews, players, captions };
}

function round(phase: Phase, d: ReturnType<typeof build>): RoundView | null {
  if (phase === 'LOBBY') return null;
  const after = phase === 'RESULTS' || phase === 'SCOREBOARD' || phase === 'FINAL';
  const voteCounts = [3, 9, 0, 7, 4, 1];
  const results: ScoredCaption[] = d.captions
    .map((c, i) => {
      const team = d.teams.find((t) => t.id === c.teamId) ?? null;
      return {
        id: c.id,
        text: c.text,
        playerId: c.playerId,
        playerName: d.players.find((p) => p.id === c.playerId)!.name,
        teamId: team?.id ?? null,
        teamName: team?.name ?? null,
        votes: voteCounts[i],
        points: voteCounts[i] * 100,
      };
    })
    .sort((a, b) => b.votes - a.votes);
  const connected = d.players.filter((p) => p.connected).map((p) => p.id);
  return {
    index: 2,
    totalPhotosQueued: 10,
    photo,
    subjectRevealed: false,
    submittedPlayerIds: phase === 'CAPTIONING' ? d.captions.slice(0, 3).map((c) => c.playerId) : d.captions.map((c) => c.playerId),
    submittedTeamIds: d.teams.length ? (phase === 'CAPTIONING' ? ['t1', 't2', 't4'] : d.teams.map((t) => t.id)) : [],
    votedPlayerIds: phase === 'VOTING' ? connected.slice(0, Math.ceil(connected.length / 2)) : after ? connected : [],
    captions: phase === 'VOTING' ? d.captions.map(({ id, text }) => ({ id, text })) : null,
    results: after ? results : null,
  };
}

function base(phase: Phase, d: ReturnType<typeof build>, solo: boolean) {
  const timed = phase === 'CAPTIONING' || phase === 'VOTING';
  const themeParam = new URLSearchParams(globalThis.location?.search ?? '').get('theme') as Settings['theme'] | null;
  const settings: Settings = { ...DEFAULT_SETTINGS, teamMode: !solo, ...(themeParam ? { theme: themeParam } : {}) };
  const lobby = phase === 'LOBBY';
  return {
    roomCode: 'GRFW',
    phase,
    deadline: timed ? Date.now() + 1000 * (phase === 'CAPTIONING' ? 48 : 21) : null,
    serverNow: Date.now(),
    players: lobby ? d.players.map((p) => ({ ...p, score: 0 })) : [...d.players].sort((a, b) => b.score - a.score),
    teams: lobby ? d.teams.map((t) => ({ ...t, score: 0 })) : [...d.teams].sort((a, b) => b.score - a.score),
    round: round(phase, d),
    settings,
  };
}

const JOIN_URL = 'https://party.example.com/play?room=GRFW';

export function mockView(role: View['role'], phase: Phase, meId = 'p3', solo = false): View {
  const d = build(solo);
  const b = base(phase, d, solo);
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
      photos: [photo, { id: 'ph2', url: '/dev/sample-photo.svg', subject: null, used: false }, { id: 'ph3', url: '/dev/sample-photo.svg', subject: null, used: false }],
      allCaptions: phase === 'LOBBY' ? null : d.captions.map((c) => ({ ...c, hidden: c.id === 'c5' && phase === 'VOTING' })),
    };
    return v;
  }
  const me = b.players.find((p) => p.id === meId) ?? b.players[0];
  const myTeam = b.teams.find((t) => t.id === me.teamId) ?? null;
  const mine = d.captions.find((c) => (myTeam ? c.teamId === myTeam.id : c.playerId === me.id)) ?? null;
  // In CAPTIONING, show the team caption as "already drafted by a teammate" for teams t1/t2/t4.
  const showMine = mine && (phase !== 'CAPTIONING' || (myTeam && ['t1', 't2', 't4'].includes(myTeam.id)));
  const v: PlayerView = {
    ...b,
    role: 'player',
    me,
    myTeam,
    myCaption: showMine ? mine.text : null,
    myCaptionEditedBy: showMine ? (d.players.find((p) => p.id === mine.playerId)?.name ?? null) : null,
    myCaptionId: showMine && phase !== 'CAPTIONING' ? mine.id : null,
    myVoteCaptionId: phase === 'VOTING' ? null : 'c2',
  };
  return v;
}

/** Reads ?mock=, ?mockme= and ?solo= from the URL. Returns null when not mocking. */
export function mockFromUrl(role: View['role']): View | null {
  const q = new URLSearchParams(window.location.search);
  const phase = q.get('mock')?.toUpperCase() as Phase | undefined;
  if (!phase || !PHASES.includes(phase)) return null;
  return mockView(role, phase, q.get('mockme') ?? undefined, q.get('solo') === '1');
}
