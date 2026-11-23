import { describe, expect, it } from 'vitest';
import type { Phase, Photo, Player, TeamView } from '../../../shared/types.ts';
import { primaryFor } from './host/primary.ts';
import { fitWithin } from './host/resize.ts';
import { rankOf } from './player/rank.ts';
import { fallbackLook } from './avatars.ts';
import { summarizeNames } from './host/names.ts';
import { activeTeams, isTeamMode, membersOf, teamRank } from './teams.ts';
import { DEFAULT_SETTINGS } from '../../../shared/types.ts';

const photo = (id: string, used: boolean): Photo => ({ id, url: '', subject: null, used });
const pl = (id: string, score: number): Player => ({ id, name: id, avatar: null, color: null, score, connected: true, teamId: null });

describe('primaryFor', () => {
  const photos = [photo('a', true), photo('b', false)];
  it.each<[Phase, string]>([
    ['LOBBY', 'start'],
    ['PHOTO_REVEAL', 'next'],
    ['CAPTIONING', 'next'],
    ['VOTING', 'next'],
    ['RESULTS', 'next'],
    ['SCOREBOARD', 'nextRound'],
    ['FINAL', 'reset'],
  ])('%s -> %s', (phase, type) => {
    expect(primaryFor({ phase, photos }).action.type).toBe(type);
  });
  it('ends the game from the scoreboard when no photos remain', () => {
    const step = primaryFor({ phase: 'SCOREBOARD', photos: [photo('a', true)] });
    expect(step.action.type).toBe('end');
    expect(step.label).toBe('Final results');
  });
});

describe('fitWithin', () => {
  it('scales the long edge down to 1920', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1920, height: 1440 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1440, height: 1920 });
  });
  it('never upscales', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe('rankOf', () => {
  const players = [pl('a', 700), pl('b', 500), pl('c', 500), pl('d', 100)];
  it('shares ranks on ties', () => {
    expect(rankOf(players, 'a')).toBe(1);
    expect(rankOf(players, 'b')).toBe(2);
    expect(rankOf(players, 'c')).toBe(2);
    expect(rankOf(players, 'd')).toBe(4);
  });
});

describe('fallbackLook', () => {
  it('is stable per id', () => {
    expect(fallbackLook('p1')).toEqual(fallbackLook('p1'));
  });
});

describe('summarizeNames', () => {
  const names = Array.from({ length: 18 }, (_, i) => `P${i}`);
  it('truncates long lists with a +N count', () => {
    expect(summarizeNames(names, 6)).toEqual({ shown: names.slice(0, 6), more: 12 });
  });
  it('shows everything when it fits', () => {
    expect(summarizeNames(names.slice(0, 4), 6)).toEqual({ shown: names.slice(0, 4), more: 0 });
    expect(summarizeNames(names, Infinity).more).toBe(0);
  });
});

describe('teams helpers', () => {
  const team = (id: string, score: number, memberIds: string[]): TeamView => ({ id, name: id, color: '#fff', score, memberIds });
  const teams = [team('t1', 900, ['a', 'b']), team('t2', 700, ['c']), team('t3', 700, ['d']), team('t4', 0, [])];
  const players = [pl('a', 0), pl('b', 0), pl('c', 0), { ...pl('d', 0), connected: false }];

  it('detects team mode only when the setting is on and teams exist', () => {
    expect(isTeamMode({ settings: DEFAULT_SETTINGS, teams })).toBe(true);
    expect(isTeamMode({ settings: { ...DEFAULT_SETTINGS, teamMode: false }, teams })).toBe(false);
    expect(isTeamMode({ settings: DEFAULT_SETTINGS, teams: [] })).toBe(false);
  });
  it('ranks teams with shared ties', () => {
    expect(teamRank(teams, 't1')).toBe(1);
    expect(teamRank(teams, 't2')).toBe(2);
    expect(teamRank(teams, 't3')).toBe(2);
    expect(teamRank(teams, 't4')).toBe(4);
  });
  it('resolves members in join order', () => {
    expect(membersOf(teams[0], players).map((p) => p.id)).toEqual(['a', 'b']);
  });
  it('only counts teams with a connected member as active', () => {
    expect(activeTeams(teams, players).map((t) => t.id)).toEqual(['t1', 't2']);
  });
});
