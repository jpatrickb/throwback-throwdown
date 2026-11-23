// Howler-backed audio manager for the TV. Framework-free; index.ts wraps it in hooks.
//
// Rules it guarantees:
// - Nothing touches Web Audio until unlock(). Howler itself is loaded lazily then, so phones
//   never download it and the browser never logs an autoplay warning.
// - Before unlock, music requests are remembered (and start on unlock); SFX are dropped.
// - Missing or broken files fail silently. No method throws.
// - SFX have several takes: a random one plays, never the same take twice in a row.
// - Some moments are detected from the view alone and fire automatically (see detect()).
import type { Howl as HowlT } from 'howler';
import type { Phase, TvView } from '../../../shared/types.ts';
import type { SfxKey } from './index.ts';
import { AUDIO_TUNING as T, MUSIC, PHASE_MUSIC, RISING_STEPS, SFX, SFX_EXCLUSIVE, type MusicKey } from './cues.ts';

type HowlerModule = typeof import('howler');
interface Playing {
  key: MusicKey;
  howl: HowlT;
  id: number;
}

/** User-facing audio settings (TV settings panel, M and -/= keys). Persisted in localStorage. */
export interface AudioSettings {
  musicOn: boolean; // default true
  sfxOn: boolean; // default true
  master: number; // 0..1, default 0.8
  music: number; // 0..1 music level relative to master, default 1
  sfx: number; // 0..1 sfx level relative to master, default 1
}

export interface AudioSnapshot {
  settings: AudioSettings;
  volume: number; // = settings.master (kept for the indicator)
  muted: boolean; // music and sfx both off
  unlocked: boolean;
  /** Date.now() of the last volume/mute change, so the indicator can flash. */
  changedAt: number;
}

const STORAGE_KEY = 'tvAudio';
export interface SfxOptions {
  /** Step of a rising run (tally count-ups): 0 = base pitch, each step goes up the scale.
   *  Omit it and consecutive calls within the cue's risingRunMs rise automatically. */
  step?: number;
  gain?: number;
  rate?: number;
}
const TIMED_GRACE_MS = 1200; // phase left with <= this remaining counts as "time ran out"

const DEFAULT_SETTINGS: AudioSettings = { musicOn: true, sfxOn: true, master: T.defaultVolume, music: 1, sfx: 1 };
const unit = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);

function loadSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Record<string, unknown>;
      // v1 stored { volume, muted }; read it so nobody's volume resets.
      const muted = s.muted === true;
      return {
        musicOn: typeof s.musicOn === 'boolean' ? s.musicOn : !muted,
        sfxOn: typeof s.sfxOn === 'boolean' ? s.sfxOn : !muted,
        master: unit(s.master ?? s.volume, DEFAULT_SETTINGS.master),
        music: unit(s.music, 1),
        sfx: unit(s.sfx, 1),
      };
    }
  } catch {
    /* storage blocked or corrupt: use defaults */
  }
  return { ...DEFAULT_SETTINGS };
}

function snapshotOf(settings: AudioSettings, unlocked: boolean, changedAt: number): AudioSnapshot {
  return { settings, volume: settings.master, muted: !settings.musicOn && !settings.sfxOn, unlocked, changedAt };
}

function safe(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    if (import.meta.env.DEV) console.debug('[audio]', err);
  }
}

export class AudioManager {
  private mod: HowlerModule | null = null;
  private loading = false;
  private howls = new Map<string, HowlT>();
  private failed = new Set<string>();

  private wantedMusic: MusicKey | null = null;
  private current: Playing | null = null;
  private fadingOut = new Map<MusicKey, Playing>();
  private fadeTimers = new Map<MusicKey, ReturnType<typeof setTimeout>>();

  private ducked = false;
  private duckUntil = 0;
  private duckTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSfxAt = new Map<SfxKey, number>();
  private lastTake = new Map<SfxKey, number>();
  private runs = new Map<SfxKey, { take: number; step: number; at: number }>();
  private recent: { key: SfxKey; take: number; rate: number; at: number }[] = [];

  // view-diff state for auto-fired moments
  private prevView: TvView | null = null;
  private allInFired = new Set<string>();

