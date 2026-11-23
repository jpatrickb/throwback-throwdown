// Leaderboard that starts in last round's order, then reshuffles (Motion `layout`).
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { motion } from 'motion/react';
import type { TvView } from '../../../shared/types.ts';
import { playSfx } from '../audio/index.ts';
import { Avatar, CountUp, RoundHeader, playerColor } from './common.tsx';
import { byScore, ranks, roundPoints } from './ranking.ts';
import { SPRING_SOFT, TIMING } from './motion.ts';

export function Scoreboard({ view }: { view: TvView }) {
  const round = view.round;
  const pts = useMemo(() => roundPoints(round?.results ?? null), [round]);
  const rows = useMemo(
    () => view.players.map((p) => ({ ...p, prev: p.score - (pts[p.id] ?? 0), gained: pts[p.id] ?? 0 })),
    [view.players, pts],
  );
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    setSettled(false);
    const t = setTimeout(() => {
      setSettled(true);
      playSfx('leaderboard');
    }, TIMING.scoreboardReorderDelay);
    return () => clearTimeout(t);
  }, [round?.index]);

  const sorted = [...rows].sort((a, b) => (settled ? byScore(a, b) : byScore({ ...a, score: a.prev }, { ...b, score: b.prev })));
  const rk = ranks(sorted.map((r) => ({ score: settled ? r.score : r.prev })));
  // 1 column up to 8, 2 up to 16, then 3 (25+ players).
  const cols = sorted.length > 16 ? 3 : sorted.length > 8 ? 2 : 1;

  return (
    <div className="screen scoreboard">
      {round ? <RoundHeader index={round.index} total={round.totalPhotosQueued} title="Scoreboard" /> : <h2 className="phase-title">Scoreboard</h2>}
      <ol className={`leaderboard lb-cols-${cols}`} style={{ '--rows': Math.ceil(sorted.length / cols), '--cols': cols } as CSSProperties}>
        {sorted.map((p, i) => (
          <motion.li
            key={p.id}
            layout
            transition={SPRING_SOFT}
            className={`lb-row ${rk[i] === 1 ? 'lb-leader' : ''} ${p.connected ? '' : 'offline'}`}
            style={{ '--pc': playerColor(p) } as CSSProperties}
            initial={{ opacity: 0, x: -80 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <span className="lb-rank">{rk[i]}</span>
            <Avatar player={p} />
            <span className="lb-name">{p.name}</span>
            {p.gained > 0 && (
              <motion.span className="lb-gain" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3 + i * 0.05 }}>
                +{p.gained}
              </motion.span>
            )}
            <span className="lb-score">{settled ? <CountUp from={p.prev} to={p.score} /> : p.prev}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
