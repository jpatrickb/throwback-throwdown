import { useEffect, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Player, TvView } from '../../../shared/types.ts';
import { useFitText } from './fit.ts';
import { playSfx } from '../audio/index.ts';
import { CountdownRing, PlayerChip, Polaroid, RoundHeader } from './common.tsx';
import { TIMING } from './motion.ts';

/** Caption text size steps down as the number/length of captions grows. */
export function captionDensity(n: number, longest: number): 'xl' | 'lg' | 'md' | 'sm' | 'xs' {
  const load = n * Math.max(30, longest);
  if (n <= 3 && load < 200) return 'xl';
  if (n <= 6 && load < 420) return 'lg';
  if (n <= 8) return 'md';
  if (n <= 9 || load < 600) return 'sm';
  return 'xs';
}

/** Grid columns for n caption cards (tuned for 80-char captions on a 16:9 TV). */
export function voteColumns(n: number): number {
  if (n <= 2) return 1;
  if (n <= 8) return 2;
  if (n <= 12) return 3;
  if (n <= 20) return 4;
  return 5;
}

/** With a big crowd, the voted strip becomes a progress bar plus the few still voting. */
const CROWD = 12;

export function Voting({ view }: { view: TvView }) {
  const round = view.round!;
  const captions = round.captions ?? [];
  const voted = new Set(round.votedPlayerIds);
  // Vote sounds are automatic (audio's voteCast), so nothing to fire here.
  const n = captions.length;
  // Deal all cards within ~2.5s however many there are.
  const stagger = Math.min(TIMING.cardDealStagger, 2.5 / Math.max(1, n));

  useEffect(() => {
    // One deal sound per card, but no more than ~10 so 25 cards don't machine-gun.
    const every = Math.max(1, Math.ceil(n / 10));
    const timers = captions
      .map((_, i) => i)
      .filter((i) => i % every === 0)
      .map((i) => setTimeout(() => playSfx('cardDeal'), 200 + i * stagger * 1000));
    return () => timers.forEach(clearTimeout);
    // deal once per round
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.index]);

  const voters = [...view.players].filter((p) => p.connected || voted.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  const cols = voteColumns(n);
  const rows = Math.max(1, Math.ceil(n / cols));
  const dense = n > 8;
  const gridRef = useFitText<HTMLOListElement>([captions.map((c) => c.id + c.text).join('|')], { max: n <= 4 ? 2.4 : n <= 8 ? 1.9 : 1.6, min: 0.7 });

  return (
    <div className="screen voting">
      <RoundHeader index={round.index} total={round.totalPhotosQueued} title="Vote for the funniest!" />
      <div className={`voting-body ${n > 12 ? 'voting-xwide' : n >= 9 ? 'voting-wide' : ''}`}>
        <div className="voting-left">
          <Polaroid src={round.photo.url} label={n > 12 ? 'Vote!' : 'Pick a favorite!'} tilt={-4} className="polaroid-small" />
          <CountdownRing deadline={view.deadline} serverNow={view.serverNow} phase={view.phase} settings={view.settings} size="sm" />
        </div>
        {n === 0 ? (
          <p className="tough-crowd">No captions this time… tough crowd! 🦗</p>
        ) : (
          <ol ref={gridRef} className={`card-grid ${dense ? 'card-grid-dense' : ''}`} style={{ '--cols': cols, '--rows': rows } as CSSProperties}>
            {captions.map((c, i) => (
              <motion.li
                key={c.id}
                className="caption-card paper-card"
                style={{ '--tilt': `${((i * 53) % 7) - 3}deg`, '--tape': `var(--tape-${(i % 4) + 1})` } as CSSProperties}
                initial={{ x: '-60vw', y: '40vh', rotate: -40, opacity: 0 }}
                animate={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 160, damping: 18, delay: i * stagger }}
              >
                {!dense && <span className="tape tape-corner" />}
                <span className="card-num">{i + 1}</span>
                <span className="card-text fit-cell">{c.text}</span>
              </motion.li>
            ))}
          </ol>
        )}
      </div>
      <VoteProgress label="Voted" done={voted} people={voters} crowd={voters.length > CROWD} />
    </div>
  );
}

/** Who has voted/submitted. Small groups: a chip per person. Big groups: a progress bar,
 *  plus chips for the stragglers once only a few are left. */
export function VoteProgress({ label, done, people, crowd, className }: { label: string; done: Set<string>; people: Player[]; crowd: boolean; className?: string }) {
  const waiting = people.filter((p) => !done.has(p.id));
  const count = people.length - waiting.length;
  const showChips = !crowd || waiting.length <= 8;
  const chips = crowd ? waiting : people;
  return (
    <footer className={`voted-strip ${crowd ? 'voted-strip-crowd' : ''} ${className ?? ''}`}>
      <span className="voted-label">
        {label}: <b>{count}</b>/{people.length}
      </span>
      {crowd && (
        <span className="progress-bar" aria-hidden>
          <motion.span className="progress-fill" animate={{ width: `${(100 * count) / Math.max(1, people.length)}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
        </span>
      )}
      {crowd && showChips && waiting.length > 0 && <span className="voted-label waiting-label">Waiting on</span>}
      {showChips && (
        <ul className={`chip-row ${chips.length > 10 ? 'chip-row-crowd' : ''}`}>
          <AnimatePresence>
            {chips.map((p) => (
              <PlayerChip key={p.id} player={p} done={done.has(p.id)} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </footer>
  );
}