  // countdown state
  private phase: Phase | null = null;
  private deadline: number | null = null;
  private skew = 0; // serverNow - Date.now()
  private lastTickSec: number | null = null;
  private timesUpFired = false;
  private sawTimeLeft = false;
  private sawBeforeLastCall = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  private snap: AudioSnapshot;
  private listeners = new Set<() => void>();

  constructor() {
    this.snap = snapshotOf(loadSettings(), false, 0);
  }

  // ---------- public API ----------

  unlock(): void {
    if (this.mod || this.loading) {
      // Already loaded: make sure the context is running (call is inside a user gesture).
      safe(() => {
        const ctx = this.mod?.Howler.ctx;
        if (ctx && ctx.state === 'suspended') void ctx.resume();
      });
      return;
    }
    this.loading = true;
    import('howler')
      .then((mod) => {
        this.mod = mod;
        safe(() => {
          mod.Howler.autoUnlock = true;
          mod.Howler.volume(this.snap.settings.master);
          const ctx = mod.Howler.ctx;
          if (ctx && ctx.state === 'suspended') void ctx.resume();
        });
        // Preload every cue so stingers fire instantly later.
        for (const k of Object.keys(SFX) as SfxKey[]) SFX[k].takes.forEach((src, i) => this.howl(`sfx:${k}:${i}`, src, false));
        for (const k of Object.keys(MUSIC) as MusicKey[]) this.howl(`music:${k}`, MUSIC[k].src, true);
        this.set({ unlocked: true });
        this.syncMusic();
      })
      .catch(() => {
        this.loading = false; // allow a retry on the next gesture
      });
  }

  /** Feed every TV view snapshot in. Drives music, the final-seconds ticks and auto-fired SFX. */
  setView(view: TvView | null): void {
    const prevPhase = this.phase;
    const nextPhase = view?.phase ?? null;

    // Server advanced the instant the timer expired: our interval may not have seen zero.
    if (prevPhase && nextPhase !== prevPhase && this.deadline && this.sawTimeLeft && !this.timesUpFired) {
      if (this.remainingMs() <= TIMED_GRACE_MS) this.fireTimesUp();
    }

    this.phase = nextPhase;
    this.setMusic(nextPhase ? PHASE_MUSIC[nextPhase] : null);

    const deadline = view?.deadline ?? null;
    if (view) this.skew = view.serverNow - Date.now();
    if (deadline !== this.deadline || nextPhase !== prevPhase) {
      this.deadline = deadline;
      this.lastTickSec = null;
      this.timesUpFired = false;
      this.sawTimeLeft = false;
      this.sawBeforeLastCall = false;
    }
    this.syncTimer();
    safe(() => this.detect(this.prevView, view));
    this.prevView = view;
  }

  setMusic(key: MusicKey | null): void {
    this.wantedMusic = key;
    this.syncMusic();
  }

