import { describe, expect, it } from 'vitest';
import type { GameState, HostAction } from '../shared/types.ts';
import { POINTS_PER_VOTE, SWEEP_BONUS } from '../shared/types.ts';
import { apply, currentRound, initialState, normalizeState, scoreRound, type EngineEvent } from './engine.ts';
import { playerView } from './views.ts';

const T0 = 1_000_000;

/** Applies events in order, failing the test on any engine error. */
function run(s: GameState, events: EngineEvent[], now = T0): GameState {
  for (const e of events) {
    const res = apply(s, e, now);
    if (res.error) throw new Error(`${JSON.stringify(e)} -> ${res.error}`);
    s = res.state;
  }
  return s;
}
const host = (action: HostAction): EngineEvent => ({ type: 'host', action });
const join = (id: string, name = id): EngineEvent => ({ type: 'join', playerId: id, name });
const cap = (id: string, text = `caption by ${id}`): EngineEvent => ({ type: 'caption', playerId: id, text, id: `c-${id}` });
const vote = (id: string, author: string): EngineEvent => ({ type: 'vote', playerId: id, captionId: `c-${author}` });
const photos = (n: number): EngineEvent => ({
  type: 'addPhotos',
  photos: Array.from({ length: n }, (_, i) => ({ id: `ph${i}`, url: `/photos/ph${i}.jpg`, subject: null, used: false })),
});

const SOLO: EngineEvent = { type: 'host', action: { type: 'updateSettings', settings: { teamMode: false } } };
/** Individual-mode lobby with players a,b,c and N photos (the team suite is further down). */
function lobby(nPhotos = 3, players = ['a', 'b', 'c']): GameState {
  return run(initialState('ABCD'), [SOLO, photos(nPhotos), ...players.map((p) => join(p))]);
}
/** Game in CAPTIONING for round 1. */
const captioning = (nPhotos = 3, players?: string[]) => run(lobby(nPhotos, players), [host({ type: 'start' }), host({ type: 'next' })]);
/** Game in VOTING with everyone having captioned. */
const voting = () => run(captioning(), [cap('a'), cap('b'), cap('c')]);

const err = (s: GameState, e: EngineEvent, now = T0) => apply(s, e, now).error;

