import { describe, expect, it } from 'vitest';
import type { Phase, Photo, Player } from '../../../shared/types.ts';
import { primaryFor } from './host/primary.ts';
import { fitWithin } from './host/resize.ts';
import { rankOf } from './player/rank.ts';
import { fallbackLook } from './avatars.ts';

const photo = (id: string, used: boolean): Photo => ({ id, url: '', subject: null, used });
const pl = (id: string, score: number): Player => ({ id, name: id, avatar: null, color: null, score, connected: true });

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
