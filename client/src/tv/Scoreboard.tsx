// Leaderboard that starts in last round's order, then reshuffles (Motion `layout`).
// Ranks teams in team mode (with member names), players in individual mode.
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { motion } from 'motion/react';
import type { TvView } from '../../../shared/types.ts';
import { playSfx } from '../audio/index.ts';
import { Badge, CountUp, RoundHeader, initials } from './common.tsx';
import { byScore, ranks } from './ranking.ts';
import { entrantRoundPoints, entrants, isTeamMode } from './entrants.ts';
import { SPRING_SOFT, TIMING } from './motion.ts';

export function Scoreboard({ view }: { view: TvView }) {
  const round = view.round;
  const teamMode = isTeamMode(view);
  const pts = useMemo(() => entrantRoundPoints(round?.results ?? null, teamMode), [round, teamMode]);
  const rows = useMemo(
    () => entrants(view).map((e) => ({ ...e, prev: e.score - (pts[e.id] ?? 0), gained: pts[e.id] ?? 0 })),
    [view, pts],
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
  // Teams: one column of tall rows. Players: 1 column up to 8, 2 up to 16, then 3.
  const cols = teamMode ? 1 : sorted.length > 16 ? 3 : sorted.length > 8 ? 2 : 1;

  return (
    <div className="screen scoreboard">
      {round ? <RoundHeader index={round.index} total={round.totalPhotosQueued} title={teamMode ? 'Team standings' : 'Scoreboard'} /> : <h2 className="phase-title">Scoreboard</h2>}
      <ol
        className={`leaderboard lb-cols-${cols} ${teamMode ? 'lb-teams' : ''}`}
        style={{ '--rows': Math.ceil(sorted.length / cols), '--cols': cols } as CSSProperties}
      >
        {sorted.map((e, i) => (
          <motion.li
            key={e.id}
            layout
            transition={SPRING_SOFT}
            className={`lb-row ${rk[i] === 1 ? 'lb-leader' : ''} ${e.connected ? '' : 'offline'}`}
            style={{ '--pc': e.color } as CSSProperties}
            initial={{ opacity: 0, x: -80 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <span className="lb-rank">{rk[i]}</span>
            <Badge color={e.color} label={e.badge ?? initials(e.name)} />
            <span className="lb-name-wrap">
              <span className="lb-name">{e.name}</span>
              {e.members.length > 0 && <span className="lb-members">{e.members.join(' · ')}</span>}
            </span>
            {e.gained > 0 && (
              <motion.span className="lb-gain" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3 + i * 0.05 }}>
                +{e.gained}
              </motion.span>
            )}
            <span className="lb-score">{settled ? <CountUp from={e.prev} to={e.score} /> : e.prev}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
