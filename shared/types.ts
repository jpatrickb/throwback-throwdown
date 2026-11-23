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
}

export interface Player {
  id: string; // public id, safe to show to others
  name: string;
  avatar: string | null; // stretch: avatar key
  color: string | null; // stretch: accent color
  score: number;
  connected: boolean;
}

export interface Photo {
  id: string;
  url: string; // e.g. /photos/<id>.jpg
  subject: string | null; // cousin's name, optional
  used: boolean;
}

export interface Caption {
  id: string;
  playerId: string;
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
  playerName: string;
  votes: number;
  points: number; // points awarded this round
}

export interface RoundView {
  index: number;
  totalPhotosQueued: number;
  photo: Photo;
  subjectRevealed: boolean;
  submittedPlayerIds: string[]; // CAPTIONING: who has submitted
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
  round: RoundView | null;
  settings: Settings;
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
  myCaption: string | null; // current round
  myVoteCaptionId: string | null; // current round
  myCaptionId: string | null; // so the vote screen can disable own caption
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
  | { type: 'updateSettings'; settings: Partial<Settings> };

export type Ack<T = object> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void;

export interface ClientToServerEvents {
  'tv:hello': () => void;
  'player:join': (
    p: { roomCode: string; name: string; token?: string },
    ack: Ack<{ playerId: string; token: string }>,
  ) => void;
  'player:caption': (p: { text: string }, ack: Ack) => void;
  'player:vote': (p: { captionId: string }, ack: Ack) => void;
  'player:react': (p: { emoji: string }) => void; // stretch
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
};

export const POINTS_PER_VOTE = 100;
export const SWEEP_BONUS = 200;
