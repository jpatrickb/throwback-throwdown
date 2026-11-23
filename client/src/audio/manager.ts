// Howler-backed audio manager for the TV. Framework-free; index.ts wraps it in hooks.
//
// Rules it guarantees:
// - Nothing touches Web Audio until unlock(). Howler itself is loaded lazily then, so phones
//   never download it and the browser never logs an autoplay warning.
// - Before unlock, music requests are remembered (and start on unlock); SFX are dropped.
// - Missing or broken files fail silently. No method throws.
import type { Howl as HowlT } from 'howler';
import type { Phase, TvView } from '../../../shared/types.ts';
import type { SfxKey } from './index.ts';
import { AUDIO_TUNING as T, MUSIC, PHASE_MUSIC, SFX, type Cue, type MusicKey } from './cues.ts';

type HowlerModule = typeof import('howler');
interface Playing {
  key: MusicKey;
  howl: HowlT;
  id: number;
}

export interface AudioSnapshot {
  volume: number; // 0..1 master
  muted: boolean;
  unlocked: boolean;
  /** Date.now() of the last volume/mute change, so the indicator can flash. */
  changedAt: number;
}

const STORAGE_KEY = 'tvAudio';
/** Stingers that should never double-fire (e.g. TV and the auto-timer both asking). */
const DEDUPE_MS: Partial<Record<SfxKey, number>> = {
  reveal: 1000,
  timesUp: 1500,
  winner: 1000,
  champion: 2000,
  leaderboard: 800,
};
const TIMED_GRACE_MS = 1200; // phase left with <= this remaining counts as "time ran out"

function loadSettings(): { volume: number; muted: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as { volume?: unknown; muted?: unknown };
      const volume = typeof s.volume === 'number' && s.volume >= 0 && s.volume <= 1 ? s.volume : T.defaultVolume;
      return { volume, muted: s.muted === true };
    }
  } catch {
    /* storage blocked or corrupt: use defaults */
  }
  return { volume: T.defaultVolume, muted: false };
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

  // countdown state
  private phase: Phase | null = null;
  private deadline: number | null = null;
  private skew = 0; // serverNow - Date.now()
  private lastTickSec: number | null = null;
  private timesUpFired = false;
  private sawTimeLeft = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  private snap: AudioSnapshot;
  private listeners = new Set<() => void>();

  constructor() {
    const s = loadSettings();
    this.snap = { ...s, unlocked: false, changedAt: 0 };
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
          mod.Howler.volume(this.snap.volume);
          mod.Howler.mute(this.snap.muted);
          const ctx = mod.Howler.ctx;
          if (ctx && ctx.state === 'suspended') void ctx.resume();
        });
        // Preload every cue so stingers fire instantly later.
        for (const k of Object.keys(SFX) as SfxKey[]) this.howl('sfx', k, SFX[k]);
        for (const k of Object.keys(MUSIC) as MusicKey[]) this.howl('music', k, MUSIC[k]);
        this.set({ unlocked: true });
        this.syncMusic();
      })
      .catch(() => {
        this.loading = false; // allow a retry on the next gesture
      });
  }

  /** Feed every TV view snapshot in. Drives music and the final-seconds ticks. */
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
    }
    this.syncTimer();
  }

  setMusic(key: MusicKey | null): void {
    this.wantedMusic = key;
    this.syncMusic();
  }

  playSfx(key: SfxKey, opts: { gain?: number; rate?: number } = {}): void {
    if (!this.mod) return; // not unlocked yet: drop it
    const cue = SFX[key];
    if (!cue) return;
    const gap = DEDUPE_MS[key];
    const now = Date.now();
    if (gap && now - (this.lastSfxAt.get(key) ?? 0) < gap) return;
    this.lastSfxAt.set(key, now);
    const howl = this.howl('sfx', key, cue);
    if (!howl) return;
    safe(() => {
      const id = howl.play();
      howl.volume(Math.min(1, cue.volume * (opts.gain ?? 1)), id);
      if (opts.rate) howl.rate(opts.rate, id);
      if (cue.duck) this.duck((howl.duration() || 1.5) / (opts.rate ?? 1));
    });
  }

  setVolume(v: number): void {
    const volume = Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
    safe(() => this.mod?.Howler.volume(volume));
    this.set({ volume, changedAt: Date.now() });
    this.persist();
  }

  nudgeVolume(dir: 1 | -1): void {
    if (this.snap.muted && dir > 0) this.setMuted(false);
    this.setVolume(this.snap.volume + dir * T.volumeStep);
  }

  setMuted(muted: boolean): void {
    safe(() => this.mod?.Howler.mute(muted));
    this.set({ muted, changedAt: Date.now() });
    this.persist();
  }

  toggleMute(): void {
    this.setMuted(!this.snap.muted);
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
    };
  }

  // ---------- internals ----------

  private set(patch: Partial<AudioSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const fn of this.listeners) safe(fn);
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume: this.snap.volume, muted: this.snap.muted }));
    } catch {
      /* storage blocked: setting lasts for this session only */
    }
  }

  private howl(kind: 'music' | 'sfx', key: string, cue: Cue): HowlT | null {
    const id = `${kind}:${key}`;
    if (!this.mod || this.failed.has(id) || !cue.src.length) return null;
    let h = this.howls.get(id);
    if (h) return h;
    try {
      h = new this.mod.Howl({
        src: cue.src,
        loop: cue.loop,
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

  private markFailed(id: string): void {
    if (import.meta.env.DEV) console.info(`[audio] could not load ${id}; skipping it`);
    this.failed.add(id);
    const h = this.howls.get(id);
    this.howls.delete(id);
    safe(() => h?.unload());
    if (this.current && `music:${this.current.key}` === id) this.current = null;
  }

  private musicTarget(key: MusicKey): number {
    return MUSIC[key].volume * (this.ducked ? T.duckLevel : 1);
  }

  private syncMusic(): void {
    if (!this.mod) return;
    const key = this.wantedMusic;
    if (this.current?.key === key) return;

    if (this.current) this.fadeOut(this.current);
    this.current = null;
    if (!key) return;

    const howl = this.howl('music', key, MUSIC[key]);
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
      if (sec <= T.tickFromSeconds && sec !== this.lastTickSec) {
        this.lastTickSec = sec;
        const urgent = sec <= T.urgentTicks;
        this.playSfx('tick', urgent ? { gain: 1.4, rate: 1.25 } : {});
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

export const audio = new AudioManager();
