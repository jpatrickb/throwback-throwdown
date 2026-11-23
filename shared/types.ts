// Shared contract between server and all three clients (/tv, /play, /host).
// The server is authoritative: clients send intents, the server replies with
// role-specific "view" snapshots. Change this file deliberately — every
// workstream depends on it.

export type Phase =
  | 'LOBBY'
  | 'PHOTO_REVEAL'
  | 'CAPTIONING'
  | 'VOTING'
  | 'RESULTS'
  | 'SCOREBOARD'
  | 'FINAL';

export interface Settings {
  captionSeconds: number; // default 75
  voteSeconds: number; // default 30
  maxCaptionLength: number; // default 80
  teamMode: boolean; // default true: one caption per team per photo, points go to teams
  teamCount: number; // default 5 (2..8); applied when teams are (re)built
  theme: ThemeId; // visual theme for TV AND phones (set from the TV settings panel or host)
}

// ---------- Themes ----------
// Each id maps to a [data-theme="<id>"] block in client/src/theme/tokens.css.
// The TV settings panel sets it (tv:setTheme); every screen applies view.settings.theme.
export type ThemeId = 'berry' | 'cork' | 'arcade' | 'picnic';
export const THEMES: { id: ThemeId; label: string }[] = [
  { id: 'berry', label: 'Berry Stage' },
  { id: 'cork', label: 'Cork Board' },
  { id: 'arcade', label: 'Retro Arcade' },
  { id: 'picnic', label: 'Sunny Picnic' },
];

// ---------- Teams ----------
// In team mode every player belongs to a team. Any member can submit or replace
// the team's caption; everyone votes individually but not for their own team;
// points go to the team. Assignment is automatic (see server engine), and the host
// can move players or reshuffle. Any member or the host can rename a team.
export interface Team {
  id: string;
  name: string;
  color: string; // CSS color for chips/cards; matches theme --team-N tokens
  score: number;
}

export interface Player {
  id: string; // public id, safe to show to others
  name: string;
  avatar: string | null; // stretch: avatar key
  color: string | null; // stretch: accent color
  score: number; // individual points (individual mode); 0-ish in team mode
  connected: boolean;
  teamId: string | null; // null in individual mode
}

export interface Photo {
  id: string;
  url: string; // e.g. /photos/<id>.jpg
  subject: string | null; // cousin's name, optional
  used: boolean;
}

export interface Caption {
  id: string;
  playerId: string; // individual mode: author. Team mode: whoever last edited it
  teamId: string | null; // team mode: the owning team (one caption per team per round)
  text: string;
  hidden: boolean; // host moderation
}

export interface Round {
  index: number; // 0-based
  photoId: string;
  captions: Caption[];
  votes: Record<string, string>; // voterPlayerId -> captionId
  subjectRevealed: boolean;
}

/** Full server-side state. Never sent to clients as-is. */
export interface GameState {
  roomCode: string;
  phase: Phase;
  players: Record<string, Player>;
  teams: Team[]; // empty in individual mode
  photos: Photo[]; // queue, in host-chosen order
  rounds: Round[];
  deadline: number | null; // epoch ms when current timed phase ends
  settings: Settings;
}

// ---------- Views (server -> client snapshots) ----------

/** Caption as shown during VOTING: anonymous. */
export interface AnonCaption {
  id: string;
  text: string;
}

/** Caption as shown during RESULTS: revealed. */
export interface ScoredCaption {
  id: string;
  text: string;
  playerId: string;
  playerName: string; // team mode: last editor's name
  teamId: string | null;
  teamName: string | null; // team mode: show this as the author
  votes: number;
  points: number; // points awarded this round
}

export interface RoundView {
  index: number;
  totalPhotosQueued: number;
  photo: Photo;
  subjectRevealed: boolean;
  submittedPlayerIds: string[]; // CAPTIONING: who has submitted
  submittedTeamIds: string[]; // CAPTIONING, team mode: which teams have a caption
  votedPlayerIds: string[]; // VOTING: who has voted
  captions: AnonCaption[] | null; // VOTING only (shuffled)
  results: ScoredCaption[] | null; // RESULTS and later
}

interface BaseView {
  roomCode: string;
  phase: Phase;
  deadline: number | null;
  serverNow: number; // lets clients correct clock skew for countdowns
  players: Player[]; // sorted by score desc, then name
  teams: TeamView[]; // sorted by score desc; empty in individual mode
  round: RoundView | null;
  settings: Settings;
}