  playSfx(key: SfxKey, opts: SfxOptions = {}): void {
    if (!this.mod) return; // not unlocked yet: drop it
    if (!this.snap.settings.sfxOn) return;
    // In team mode a new player lands on a team: one teamJoin instead of join + teamJoin.
    if (key === 'join' && this.prevView?.settings.teamMode && this.prevView.teams.length) key = 'teamJoin';
    const cue = SFX[key];
    if (!cue) return;
    const now = Date.now();
    if (cue.minGapMs && now - (this.lastSfxAt.get(key) ?? 0) < cue.minGapMs) return;
    if (this.blockedByGroup(key, now)) return;

    // Pick the take: keep it through a rising run, otherwise random but never the last one.
    const run = this.runs.get(key);
    const inRun = cue.risingRunMs !== undefined && (opts.step !== undefined ? opts.step > 0 : !!run && now - run.at < cue.risingRunMs);
    let take: number;
    let step = 0;
    if (inRun && run && !this.failed.has(`sfx:${key}:${run.take}`)) {
      take = run.take;
      step = opts.step ?? run.step + 1;
    } else {
      const ok = cue.takes.map((_, i) => i).filter((i) => !this.failed.has(`sfx:${key}:${i}`));
      if (!ok.length) return;
      const pool = ok.length > 1 ? ok.filter((i) => i !== this.lastTake.get(key)) : ok;
      take = pool[Math.floor(Math.random() * pool.length)];
      step = opts.step ?? 0;
    }
    if (cue.risingRunMs !== undefined) this.runs.set(key, { take, step, at: now });
    const howl = this.howl(`sfx:${key}:${take}`, cue.takes[take], false);
    if (!howl) return;
    this.lastSfxAt.set(key, now);
    this.lastTake.set(key, take);
    const semis = cue.risingRunMs !== undefined ? RISING_STEPS[Math.min(step, RISING_STEPS.length - 1)] : 0;
    const rate = (opts.rate ?? 1) * Math.pow(2, semis / 12);
    this.recent.push({ key, take: take + 1, rate: Math.round(rate * 1000) / 1000, at: now });
    if (this.recent.length > 60) this.recent.shift();
    safe(() => {
      const id = howl.play();
      howl.volume(Math.min(1, cue.volume * this.snap.settings.sfx * (opts.gain ?? 1)), id);
      if (rate !== 1) howl.rate(rate, id);
      if (cue.duck) this.duck((howl.duration() || 1.5) / rate);
    });
  }

  getSettings = (): AudioSettings => this.snap.settings;

