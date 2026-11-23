// Shared TV building blocks: art images, polaroid, player chips, countdown ring, logo.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'motion/react';
import type { Player, Settings, Phase } from '../../../shared/types.ts';
import { ART, type DoodleKey } from '../theme/art.ts';
import { BRAND } from '../brand.ts';
import { useCountdown } from '../socket.ts';
import { playSfx, type SfxKey } from '../audio/index.ts';
import { SPRING_POP } from './motion.ts';

/** <img> that quietly disappears if the file is missing. */
export function ArtImg({ src, className, alt = '', style }: { src: string | null; className?: string; alt?: string; style?: CSSProperties }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return null;
  return <img src={src} alt={alt} className={className} style={style} onError={() => setBroken(true)} draggable={false} />;
}

export function Doodle({ name, className, style }: { name: DoodleKey; className?: string; style?: CSSProperties }) {
  return <ArtImg src={ART.doodles[name]} className={`doodle ${className ?? ''}`} style={style} />;
}

export function Logo({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  const [broken, setBroken] = useState(false);
  if (ART.logo && !broken) {
    return <img src={ART.logo} alt={BRAND.name} className={`logo-img logo-${size}`} onError={() => setBroken(true)} />;
  }
  return (
    <h1 className={`logo logo-${size}`} aria-label={BRAND.name}>
      {BRAND.name.split(' ').map((w, i) => (
        <span key={i} className="logo-word" style={{ '--i': i } as CSSProperties}>
          {w}
        </span>
      ))}
    </h1>
  );
}

export { playerColor } from './colors.ts';
import { playerColor } from './colors.ts';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)).toUpperCase();
}

/** Round avatar: the player's emoji avatar if they picked one, else initials. */
export function Avatar({ player, className }: { player: Player; className?: string }) {
  return (
    <span className={`avatar ${className ?? ''}`} style={{ '--pc': playerColor(player) } as CSSProperties}>
      {player.avatar ?? initials(player.name)}
    </span>
  );
}

/** Round badge for anything with a colour and short label (teams, entrants). */
export function Badge({ color, label, className }: { color: string; label: string; className?: string }) {
  return (
    <span className={`avatar ${className ?? ''}`} style={{ '--pc': color } as CSSProperties}>
      {label}
    </span>
  );
}

/** Name chip. `done` flips it to a check mark (submitted / voted). */
export function PlayerChip({ player, done, big }: { player: Player; done?: boolean; big?: boolean }) {
  return (
    <motion.li
      layout
      className={`chip ${done ? 'chip-done' : ''} ${player.connected ? '' : 'chip-offline'} ${big ? 'chip-big' : ''}`}
      style={{ '--pc': playerColor(player) } as CSSProperties}
      initial={{ scale: 0, rotate: -12 }}
      animate={{ scale: 1, rotate: 0 }}
      exit={{ scale: 0 }}
      transition={SPRING_POP}
    >
      <motion.span
        className="chip-face"
        key={done ? 'done' : 'wait'}
        initial={{ rotateY: 90 }}
        animate={{ rotateY: 0 }}
        transition={{ duration: 0.35 }}
      >
        {done ? '✓' : player.avatar ?? initials(player.name)}
      </motion.span>
      <span className="chip-name">{player.name}</span>
    </motion.li>
  );
}

/** Polaroid frame with a strip of washi tape. `label` is handwritten on the bottom strip. */
export function Polaroid({
  src,
  label,
  tilt = -2,
  className,
  children,
}: {
  src: string;
  label?: ReactNode;
  tilt?: number;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`polaroid ${className ?? ''}`} style={{ '--tilt': `${tilt}deg` } as CSSProperties}>
      <span className="tape tape-top" />
      <PolaroidPhoto src={src} />
      <div className="polaroid-label">{label}</div>
      {children}
    </div>
  );
}

/** Photo inside the polaroid: blurred copy fills the frame so portrait shots don't get black bars.
 *  If the file fails to load, shows a friendly placeholder instead of a broken image. */
function PolaroidPhoto({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  return (
    <div className="polaroid-photo" style={{ '--photo': `url("${src}")` } as CSSProperties}>
      {broken ? (
        <span className="photo-missing">📷 Photo went missing!</span>
      ) : (
        <img src={src} alt="Mystery cousin" draggable={false} onError={() => setBroken(true)} />
      )}
    </div>
  );
}

/** Big circular countdown. Turns urgent in the last 10s.
 *  Tick/timesUp sounds are NOT played here: the audio module fires them from view.deadline. */
export function CountdownRing({
  deadline,
  serverNow,
  phase,
  settings,
  size = 'lg',
}: {
  deadline: number | null;
  serverNow: number;
  phase: Phase;
  settings: Settings;
  size?: 'lg' | 'sm';
}) {
  const secs = useCountdown(deadline, serverNow);
  const total = phase === 'VOTING' ? settings.voteSeconds : settings.captionSeconds;
  if (secs === null) return null;
  const frac = Math.max(0, Math.min(1, secs / Math.max(total, secs, 1)));
  const urgent = secs <= 10;
  const R = 45;
  const C = 2 * Math.PI * R;
  return (
    <div className={`ring ring-${size} ${urgent ? 'ring-urgent' : ''}`} role="timer" aria-label={`${secs} seconds left`}>
      <svg viewBox="0 0 100 100">
        <circle className="ring-track" cx="50" cy="50" r={R} />
        <circle
          className="ring-bar"
          cx="50"
          cy="50"
          r={R}
          strokeDasharray={C}
          strokeDashoffset={C * (1 - frac)}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <motion.span
        key={urgent ? secs : 'n'}
        className={`ring-num ${secs === 0 ? 'ring-num-done' : ''}`}
        initial={urgent ? { scale: 1.6 } : false}
        animate={{ scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        {secs === 0 ? "Time's up!" : secs}
      </motion.span>
    </div>
  );
}

/** Fire an SFX whenever a count goes up (not on first render). */
export function useSfxOnIncrease(count: number, key: SfxKey) {
  const prev = useRef(count);
  useEffect(() => {
    if (count > prev.current) playSfx(key);
    prev.current = count;
  }, [count, key]);
}

/** Header strip shown on in-round screens: small logo + round badge + room code. */
export function RoundHeader({ index, total, title }: { index: number; total: number; title: ReactNode }) {
  return (
    <header className="round-header">
      <span className="round-badge">
        Round {index + 1}
        <small> of {Math.max(total, index + 1)}</small>
      </span>
      <h2 className="phase-title">{title}</h2>
      <span className="round-header-logo">{BRAND.shortName}</span>
    </header>
  );
}

/** Animated number that counts from `from` to `to`. */
export function CountUp({ from = 0, to, duration = 900 }: { from?: number; to: number; duration?: number }) {
  const [n, setN] = useState(from);
  useEffect(() => {
    if (to === from) {
      setN(to);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      setN(Math.round(from + (to - from) * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, duration]);
  return <>{n}</>;
}