describe('transitions', () => {
  it('start needs a photo', () => {
    expect(err(lobby(0), host({ type: 'start' }))).toBe('Add a photo first');
  });

  it('runs the full loop LOBBY -> ... -> FINAL', () => {
    let s = lobby(2);
    s = run(s, [host({ type: 'start' })]);
    expect(s.phase).toBe('PHOTO_REVEAL');
    expect(s.rounds).toHaveLength(1);
    expect(s.photos[0].used).toBe(true);
    expect(s.deadline).toBeNull();

    s = run(s, [host({ type: 'next' })]);
    expect(s.phase).toBe('CAPTIONING');
    expect(s.deadline).toBe(T0 + s.settings.captionSeconds * 1000);

    s = run(s, [cap('a'), cap('b'), host({ type: 'next' })]);
    expect(s.phase).toBe('VOTING');
    expect(s.deadline).toBe(T0 + s.settings.voteSeconds * 1000);

    s = run(s, [host({ type: 'next' })]);
    expect(s.phase).toBe('RESULTS');
    expect(s.deadline).toBeNull();

    s = run(s, [host({ type: 'next' })]);
    expect(s.phase).toBe('SCOREBOARD');

    s = run(s, [host({ type: 'next' })]);
    expect(s.phase).toBe('PHOTO_REVEAL');
    expect(currentRound(s)!.photoId).toBe('ph1');
    expect(currentRound(s)!.index).toBe(1);

    s = run(s, [host({ type: 'next' }), cap('a'), cap('b'), cap('c'), vote('a', 'b'), vote('b', 'a'), vote('c', 'a')]);
    expect(s.phase).toBe('RESULTS');
    s = run(s, [host({ type: 'next' }), host({ type: 'next' })]);
    expect(s.phase).toBe('FINAL');
    expect(err(s, host({ type: 'next' }))).toMatch(/over/);
  });

  it('next in LOBBY starts the game', () => {
    expect(run(lobby(), [host({ type: 'next' })]).phase).toBe('PHOTO_REVEAL');
  });

  it('start only works in the lobby', () => {
    const s = run(lobby(), [host({ type: 'start' })]);
    expect(err(s, host({ type: 'start' }))).toBeDefined();
  });

  it('nextRound from SCOREBOARD or RESULTS; errors when out of photos', () => {
    let s = run(voting(), [host({ type: 'next' })]);
    expect(s.phase).toBe('RESULTS');
    expect(run(s, [host({ type: 'nextRound' })]).phase).toBe('PHOTO_REVEAL');
    s = run(s, [host({ type: 'next' })]);
    expect(run(s, [host({ type: 'nextRound' })]).phase).toBe('PHOTO_REVEAL');

    const one = run(lobby(1), [host({ type: 'start' }), host({ type: 'next' }), host({ type: 'next' }), host({ type: 'next' })]);
    expect(one.phase).toBe('SCOREBOARD');
    expect(err(one, host({ type: 'nextRound' }))).toMatch(/No photos left/);
    expect(err(captioning(), host({ type: 'nextRound' }))).toBeDefined();
  });

  it('end from VOTING scores the votes cast; end from CAPTIONING abandons the round', () => {
    let s = run(voting(), [vote('a', 'b'), host({ type: 'end' })]);
    expect(s.phase).toBe('FINAL');
    expect(s.players.b.score).toBe(POINTS_PER_VOTE);

    s = run(captioning(), [cap('a'), host({ type: 'end' })]);
    expect(s.phase).toBe('FINAL');
    expect(s.rounds).toHaveLength(0);
    expect(s.photos[0].used).toBe(false);
    expect(err(lobby(), host({ type: 'end' }))).toBeDefined();
  });

  it('does not mutate the input state', () => {
    const s = lobby();
    const before = JSON.stringify(s);
    apply(s, host({ type: 'start' }), T0);
    apply(s, join('z'), T0);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('auto-advance and timers', () => {
  it('CAPTIONING -> VOTING when every connected player has submitted', () => {
    let s = run(captioning(), [cap('a'), cap('b')]);
    expect(s.phase).toBe('CAPTIONING');
    s = run(s, [cap('c')], T0 + 5000);
    expect(s.phase).toBe('VOTING');
    expect(s.deadline).toBe(T0 + 5000 + s.settings.voteSeconds * 1000);
  });

  it('disconnected players are not waited for', () => {
    let s = run(captioning(), [{ type: 'presence', online: ['a', 'b'] }, cap('a'), cap('b')]);
    expect(s.phase).toBe('VOTING');
    s = run(s, [vote('a', 'b'), vote('b', 'a')]);
    expect(s.phase).toBe('RESULTS');
  });

  it('VOTING -> RESULTS when every connected player has voted', () => {
    let s = run(voting(), [vote('a', 'b'), vote('b', 'a')]);
    expect(s.phase).toBe('VOTING');
    s = run(s, [vote('c', 'a')]);
    expect(s.phase).toBe('RESULTS');
  });

  it('timeout advances only once the deadline passes', () => {
    let s = run(captioning(), [cap('a'), cap('b')]);
    const deadline = s.deadline!;
    expect(run(s, [{ type: 'timeout' }], deadline - 1).phase).toBe('CAPTIONING');
    s = run(s, [{ type: 'timeout' }], deadline);
    expect(s.phase).toBe('VOTING');
    s = run(s, [{ type: 'timeout' }], s.deadline!);
    expect(s.phase).toBe('RESULTS');
  });

  it('timeout in an untimed phase is a no-op', () => {
    const s = run(lobby(), [host({ type: 'start' })]);
    expect(run(s, [{ type: 'timeout' }], T0 + 1e9)).toEqual(s);
  });

  it('fewer than 2 visible captions skips VOTING (tough crowd)', () => {
    let s = run(captioning(), [cap('a'), { type: 'timeout' }], T0 + 1e6);
    expect(s.phase).toBe('RESULTS');
    expect(s.players.a.score).toBe(0);

    s = run(captioning(), [{ type: 'timeout' }], T0 + 1e6);
    expect(s.phase).toBe('RESULTS');

    s = run(captioning(), [cap('a'), cap('b'), host({ type: 'hideCaption', captionId: 'c-b', hidden: true }), host({ type: 'next' })]);
    expect(s.phase).toBe('RESULTS');
  });

  it('addTime extends the deadline and needs a running timer', () => {
    const s = captioning();
    expect(run(s, [host({ type: 'addTime', seconds: 30 })]).deadline).toBe(s.deadline! + 30_000);
    // If the deadline already passed, time is added from now.
    expect(run(s, [host({ type: 'addTime', seconds: 30 })], s.deadline! + 5000).deadline).toBe(s.deadline! + 35_000);
    expect(err(lobby(), host({ type: 'addTime', seconds: 30 }))).toBeDefined();
    expect(err(s, host({ type: 'addTime', seconds: -5 }))).toBeDefined();
  });
});

describe('captions', () => {
  it('are trimmed, capped, and editable', () => {
    let s = run(captioning(), [cap('a', '   hello    world  ')]);
    expect(currentRound(s)!.captions[0].text).toBe('hello world');
    s = run(s, [cap('a', 'x'.repeat(500))]);
    expect(currentRound(s)!.captions).toHaveLength(1);
    expect(currentRound(s)!.captions[0].text).toHaveLength(s.settings.maxCaptionLength);
    expect(currentRound(s)!.captions[0].id).toBe('c-a');
  });

  it('reject empty text, unknown players, and the wrong phase', () => {
    const s = captioning();
    expect(err(s, cap('a', '   '))).toBeDefined();
    expect(err(s, cap('nobody'))).toBe('Player not found');
    expect(err(lobby(), cap('a'))).toBe('Captions are closed');
    expect(err(voting(), cap('a'))).toBe('Captions are closed');
  });
});

describe('votes', () => {
  it('cannot vote for your own caption', () => {
    expect(err(voting(), vote('a', 'a'))).toMatch(/own caption/);
  });

  it('cannot vote for a hidden caption, and hiding drops existing votes', () => {
    let s = run(voting(), [vote('a', 'c')]);
    s = run(s, [host({ type: 'hideCaption', captionId: 'c-c', hidden: true })]);
    expect(currentRound(s)!.votes.a).toBeUndefined();
    expect(err(s, vote('b', 'c'))).toMatch(/not available/);
  });

  it('can change a vote until the phase ends', () => {
    const s = run(voting(), [vote('a', 'b'), vote('a', 'c')]);
    expect(currentRound(s)!.votes.a).toBe('c-c');
  });

  it('rejects votes outside VOTING', () => {
    expect(err(captioning(), vote('a', 'b'))).toBe('Voting is closed');
  });
});

describe('scoring', () => {
  it('awards points per vote, applied exactly once', () => {
    const players = ['a', 'b', 'c', 'd'];
    let s = run(captioning(3, players), [cap('a'), cap('b'), cap('c'), cap('d')]);
    s = run(s, [vote('a', 'b'), vote('b', 'a'), vote('c', 'b'), vote('d', 'a')]);
    expect(s.phase).toBe('RESULTS');
    expect(s.players.a.score).toBe(2 * POINTS_PER_VOTE);
    expect(s.players.b.score).toBe(2 * POINTS_PER_VOTE);
    expect(s.players.c.score).toBe(0);
    // Moving on doesn't double-count.
    s = run(s, [host({ type: 'next' }), { type: 'timeout' }], T0 + 1e9);
    expect(s.players.a.score).toBe(2 * POINTS_PER_VOTE);
  });

  it('sweep bonus when 2+ voters all pick you', () => {
    const s = run(voting(), [vote('b', 'a'), vote('c', 'a'), { type: 'timeout' }], T0 + 1e9);
    expect(s.players.a.score).toBe(2 * POINTS_PER_VOTE + SWEEP_BONUS);
  });

  it('no sweep bonus with a single voter', () => {
    const s = run(voting(), [vote('b', 'a'), { type: 'timeout' }], T0 + 1e9);
    expect(s.players.a.score).toBe(POINTS_PER_VOTE);
  });

  it('ties score equally and sort by name', () => {
    const s = run(voting(), [vote('a', 'b'), vote('b', 'a'), { type: 'timeout' }], T0 + 1e9);
    const results = scoreRound(s, currentRound(s)!);
    expect(results.map((r) => [r.playerName, r.points])).toEqual([
      ['a', 100],
      ['b', 100],
      ['c', 0],
    ]);
  });

  it('hidden captions are excluded from results', () => {
    const s = run(voting(), [host({ type: 'hideCaption', captionId: 'c-c', hidden: true }), vote('a', 'b'), vote('b', 'a'), vote('c', 'a')]);
    expect(s.phase).toBe('RESULTS');
    expect(scoreRound(s, currentRound(s)!).map((r) => r.id)).not.toContain('c-c');
  });
});

describe('players', () => {
  it('dedupes names and cleans whitespace', () => {
    const s = run(lobby(), [join('d', '  a  '), join('e', 'A')]);
    expect(s.players.d.name).toBe('a 2');
    expect(s.players.e.name).toBe('A 3');
    expect(err(s, join('f', '   '))).toBeDefined();
  });

  it('late joiners can caption in CAPTIONING and vote in VOTING', () => {
    let s = run(captioning(), [cap('a'), cap('b'), join('late'), cap('c')]);
    expect(s.phase).toBe('CAPTIONING'); // waits for the late joiner too
    s = run(s, [cap('late')]);
    expect(s.phase).toBe('VOTING');
    s = run(s, [join('later'), vote('later', 'a')]);
    expect(currentRound(s)!.votes.later).toBe('c-a');
  });

  it('late joiners work in every phase', () => {
    for (const steps of [0, 1, 2, 3, 4, 5]) {
      let s = lobby();
      for (let i = 0; i < steps; i++) s = run(s, [host({ type: 'next' })]);
      expect(run(s, [join('z')]).players.z.score).toBe(0);
    }
  });

  it('kick removes the player and their caption/votes mid-round', () => {
    let s = run(voting(), [vote('a', 'c'), vote('c', 'b')]);
    s = run(s, [host({ type: 'kick', playerId: 'c' })]);
    expect(s.players.c).toBeUndefined();
    expect(currentRound(s)!.captions.map((c) => c.id)).toEqual(['c-a', 'c-b']);
    expect(currentRound(s)!.votes).toEqual({});
  });

  it('kicking the last holdout auto-advances', () => {
    const s = run(captioning(), [cap('a'), cap('b'), host({ type: 'kick', playerId: 'c' })]);
    expect(s.phase).toBe('VOTING');
  });

  it('rename dedupes; adjustScore adds', () => {
    const s = run(lobby(), [host({ type: 'rename', playerId: 'a', name: 'B' }), host({ type: 'adjustScore', playerId: 'c', delta: -50 })]);
    expect(s.players.a.name).toBe('B 2');
    expect(s.players.c.score).toBe(-50);
    expect(err(s, host({ type: 'rename', playerId: 'zz', name: 'x' }))).toBe('Player not found');
  });

  it('setAvatar and avatar on join', () => {
    let s = run(lobby(), [{ type: 'join', playerId: 'z', name: 'Z', avatar: 'cat', color: '#f00' }]);
    expect(s.players.z).toMatchObject({ avatar: 'cat', color: '#f00' });
    s = run(s, [{ type: 'setAvatar', playerId: 'z', avatar: null, color: '#0f0' }]);
    expect(s.players.z).toMatchObject({ avatar: null, color: '#0f0' });
  });
});

describe('photos and settings', () => {
  it('reorderPhotos puts listed ids first and keeps the rest', () => {
    const s = run(lobby(4), [host({ type: 'reorderPhotos', photoIds: ['ph2', 'nope', 'ph0'] })]);
    expect(s.photos.map((p) => p.id)).toEqual(['ph2', 'ph0', 'ph1', 'ph3']);
    expect(run(s, [host({ type: 'start' })]).rounds[0].photoId).toBe('ph2');
  });

  it('setSubject and revealSubject', () => {
    let s = run(lobby(), [host({ type: 'setSubject', photoId: 'ph0', subject: '  Cousin Jake ' }), host({ type: 'start' })]);
    expect(s.photos[0].subject).toBe('Cousin Jake');
    s = run(s, [host({ type: 'revealSubject' })]);
    expect(currentRound(s)!.subjectRevealed).toBe(true);
    s = run(s, [host({ type: 'setSubject', photoId: 'ph0', subject: '' })]);
    expect(s.photos[0].subject).toBeNull();
  });

  it('removePhoto refuses played photos', () => {
    const s = run(lobby(), [host({ type: 'start' })]);
    expect(err(s, host({ type: 'removePhoto', photoId: 'ph0' }))).toMatch(/already played/);
    expect(run(s, [host({ type: 'removePhoto', photoId: 'ph1' })]).photos.map((p) => p.id)).toEqual(['ph0', 'ph2']);
  });

  it('addPhotos skips duplicate ids', () => {
    expect(run(lobby(2), [photos(3)]).photos).toHaveLength(3);
  });

  it('updateSettings clamps to sane ranges', () => {
    const s = run(lobby(), [host({ type: 'updateSettings', settings: { captionSeconds: 2, voteSeconds: 9999, maxCaptionLength: 100.4 } })]);
    expect(s.settings).toMatchObject({ captionSeconds: 10, voteSeconds: 300, maxCaptionLength: 100 });
    expect(err(s, host({ type: 'updateSettings', settings: { voteSeconds: Number.NaN } }))).toBeDefined();
  });
});

describe('reset', () => {
  it('clears scores, rounds, and used photos but keeps players', () => {
    let s = run(voting(), [vote('b', 'a'), vote('c', 'a'), vote('a', 'b'), host({ type: 'next' }), host({ type: 'end' })]);
    expect(s.players.a.score).toBeGreaterThan(0);
    s = run(s, [host({ type: 'reset' })]);
    expect(s.phase).toBe('LOBBY');
    expect(s.rounds).toEqual([]);
    expect(s.deadline).toBeNull();
    expect(Object.keys(s.players)).toEqual(['a', 'b', 'c']);
    expect(Object.values(s.players).every((p) => p.score === 0)).toBe(true);
    expect(s.photos.every((p) => !p.used)).toBe(true);
  });
});

// ---------- team mode ----------

/** Team-mode lobby: N teams, players p1..pN joined in order, 3 photos. */
function teamLobby(nPlayers = 10, teamCount = 5): GameState {
  let s = initialState('ABCD');
  s = run(s, [
    host({ type: 'updateSettings', settings: { teamCount } }),
    photos(3),
    ...Array.from({ length: nPlayers }, (_, i) => join(`p${i + 1}`)),
  ]);
  return s;
}
const teamOf = (s: GameState, id: string) => s.players[id].teamId!;
const tcap = (id: string, capId: string, text = `by ${id}`): EngineEvent => ({ type: 'caption', playerId: id, text, id: capId });
const tvote = (id: string, captionId: string): EngineEvent => ({ type: 'vote', playerId: id, captionId });
/** 4 players on 2 teams: t1 = p1,p3; t2 = p2,p4. In CAPTIONING. */
const teamCaptioning = () => run(teamLobby(4, 2), [host({ type: 'start' }), host({ type: 'next' })]);

describe('teams', () => {
  it('is the default: 5 preset teams', () => {
    const s = initialState('ABCD');
    expect(s.settings.teamMode).toBe(true);
    expect(s.teams.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4', 't5']);
    expect(s.teams[0].name).toBe('The Mullets');
  });

  it('assigns in join order, round-robin and balanced', () => {
    const s = teamLobby(12, 5);
    expect(Array.from({ length: 12 }, (_, i) => teamOf(s, `p${i + 1}`))).toEqual(
      ['t1', 't2', 't3', 't4', 't5', 't1', 't2', 't3', 't4', 't5', 't1', 't2'],
    );
  });

  it('fills the smallest team after a kick', () => {
    const s = run(teamLobby(10, 5), [host({ type: 'kick', playerId: 'p3' }), join('late')]);
    expect(teamOf(s, 'late')).toBe('t3');
  });

  it('changing teamCount in the lobby rebuilds teams; not allowed mid-game', () => {
    let s = run(teamLobby(6, 5), [host({ type: 'renameTeam', teamId: 't1', name: 'Keepers' })]);
    s = run(s, [host({ type: 'updateSettings', settings: { teamCount: 3 } })]);
    expect(s.teams.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
    expect(s.teams[0].name).toBe('Keepers');
    expect(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((p) => teamOf(s, p))).toEqual(['t1', 't2', 't3', 't1', 't2', 't3']);
    const started = run(s, [host({ type: 'start' })]);
    expect(err(started, host({ type: 'updateSettings', settings: { teamCount: 4 } }))).toMatch(/lobby/);
    // Non-team settings still change mid-game.
    expect(run(started, [host({ type: 'updateSettings', settings: { voteSeconds: 20 } })]).settings.voteSeconds).toBe(20);
  });

  it('teamMode off clears teams; back on rebuilds them', () => {
    let s = run(teamLobby(4, 2), [SOLO]);
    expect(s.teams).toEqual([]);
    expect(s.players.p1.teamId).toBeNull();
    s = run(s, [host({ type: 'updateSettings', settings: { teamMode: true } })]);
    expect(s.teams).toHaveLength(2);
    expect(teamOf(s, 'p2')).toBe('t2');
  });

  it('a later submission replaces the team caption and records the editor', () => {
    let s = run(teamCaptioning(), [tcap('p1', 'x1', 'first'), tcap('p3', 'x2', 'second')]);
    const r = currentRound(s)!;
    expect(r.captions).toHaveLength(1);
    expect(r.captions[0]).toMatchObject({ id: 'x1', teamId: 't1', playerId: 'p3', text: 'second' });
    const v = playerView(s, 'p1')!;
    expect(v.myCaption).toBe('second');
    expect(v.myCaptionId).toBe('x1');
    expect(v.myCaptionEditedBy).toBe('p3');
    expect(v.myTeam?.memberIds).toEqual(['p1', 'p3']);
    s = run(s, [tcap('p2', 'y1')]);
    expect(s.phase).toBe('VOTING'); // every team has a caption
  });

  it('CAPTIONING waits only for teams with a connected member', () => {
    const s = run(teamLobby(6, 3), [
      host({ type: 'start' }),
      host({ type: 'next' }),
      { type: 'presence', online: ['p1', 'p2', 'p4', 'p5'] }, // t3 (p3, p6) all offline
      tcap('p1', 'a'),
      tcap('p2', 'b'),
    ]);
    expect(s.phase).toBe('VOTING');
  });

  it("blocks voting for your own team's caption; auto-advances when everyone voted", () => {
    let s = run(teamCaptioning(), [tcap('p1', 'A'), tcap('p2', 'B')]);
    expect(err(s, tvote('p3', 'A'))).toMatch(/own team/);
    s = run(s, [tvote('p1', 'B'), tvote('p2', 'A'), tvote('p3', 'B')]);
    expect(s.phase).toBe('VOTING');
    s = run(s, [tvote('p4', 'A')]);
    expect(s.phase).toBe('RESULTS');
  });

  it('scores go to teams, with a sweep when every eligible voter picked it', () => {
    // 3 teams: t1 = p1,p4  t2 = p2,p5  t3 = p3,p6
    let s = run(teamLobby(6, 3), [host({ type: 'start' }), host({ type: 'next' }), tcap('p1', 'A'), tcap('p2', 'B'), tcap('p3', 'C')]);
    // Everyone not on t1 votes A (sweep: 4 of 4 eligible). t1 members split B/C.
    s = run(s, [tvote('p2', 'A'), tvote('p5', 'A'), tvote('p3', 'A'), tvote('p6', 'A'), tvote('p1', 'B'), tvote('p4', 'C')]);
    expect(s.phase).toBe('RESULTS');
    const team = (id: string) => s.teams.find((t) => t.id === id)!.score;
    expect(team('t1')).toBe(4 * POINTS_PER_VOTE + SWEEP_BONUS);
    expect(team('t2')).toBe(POINTS_PER_VOTE);
    expect(team('t3')).toBe(POINTS_PER_VOTE);
    expect(Object.values(s.players).every((p) => p.score === 0)).toBe(true);
    const res = scoreRound(s, currentRound(s)!);
    expect(res[0]).toMatchObject({ id: 'A', teamId: 't1', teamName: 'The Mullets', playerName: 'p1', votes: 4 });
  });

  it('no sweep when an eligible voter picked something else', () => {
    let s = run(teamLobby(6, 3), [host({ type: 'start' }), host({ type: 'next' }), tcap('p1', 'A'), tcap('p2', 'B'), tcap('p3', 'C')]);
    s = run(s, [tvote('p2', 'A'), tvote('p5', 'A'), tvote('p3', 'A'), tvote('p6', 'B'), { type: 'timeout' }], T0 + 1e9);
    expect(s.teams.find((t) => t.id === 't1')!.score).toBe(3 * POINTS_PER_VOTE);
  });

  it('moveToTeam drops a vote that now targets your own team', () => {
    let s = run(teamCaptioning(), [tcap('p1', 'A'), tcap('p2', 'B'), tvote('p3', 'B')]);
    s = run(s, [host({ type: 'moveToTeam', playerId: 'p3', teamId: 't2' })]);
    expect(teamOf(s, 'p3')).toBe('t2');
    expect(currentRound(s)!.votes.p3).toBeUndefined();
    expect(err(s, host({ type: 'moveToTeam', playerId: 'p3', teamId: 'nope' }))).toBe('Team not found');
  });

  it('shuffleTeams is balanced, seeded, and only between rounds', () => {
    const s = teamLobby(10, 5);
    const a = run(s, [{ type: 'host', action: { type: 'shuffleTeams' }, seed: 42 }]);
    const b = run(s, [{ type: 'host', action: { type: 'shuffleTeams' }, seed: 42 }]);
    expect(a.players).toEqual(b.players);
    const sizes = a.teams.map((t) => Object.values(a.players).filter((p) => p.teamId === t.id).length);
    expect(sizes).toEqual([2, 2, 2, 2, 2]);
    expect(err(run(s, [host({ type: 'start' }), host({ type: 'next' })]), host({ type: 'shuffleTeams' }))).toMatch(/between rounds/);
  });

  it('members and the host can rename a team', () => {
    let s = run(teamLobby(4, 2), [{ type: 'renameTeam', playerId: 'p2', name: '  The   Cool Ones  ' }]);
    expect(s.teams[1].name).toBe('The Cool Ones');
    s = run(s, [host({ type: 'renameTeam', teamId: 't1', name: 'x'.repeat(50) })]);
    expect(s.teams[0].name).toHaveLength(24);
    expect(err(s, { type: 'renameTeam', playerId: 'p1', name: '  ' })).toBeDefined();
  });

  it('adjustScore targets the team (by member or team id)', () => {
    const s = run(teamLobby(4, 2), [host({ type: 'adjustScore', playerId: 'p1', delta: 100 }), host({ type: 'adjustScore', playerId: 't2', delta: -100 })]);
    expect(s.teams.map((t) => t.score)).toEqual([100, -100]);
  });

  it('kicking the last editor keeps the team caption', () => {
    const s = run(teamCaptioning(), [tcap('p1', 'A'), host({ type: 'kick', playerId: 'p1' })]);
    expect(currentRound(s)!.captions.map((c) => c.id)).toEqual(['A']);
  });

  it('reset keeps teams and members but zeroes team scores', () => {
    let s = run(teamCaptioning(), [tcap('p1', 'A'), tcap('p2', 'B'), tvote('p1', 'B'), tvote('p2', 'A'), tvote('p3', 'B'), tvote('p4', 'A')]);
    expect(s.teams.some((t) => t.score > 0)).toBe(true);
    s = run(s, [host({ type: 'reset' })]);
    expect(s.teams.map((t) => t.score)).toEqual([0, 0]);
    expect(teamOf(s, 'p3')).toBe('t1');
  });

  it('late joiners land on a team and can replace its caption', () => {
    let s = run(teamCaptioning(), [tcap('p1', 'A'), join('late')]);
    expect(teamOf(s, 'late')).toBe('t1');
    s = run(s, [tcap('late', 'zzz', 'late edit')]);
    expect(currentRound(s)!.captions[0]).toMatchObject({ id: 'A', text: 'late edit' });
  });

  it('teams survive a save/restore round trip; old saves without teams get normalized', () => {
    const s = run(teamCaptioning(), [tcap('p1', 'A')]);
    expect(normalizeState(JSON.parse(JSON.stringify(s)))).toEqual(s);
    const old = JSON.parse(JSON.stringify(lobby())) as Record<string, unknown>;
    delete old.teams;
    old.settings = { captionSeconds: 75, voteSeconds: 30, maxCaptionLength: 80 };
    for (const p of Object.values(old.players as Record<string, Record<string, unknown>>)) delete p.teamId;
    const n = normalizeState(old as unknown as GameState);
    expect(n.teams).toHaveLength(5);
    expect(n.players.a.teamId).toBe('t1');
  });

  it('a 25-player, 5-team round plays through', () => {
    let s = run(teamLobby(25, 5), [host({ type: 'start' }), host({ type: 'next' })]);
    const ids = Array.from({ length: 25 }, (_, i) => `p${i + 1}`);
    s = run(s, ids.slice(0, 5).map((p) => tcap(p, `cap-${p}`)));
    expect(s.phase).toBe('VOTING');
    // Everyone votes for team t1's caption unless they're on t1 (then t2's).
    s = run(s, ids.map((p) => tvote(p, teamOf(s, p) === 't1' ? 'cap-p2' : 'cap-p1')));
    expect(s.phase).toBe('RESULTS');
    expect(s.teams.find((t) => t.id === 't1')!.score).toBe(20 * POINTS_PER_VOTE + SWEEP_BONUS);
  });
});