  /** Apply and persist a settings change (live: music refades, master applies at once). */
  setSettings(patch: Partial<AudioSettings>): void {
    const cur = this.snap.settings;
    const next: AudioSettings = {
      musicOn: typeof patch.musicOn === 'boolean' ? patch.musicOn : cur.musicOn,
      sfxOn: typeof patch.sfxOn === 'boolean' ? patch.sfxOn : cur.sfxOn,
      master: Math.round(unit(patch.master, cur.master) * 100) / 100,
      music: Math.round(unit(patch.music, cur.music) * 100) / 100,
      sfx: Math.round(unit(patch.sfx, cur.sfx) * 100) / 100,
    };
    if ((Object.keys(next) as (keyof AudioSettings)[]).every((k) => next[k] === cur[k])) return;
    this.snap = snapshotOf(next, this.snap.unlocked, Date.now());
    for (const fn of this.listeners) safe(fn);
    safe(() => this.mod?.Howler.volume(next.master));
    if (next.musicOn !== cur.musicOn || next.music !== cur.music) this.fadeCurrentTo(250);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage blocked: setting lasts for this session only */
    }
  }

  /** -/= keys: master volume up/down (turning it up also unmutes). */
  nudgeVolume(dir: 1 | -1): void {
    const s = this.snap.settings;
    const unmute = dir > 0 && !s.musicOn && !s.sfxOn ? { musicOn: true, sfxOn: true } : {};
    this.setSettings({ ...unmute, master: s.master + dir * T.volumeStep });
  }

  /** M key: if anything is on, turn music and sfx off; if both are off, turn both on. */
  toggleMute(): void {
    const s = this.snap.settings;
    const anyOn = s.musicOn || s.sfxOn;
    this.setSettings({ musicOn: !anyOn, sfxOn: !anyOn });
  }

  getSnapshot = (): AudioSnapshot => this.snap;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** For dev tools and tests. */
  debugState() {
    return {
      ...this.snap,
      wantedMusic: this.wantedMusic,
      current: this.current?.key ?? null,
      currentVolume: this.current ? (this.current.howl.volume(this.current.id) as number) : null,
      fadingOut: [...this.fadingOut.keys()],
      ducked: this.ducked,
      failed: [...this.failed],
      phase: this.phase,
      remainingMs: this.deadline ? this.remainingMs() : null,
      recentSfx: this.recent.map((r) => `${r.key}#${r.take}${r.rate !== 1 ? `@${r.rate}` : ''}`),
    };
  }

  // ---------- internals ----------

  private set(patch: Partial<AudioSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const fn of this.listeners) safe(fn);
  }

  private howl(id: string, src: string[], loop: boolean): HowlT | null {
    if (!this.mod || this.failed.has(id) || !src.length) return null;
    let h = this.howls.get(id);
    if (h) return h;
    try {
      h = new this.mod.Howl({
        src,
        loop,
        volume: 1, // per-play volume is set on the sound id
        preload: true,
        onloaderror: () => this.markFailed(id),
      });
    } catch {
      this.markFailed(id);
      return null;
    }
    this.howls.set(id, h);
    return h;
  }

  /** SFX_EXCLUSIVE: skip `key` if a higher-priority (or, with firstWins, any) group mate just played. */
  private blockedByGroup(key: SfxKey, now: number): boolean {
    for (const g of SFX_EXCLUSIVE) {
      const idx = g.keys.indexOf(key);
      if (idx < 0) continue;
      for (let j = 0; j < g.keys.length; j++) {
        const other = g.keys[j];
        if (other === key) continue;
        if (now - (this.lastSfxAt.get(other) ?? 0) >= g.windowMs) continue;
        if (g.firstWins || j < idx) return true;
      }
    }
    return false;
  }

  /** Moments the TV doesn't have to call: diff the previous view against the new one. */
  private detect(prev: TvView | null, view: TvView | null): void {
    if (!prev || !view) return;
    const round = view.round?.index ?? -1;
    const sameRound = (prev.round?.index ?? -1) === round;

    // allIn: the last caption or vote landed. The server advances the phase the moment everyone is
    // done, so the "all in" state usually arrives in the next phase's first view (same round).
    let allIn = false;
    for (const kind of ['caption', 'vote'] as const) {
      const phase = kind === 'caption' ? 'CAPTIONING' : 'VOTING';
      const id = `${round}:${kind}`;
      if (prev.phase === phase && sameRound && !this.allInFired.has(id) && !isAllIn(prev, kind) && isAllIn(view, kind)) {
        this.allInFired.add(id);
        allIn = true;
        this.playSfx('allIn');
      }
    }

    // voteCast: a vote came in (subtle blip; the last one is covered by allIn).
    if (!allIn && prev.phase === 'VOTING' && view.phase === 'VOTING' && sameRound) {
      if ((view.round?.votedPlayerIds.length ?? 0) > (prev.round?.votedPlayerIds.length ?? 0)) this.playSfx('voteCast');
    }

    // teamJoin: someone landed on (or moved to) a team in the lobby.
    if (view.phase === 'LOBBY' && prev.phase === 'LOBBY') {
      const before = new Map(prev.players.map((p) => [p.id, p.teamId]));
      if (view.players.some((p) => p.teamId && before.get(p.id) !== p.teamId)) this.playSfx('teamJoin');
    }

    // teamRename: a team's name changed.
    const names = new Map(prev.teams.map((t) => [t.id, t.name]));
    if (view.teams.some((t) => names.has(t.id) && names.get(t.id) !== t.name)) this.playSfx('teamRename');

    // whoosh: every phase change (lower priority than allIn/timesUp/reveal/roundStart/champion).
    if (prev.phase !== view.phase) this.playSfx('whoosh');
  }

  private markFailed(id: string): void {
    if (import.meta.env.DEV) console.info(`[audio] could not load ${id}; skipping it`);
    this.failed.add(id);
    const h = this.howls.get(id);
    this.howls.delete(id);
    safe(() => h?.unload());
    if (this.current && `music:${this.current.key}` === id) this.current = null;
  }

  private musicTarget(key: MusicKey): number {
    const s = this.snap.settings;
    return s.musicOn ? MUSIC[key].volume * s.music * (this.ducked ? T.duckLevel : 1) : 0;
  }

  private syncMusic(): void {
    if (!this.mod) return;
    const key = this.wantedMusic;
    if (this.current?.key === key) return;

    if (this.current) this.fadeOut(this.current);
    this.current = null;
    if (!key) return;

    const howl = this.howl(`music:${key}`, MUSIC[key].src, true);
    if (!howl) return;
    const target = this.musicTarget(key);
    const reviving = this.fadingOut.get(key);
    safe(() => {
      if (reviving && reviving.howl === howl) {
        // Switched back before the fade-out finished: fade the same sound back up.
        this.fadingOut.delete(key);
        clearTimeout(this.fadeTimers.get(key));
        howl.fade(howl.volume(reviving.id) as number, target, T.crossfadeMs, reviving.id);
        this.current = reviving;
      } else {
        const id = howl.play();
        howl.volume(0, id);
        howl.fade(0, target, T.crossfadeMs, id);
        this.current = { key, howl, id };
      }
    });
  }

  private fadeOut(p: Playing): void {
    this.fadingOut.set(p.key, p);
    safe(() => p.howl.fade(p.howl.volume(p.id) as number, 0, T.crossfadeMs, p.id));
    clearTimeout(this.fadeTimers.get(p.key));
    this.fadeTimers.set(
      p.key,
      setTimeout(() => {
        if (this.fadingOut.get(p.key) !== p) return;
        this.fadingOut.delete(p.key);
        safe(() => p.howl.stop(p.id));
      }, T.crossfadeMs + 60),
    );
  }

  private duck(seconds: number): void {
    this.duckUntil = Math.max(this.duckUntil, Date.now() + seconds * 1000);
    if (!this.ducked) {
      this.ducked = true;
      this.fadeCurrentTo(T.duckInMs);
    }
    if (this.duckTimer) clearTimeout(this.duckTimer);
    this.duckTimer = setTimeout(() => {
      this.duckTimer = null;
      this.ducked = false;
      this.fadeCurrentTo(T.duckOutMs);
    }, Math.max(0, this.duckUntil - Date.now()));
  }

  private fadeCurrentTo(ms: number): void {
    const c = this.current;
    if (!c) return;
    safe(() => c.howl.fade(c.howl.volume(c.id) as number, this.musicTarget(c.key), ms, c.id));
  }

  private remainingMs(): number {
    return this.deadline ? this.deadline - (Date.now() + this.skew) : 0;
  }

  private syncTimer(): void {
    if (this.deadline && !this.timer) {
      this.timer = setInterval(() => this.onTimer(), 100);
    } else if (!this.deadline && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private onTimer(): void {
    if (!this.deadline) return;
    const ms = this.remainingMs();
    if (ms > 0) {
      this.sawTimeLeft = true;
      const sec = Math.ceil(ms / 1000);
      if (sec > T.lastCallSeconds) this.sawBeforeLastCall = true;
      if (sec <= T.tickFromSeconds && sec !== this.lastTickSec) {
        this.lastTickSec = sec;
        if (sec === T.lastCallSeconds && this.sawBeforeLastCall) {
          this.playSfx('lastCall');
        } else {
          const urgent = sec <= T.urgentTicks;
          this.playSfx('tick', urgent ? { gain: 1.4, rate: 1.25 } : {});
        }
      }
    } else if (this.sawTimeLeft && !this.timesUpFired) {
      this.fireTimesUp();
    }
  }

  private fireTimesUp(): void {
    this.timesUpFired = true;
    if (T.autoTimesUp) this.playSfx('timesUp');
  }
}

/** Has every eligible player (or team, in team mode) captioned / voted? Needs at least one. */
function isAllIn(view: TvView, kind: 'caption' | 'vote'): boolean {
  const r = view.round;
  if (!r) return false;
  const online = view.players.filter((p) => p.connected);
  if (!online.length) return false;
  if (kind === 'vote') {
    const voted = new Set(r.votedPlayerIds);
    return online.every((p) => voted.has(p.id));
  }
  if (view.settings.teamMode && view.teams.length) {
    const onlineIds = new Set(online.map((p) => p.id));
    const teamOf = new Map(view.players.map((p) => [p.id, p.teamId]));
    const done = new Set<string>(r.submittedTeamIds ?? []);
    for (const id of r.submittedPlayerIds) {
      const t = teamOf.get(id);
      if (t) done.add(t);
    }
    const eligible = view.teams.filter((t) => t.memberIds.some((id) => onlineIds.has(id)));
    return eligible.length > 0 && eligible.every((t) => done.has(t.id));
  }
  const submitted = new Set(r.submittedPlayerIds);
  return online.every((p) => submitted.has(p.id));
}

export const audio = new AudioManager();
