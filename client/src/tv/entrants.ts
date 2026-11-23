// Team mode vs individual mode, in one place. An "entrant" is whoever scores:
// a team in team mode, a player in individual mode. Scoreboard and Final rank entrants.
import type { Player, ScoredCaption, Team, TeamView, TvView } from '../../../shared/types.ts';
import { TEAM_PRESETS } from '../../../shared/types.ts';
import { playerColor } from './colors.ts';

export function isTeamMode(view: Pick<TvView, 'settings' | 'teams'>): boolean {
  return view.settings.teamMode && view.teams.length > 0;
}

/** Team colour as a theme token (--team-N in tokens.css) when it's a preset colour, so a
 *  retheme in tokens.css carries over; otherwise the server-sent colour. */
export function teamColor(team: Pick<Team, 'color'>): string {
  const i = TEAM_PRESETS.findIndex((t) => t.color.toLowerCase() === team.color.toLowerCase());
  return i >= 0 ? `var(--team-${i}, ${team.color})` : team.color;
}

/** Short badge text for a team: initials of its words, skipping "The"/"Team". */
export function teamInitials(name: string): string {
  const words = name.split(/\s+/).filter((w) => w && !/^(the|team)$/i.test(w));
  const use = words.length ? words : name.split(/\s+/);
  return use.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/** In team mode, players without their own colour wear their team's colour everywhere. */
export function decorateView(view: TvView | null): TvView | null {
  if (!view || !isTeamMode(view)) return view;
  const byId = new Map(view.teams.map((t) => [t.id, t]));
  return {
    ...view,
    players: view.players.map((p) => {
      const t = p.teamId ? byId.get(p.teamId) : undefined;
      return t && !p.color ? { ...p, color: teamColor(t) } : p;
    }),
  };
}

export interface Entrant {
  id: string;
  name: string;
  score: number;
  color: string;
  /** Badge text: player avatar/initials, or team initials. */
  badge: string | null;
  connected: boolean;
  /** Team mode: member names (join order). Empty for players. */
  members: string[];
  isTeam: boolean;
}

export function entrants(view: TvView): Entrant[] {
  if (isTeamMode(view)) {
    const names = new Map(view.players.map((p) => [p.id, p]));
    return view.teams.map((t: TeamView) => ({
      id: t.id,
      name: t.name,
      score: t.score,
      color: teamColor(t),
      badge: teamInitials(t.name),
      connected: t.memberIds.some((id) => names.get(id)?.connected),
      members: t.memberIds.map((id) => names.get(id)?.name).filter((n): n is string => !!n),
      isTeam: true,
    }));
  }
  return view.players.map((p: Player) => ({
    id: p.id,
    name: p.name,
    score: p.score,
    color: playerColor(p),
    badge: p.avatar,
    connected: p.connected,
    members: [],
    isTeam: false,
  }));
}

/** Points each entrant earned this round (keyed by team id in team mode, player id otherwise). */
export function entrantRoundPoints(results: ScoredCaption[] | null, teamMode: boolean): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of results ?? []) {
    const k = teamMode && r.teamId ? r.teamId : r.playerId;
    out[k] = (out[k] ?? 0) + r.points;
  }
  return out;
}

/** Who to credit on a caption: the team in team mode, else the player. */
export function captionAuthor(c: ScoredCaption, view: Pick<TvView, 'teams'>): { name: string; color: string; editor: string | null } {
  const team = c.teamId ? view.teams.find((t) => t.id === c.teamId) : undefined;
  if (team || c.teamName) {
    return { name: c.teamName ?? team!.name, color: team ? teamColor(team) : playerColor({ id: c.playerId, color: null }), editor: c.playerName || null };
  }
  return { name: c.playerName, color: playerColor({ id: c.playerId, color: null }), editor: null };
}
