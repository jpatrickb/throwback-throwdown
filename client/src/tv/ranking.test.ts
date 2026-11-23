import { describe, expect, it } from 'vitest';
import type { ScoredCaption } from '../../../shared/types.ts';
import { byScore, planReveal, ranks, roundPoints } from './ranking.ts';

const cap = (id: string, votes: number, playerId = `p-${id}`): ScoredCaption => ({
  id,
  text: `caption ${id}`,
  playerId,
  playerName: playerId,
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

describe('planReveal', () => {
  it('reveals fewest votes first and the winner last', () => {
    const plan = planReveal([cap('a', 3), cap('b', 0), cap('c', 1)]);
    expect(plan.steps.map((g) => g.map((c) => c.id))).toEqual([['b'], ['c'], ['a']]);
    expect([...plan.winners]).toEqual(['a']);
  });
  it('reveals tied winners together in the final step', () => {
    const plan = planReveal([cap('a', 2), cap('b', 2), cap('c', 1)]);
    expect(plan.steps.length).toBe(2);
    expect(plan.steps[1].map((c) => c.id).sort()).toEqual(['a', 'b']);
    expect(plan.winners.size).toBe(2);
  });
  it('has no winner when nobody got a vote', () => {
    const plan = planReveal([cap('a', 0), cap('b', 0)]);
    expect(plan.winners.size).toBe(0);
    expect(plan.steps.length).toBe(2);
  });
  it('handles the tough-crowd cases', () => {
    expect(planReveal([]).steps).toEqual([]);
    const one = planReveal([cap('solo', 0)]);
    expect(one.steps.length).toBe(1);
    expect(one.winners.size).toBe(0);
  });
});