export interface TeamView extends Team {
  memberIds: string[]; // player ids, join order
}

export interface TvView extends BaseView {
  role: 'tv';
  joinUrl: string; // what the QR code encodes (includes ?room=)
  joinQrDataUrl: string; // PNG data URL of the QR code
  lanJoinUrl: string | null; // fallback LAN URL, shown small
}

export interface PlayerView extends BaseView {
  role: 'player';
  me: Player;
  myTeam: TeamView | null; // team mode
  myCaption: string | null; // current round; team mode: the team's current caption
  myCaptionEditedBy: string | null; // team mode: name of whoever last set the team caption
  myVoteCaptionId: string | null; // current round
  myCaptionId: string | null; // so the vote screen can disable own (team's) caption
}

export interface HostView extends BaseView {
  role: 'host';
  photos: Photo[]; // full queue incl. used
  allCaptions: Caption[] | null; // current round, with authors (moderation)
  joinUrl: string;
}

export type View = TvView | PlayerView | HostView;

// ---------- Client -> server events ----------

export type HostAction =
  | { type: 'start' } // LOBBY -> PHOTO_REVEAL (uses next unused photo)
  | { type: 'next' } // advance to the next phase
  | { type: 'nextRound' } // SCOREBOARD -> PHOTO_REVEAL
  | { type: 'end' } // -> FINAL
  | { type: 'reset' } // FINAL -> LOBBY, scores cleared
  | { type: 'addTime'; seconds: number }
  | { type: 'revealSubject' }
  | { type: 'hideCaption'; captionId: string; hidden: boolean }
  | { type: 'kick'; playerId: string }
  | { type: 'rename'; playerId: string; name: string }
  | { type: 'adjustScore'; playerId: string; delta: number }
  | { type: 'reorderPhotos'; photoIds: string[] }
  | { type: 'setSubject'; photoId: string; subject: string | null }
  | { type: 'removePhoto'; photoId: string }
  | { type: 'updateSettings'; settings: Partial<Settings> }
  | { type: 'moveToTeam'; playerId: string; teamId: string }
  | { type: 'shuffleTeams' } // random balanced reassignment (LOBBY or between rounds)
  | { type: 'renameTeam'; teamId: string; name: string };

export type Ack<T = object> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void;

export interface ClientToServerEvents {
  'tv:hello': () => void;
  'tv:setTheme': (p: { theme: ThemeId }, ack: Ack) => void; // only sockets that sent tv:hello
  'player:join': (
    p: { roomCode: string; name: string; token?: string; avatar?: string; color?: string },
    ack: Ack<{ playerId: string; token: string }>,
  ) => void;
  'player:caption': (p: { text: string }, ack: Ack) => void;
  'player:vote': (p: { captionId: string }, ack: Ack) => void;
  'player:react': (p: { emoji: string }) => void; // stretch
  'player:setAvatar': (p: { avatar: string | null; color: string | null }, ack: Ack) => void; // stretch
  'player:renameTeam': (p: { name: string }, ack: Ack) => void; // team mode: rename own team
  'host:auth': (p: { pin: string }, ack: Ack) => void;
  'host:action': (a: HostAction, ack: Ack) => void;
}

export interface ServerToClientEvents {
  view: (v: View) => void;
  reaction: (r: { playerId: string; emoji: string }) => void; // stretch, TV only
  kicked: () => void;
}

export const DEFAULT_SETTINGS: Settings = {
  captionSeconds: 75,
  voteSeconds: 30,
  maxCaptionLength: 80,
  teamMode: true,
  teamCount: 5,
  theme: 'berry',
};

/** Preset team names/colors; teams can rename themselves. Order = team number. */
export const TEAM_PRESETS: { name: string; color: string }[] = [
  { name: 'The Mullets', color: '#ff5fa2' },
  { name: 'Team Scrunchie', color: '#4fb3ff' },
  { name: 'The Bowl Cuts', color: '#ffcc33' },
  { name: 'Overall Champs', color: '#3ddcb4' },
  { name: 'The Velcro Kids', color: '#ff8a3d' },
  { name: 'Slap Bracelets', color: '#b07cff' },
  { name: 'The Jelly Shoes', color: '#ff6b6b' },
  { name: 'Team Lunchbox', color: '#8fd14f' },
];

export const POINTS_PER_VOTE = 100;
export const SWEEP_BONUS = 200;
