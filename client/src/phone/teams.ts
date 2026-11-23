// Team-mode helpers shared by player and host screens.
import type { Player, TeamView, View } from '../../../shared/types.ts';

/** True when the room is playing in teams (setting on AND teams exist). */
export function isTeamMode(view: Pick<View, 'settings' | 'teams'>): boolean {
  return view.settings.teamMode && view.teams.length > 0;
}

export function teamById(teams: TeamView[], id: string | null | undefined): TeamView | null {
  return teams.find((t) => t.id === id) ?? null;
}

/** 1-based team rank with ties sharing a rank. */
export function teamRank(teams: TeamView[], teamId: string): number {
  const me = teams.find((t) => t.id === teamId);
  if (!me) return teams.length;
  return 1 + teams.filter((t) => t.score > me.score).length;
}

/** Members of a team in join order, resolved to players (skips unknown ids). */
export function membersOf(team: TeamView, players: Player[]): Player[] {
  return team.memberIds.map((id) => players.find((p) => p.id === id)).filter((p): p is Player => !!p);
}

/** Teams that count for "has a caption" progress: at least one connected member. */
export function activeTeams(teams: TeamView[], players: Player[]): TeamView[] {
  return teams.filter((t) => membersOf(t, players).some((p) => p.connected));
}

export const TEAM_NAME_MAX = 24;
