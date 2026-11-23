import { describe, expect, it } from 'vitest';
import type { ScoredCaption } from '../../../shared/types.ts';
import { byScore, leaderChanged, planReveal, ranks, revealSchedule, roundPoints } from './ranking.ts';

const cap = (id: string, votes: number, playerId = `p-${id}`): ScoredCaption => ({
  id,
  text: `caption ${id}`,
  playerId,
  playerName: playerId,
  teamId: null,
  teamName: null,
  votes,
  points: votes * 100,
});

describe('ranks', () => {
  it('uses competition ranking for ties', () => {
    expect(ranks([{ score: 700 }, { score: 500 }, { score: 500 }, { score: 300 }])).toEqual([1, 2, 2, 4]);
  });
  it('handles everyone tied at zero', () => {
    expect(ranks([{ score: 0 }, { score: 0 }])).toEqual([1, 1]);
  });
});

describe('byScore', () => {
  it('sorts by score desc then name', () => {
    const ps = [
      { name: 'Zed', score: 100 },
      { name: 'Amy', score: 100 },
      { name: 'Bob', score: 300 },
    ];
    expect(ps.sort(byScore).map((p) => p.name)).toEqual(['Bob', 'Amy', 'Zed']);
  });
});

describe('roundPoints', () => {
  it('sums points per player and tolerates null', () => {
    expect(roundPoints(null)).toEqual({});
    expect(roundPoints([cap('a', 2, 'p1'), cap('b', 1, 'p2')])).toEqual({ p1: 200, p2: 100 });
  });
});

const ids = (plan: ReturnType<typeof planReveal>) => plan.beats.map((b) => `${b.kind}:${b.captions.map((c) => c.id).sort().join(',')}`);

describe('planReveal', () => {
  it('reveals zeros together, then low tiers, then the top 3 one by one, winner last', () => {
    const plan = planReveal([cap('w', 5), cap('s', 4), cap('t', 3), cap('a', 1), cap('b', 1), cap('c', 2), cap('z1', 0), cap('z2', 0)]);
    expect(ids(plan)).toEqual(['zero:z1,z2', 'tier:a,b', 'tier:c', 'drama:t', 'drama:s', 'winner:w']);
    expect([...plan.winners]).toEqual(['w']);
  });
  it('reveals tied winners together and counts them toward the top 3', () => {
    const plan = planReveal([cap('a', 2), cap('b', 2), cap('c', 1), cap('d', 1)]);
    expect(ids(plan)).toEqual(['tier:d', 'drama:c', 'winner:a,b'].map((x) => x));
    expect(plan.winners.size).toBe(2);
  });
  it('a three-way tie for the win has no runner-up drama', () => {
    const plan = planReveal([cap('a', 2), cap('b', 2), cap('c', 2), cap('d', 1)]);
    expect(ids(plan)).toEqual(['tier:d', 'winner:a,b,c']);
  });
  it('has no winner when nobody got a vote', () => {
    const plan = planReveal([cap('a', 0), cap('b', 0)]);
    expect(plan.winners.size).toBe(0);
    expect(ids(plan)).toEqual(['zero:a,b']);
  });
  it('handles the tough-crowd cases', () => {
    expect(planReveal([]).beats).toEqual([]);
    expect(ids(planReveal([cap('solo', 0)]))).toEqual(['zero:solo']);
    expect(ids(planReveal([cap('solo', 1)]))).toEqual(['winner:solo']);
  });
});

describe('revealSchedule', () => {
  it('keeps 25 captions from 25 voters well under 45s', () => {
    // A realistic spread: lots of zeros, a few ones/twos, a clear top 3.
    const votes = [7, 5, 3, 2, 2, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const plan = planReveal(votes.map((v, i) => cap(`c${i}`, v)));
    expect(revealSchedule(plan).total).toBeLessThan(45_000);
  });
  it('stays under 45s even when every caption has a different vote count', () => {
    // Worst case for tiers: every caption a different count (impossible with 25 voters, so an upper bound).
    const plan = planReveal(Array.from({ length: 25 }, (_, i) => cap(`c${i}`, i)));
    expect(revealSchedule(plan).total).toBeLessThan(45_000);
    expect(plan.beats.filter((b) => b.kind === 'tier').length).toBeLessThanOrEqual(5);
    const plan10 = planReveal(Array.from({ length: 10 }, (_, i) => cap(`c${i}`, i + 1)));
    expect(revealSchedule(plan10).total).toBeLessThan(45_000);
  });
  it('drumrolls before the winner', () => {
    const plan = planReveal([cap('a', 0), cap('b', 2)]);
    const { starts } = revealSchedule(plan);
    expect(starts[1] - starts[0]).toBeGreaterThan(2600);
  });
});

describe('leaderChanged', () => {
  const r = (id: string, prev: number, score: number) => ({ id, prev, score });
  it('detects a new team in first place', () => {
    expect(leaderChanged([r('a', 500, 600), r('b', 400, 900)])).toBe(true);
  });
  it('is false when the leader holds on, even if tied', () => {
    expect(leaderChanged([r('a', 500, 600), r('b', 400, 500)])).toBe(false);
    expect(leaderChanged([r('a', 500, 700), r('b', 400, 700)])).toBe(false);
  });
  it('is false on the first scored round (nobody led before)', () => {
    expect(leaderChanged([r('a', 0, 300), r('b', 0, 100)])).toBe(false);
  });
});
