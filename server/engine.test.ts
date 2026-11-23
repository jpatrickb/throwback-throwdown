import { describe, expect, it } from 'vitest';
import type { GameState, HostAction } from '../shared/types.ts';
import { POINTS_PER_VOTE, SWEEP_BONUS } from '../shared/types.ts';
import { apply, currentRound, initialState, scoreRound, type EngineEvent } from './engine.ts';

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

/** Lobby with players a,b,c and N photos. */
function lobby(nPhotos = 3, players = ['a', 'b', 'c']): GameState {
  return run(initialState('ABCD'), [photos(nPhotos), ...players.map((p) => join(p))]);
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
    expect(s.settings).toEqual({ captionSeconds: 10, voteSeconds: 300, maxCaptionLength: 100 });
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
