import { useEffect, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { TvView } from '../../../shared/types.ts';
import { playSfx } from '../audio/index.ts';
import { CountdownRing, PlayerChip, Polaroid, RoundHeader, useSfxOnIncrease } from './common.tsx';
import { TIMING } from './motion.ts';

/** Caption text size steps down as the number/length of captions grows. */
export function captionDensity(n: number, longest: number): 'xl' | 'lg' | 'md' | 'sm' {
  const load = n * Math.max(30, longest);
  if (n <= 3 && load < 200) return 'xl';
  if (n <= 6 && load < 420) return 'lg';
  if (n <= 9) return 'md';
  return 'sm';
}

export function Voting({ view }: { view: TvView }) {
  const round = view.round!;
  const captions = round.captions ?? [];
  const voted = new Set(round.votedPlayerIds);
  useSfxOnIncrease(voted.size, 'submit');

  useEffect(() => {
    const timers = captions.map((_, i) => setTimeout(() => playSfx('cardDeal'), 200 + i * TIMING.cardDealStagger * 1000));
    return () => timers.forEach(clearTimeout);
    // deal once per round
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.index]);

  const voters = [...view.players].filter((p) => p.connected || voted.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  const density = captionDensity(captions.length, Math.max(0, ...captions.map((c) => c.text.length)));

  return (
    <div className="screen voting">
      <RoundHeader index={round.index} total={round.totalPhotosQueued} title="Vote for the funniest!" />
      <div className="voting-body">
        <div className="voting-left">
          <Polaroid src={round.photo.url} tilt={-4} className="polaroid-small" />
          <CountdownRing deadline={view.deadline} serverNow={view.serverNow} phase={view.phase} settings={view.settings} size="sm" />
        </div>
        {captions.length === 0 ? (
          <p className="tough-crowd">No captions this time… tough crowd! 🦗</p>
        ) : (
          <ol className={`card-grid density-${density} count-${Math.min(captions.length, 12)}`}>
            {captions.map((c, i) => (
              <motion.li
                key={c.id}
                className="caption-card paper-card"
                style={{ '--tilt': `${((i * 53) % 7) - 3}deg`, '--tape': `var(--tape-${(i % 4) + 1})` } as CSSProperties}
                initial={{ x: '-60vw', y: '40vh', rotate: -40, opacity: 0 }}
                animate={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 160, damping: 18, delay: i * TIMING.cardDealStagger }}
              >
                <span className="tape tape-corner" />
                <span className="card-num">{i + 1}</span>
                <span className="card-text">{c.text}</span>
              </motion.li>
            ))}
          </ol>
        )}
      </div>
      <footer className="voted-strip">
        <span className="voted-label">
          Voted: <b>{voted.size}</b>/{voters.length}
        </span>
        <ul className="chip-row">
          <AnimatePresence>
            {voters.map((p) => (
              <PlayerChip key={p.id} player={p} done={voted.has(p.id)} />
            ))}
          </AnimatePresence>
        </ul>
      </footer>
    </div>
  );
}
