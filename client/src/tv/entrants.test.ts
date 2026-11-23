import { describe, expect, it } from 'vitest';
import type { ScoredCaption } from '../../../shared/types.ts';
import { DEFAULT_SETTINGS, TEAM_PRESETS } from '../../../shared/types.ts';
import { entrantRoundPoints, isTeamMode, teamColor, teamInitials } from './entrants.ts';

const cap = (id: string, votes: number, playerId: string, teamId: string | null): ScoredCaption => ({
  id, text: id, playerId, playerName: playerId, teamId, teamName: teamId, votes, points: votes * 100,
});

describe('team helpers', () => {
  it('team mode needs both the setting and some teams', () => {
    const t = [{ id: 't1', name: 'A', color: '#000', score: 0, memberIds: [] }];
    expect(isTeamMode({ settings: { ...DEFAULT_SETTINGS, teamMode: true }, teams: t })).toBe(true);
    expect(isTeamMode({ settings: { ...DEFAULT_SETTINGS, teamMode: true }, teams: [] })).toBe(false);
    expect(isTeamMode({ settings: { ...DEFAULT_SETTINGS, teamMode: false }, teams: t })).toBe(false);
  });
  it('maps preset colours to theme tokens, passes others through', () => {
    expect(teamColor({ color: TEAM_PRESETS[2].color })).toBe(`var(--team-2, ${TEAM_PRESETS[2].color})`);
    expect(teamColor({ color: '#123456' })).toBe('#123456');
  });
  it('team initials skip The/Team', () => {
    expect(teamInitials('The Mullets')).toBe('M');
    expect(teamInitials('Team Scrunchie')).toBe('S');
    expect(teamInitials('The Bowl Cuts')).toBe('BC');
    expect(teamInitials('Team')).toBe('T');
  });
  it('round points go to teams in team mode, players otherwise', () => {
    const rs = [cap('a', 2, 'p1', 't1'), cap('b', 1, 'p2', 't2')];
    expect(entrantRoundPoints(rs, true)).toEqual({ t1: 200, t2: 100 });
    expect(entrantRoundPoints(rs, false)).toEqual({ p1: 200, p2: 100 });
  });
});
