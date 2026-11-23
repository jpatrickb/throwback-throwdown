// Final: podium reveal (3rd, 2nd, 1st), champion celebration, full standings.
import { useEffect, useState, type CSSProperties } from 'react';
import { motion } from 'motion/react';
import type { TvView } from '../../../shared/types.ts';
import { playSfx } from '../audio/index.ts';
import { Badge, Doodle, Logo, initials } from './common.tsx';
import { entrants, isTeamMode } from './entrants.ts';
import { cannons, burst } from './confetti.ts';
import { byScore, ranks } from './ranking.ts';
import { SPRING_POP, TIMING } from './motion.ts';

const PLACE_ORDER = [1, 0, 2]; // podium layout: 2nd, 1st, 3rd

export function Final({ view }: { view: TvView }) {
  // Teams in team mode, players otherwise (see entrants.ts).
  const teamMode = isTeamMode(view);
  const sorted = entrants(view).sort(byScore);
  const rk = ranks(sorted);
  const top = sorted.slice(0, 3);
  const champs = sorted.filter((_, i) => rk[i] === 1);
  // shown = how many podium spots revealed, starting from 3rd place
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const n = top.length;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let k = 0; k < n; k++) {
      const at = 700 + k * TIMING.finalPodiumStep + (k === n - 1 ? 600 : 0);
      timers.push(
        setTimeout(() => {
          setShown(k + 1);
          // Reveals go 3rd → 2nd → 1st; the slot being revealed is n - k (3, 2, 1).
          const slot = n - k;
          playSfx(slot === 3 ? 'podium3' : slot === 2 ? 'podium2' : 'podium1');
          if (slot === 1) {
            // podium1 hits first, then the champion celebration.
            timers.push(setTimeout(() => playSfx('champion'), 900));
            cannons();
            timers.push(setTimeout(() => burst(0.5, 0.35, 1.4), 400));
          }
        }, at),
      );
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top.length]);
  const revealedIdx = (i: number) => i >= top.length - shown; // top[i] revealed?
  const champDone = shown >= top.length && top.length > 0;

  return (
    <div className="screen final">
      <div className="final-head">
        <Logo size="sm" />
        {champDone ? (
          <motion.h2 className="champion-line" initial={{ scale: 0, rotate: -8 }} animate={{ scale: 1, rotate: -2 }} transition={SPRING_POP}>
            {champs.length > 1 ? 'Co-champions: ' : 'Champion: '}
            {champs.map((c) => c.name).join(' & ')}!
          </motion.h2>
        ) : (
          <h2 className="champion-line pending">And the champion is…</h2>
        )}
      </div>

      <div className={`final-body ${sorted.length > 12 ? 'final-crowd' : ''}`}>
        <div className="podium">
          {PLACE_ORDER.filter((i) => i < top.length).map((i) => {
            const p = top[i];
            const place = rk[i];
            const on = revealedIdx(i);
            return (
              <div key={p.id} className={`podium-col place-${Math.min(place, 3)} slot-${i + 1}`} style={{ '--pc': p.color } as CSSProperties}>
                <motion.div
                  className="podium-player"
                  initial={{ y: -400, opacity: 0 }}
                  animate={on ? { y: 0, opacity: 1 } : {}}
                  transition={{ type: 'spring', stiffness: 180, damping: 13 }}
                >
                  {place === 1 && <Doodle name="crown" className="podium-crown" />}
                  <Badge color={p.color} label={p.badge ?? initials(p.name)} className="avatar-xl" />
                  <span className={`podium-name ${p.name.length > 9 ? 'podium-name-long' : ''}`}>{p.name}</span>
                  <span className="podium-score">{p.score}</span>
                  {p.members.length > 0 && <span className="podium-members">{p.members.join(' · ')}</span>}
                </motion.div>
                <motion.div
                  className="podium-block"
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ delay: 0.2 + i * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                >
                  <span className="podium-place">{place}</span>
                </motion.div>
              </div>
            );
          })}
        </div>

        <motion.ol className={`standings paper-card ${teamMode ? 'standings-teams' : ''} ${sorted.length > 12 ? 'standings-2col' : ''} ${sorted.length > 26 ? 'standings-dense' : ''}`} initial={{ x: 300, opacity: 0 }} animate={champDone ? { x: 0, opacity: 1 } : {}} transition={{ delay: 0.8, ...SPRING_POP }}>
          <span className="tape tape-top" />
          <li className="standings-title">{teamMode ? 'Team standings' : 'Final standings'}</li>
          {sorted.map((p, i) => (
            <li key={p.id} className="standings-row" style={{ '--pc': p.color } as CSSProperties}>
              <span className="st-rank">{rk[i]}</span>
              <span className="st-name">
                {p.name}
                {p.members.length > 0 && <small className="st-members">{p.members.join(' · ')}</small>}
              </span>
              <span className="st-score">{p.score}</span>
            </li>
          ))}
        </motion.ol>
      </div>
    </div>
  );
}
