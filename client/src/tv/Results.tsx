// Results: captions are revealed from fewest to most votes. Each card shows its
// text, tallies its votes, then flips to show the author. Winner(s) get confetti.
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { ScoredCaption, TvView } from '../../../shared/types.ts';
import { playSfx } from '../audio/index.ts';
import { CountUp, Doodle, Polaroid, RoundHeader, playerColor } from './common.tsx';
import { burst } from './confetti.ts';
import { SPRING_POP, TIMING } from './motion.ts';
import { captionDensity } from './Voting.tsx';

export interface RevealPlan {
  /** Captions in reveal order (fewest votes first). */
  order: ScoredCaption[];
  /** Ids of the winning caption(s); empty when nobody got a vote. */
  winners: Set<string>;
  /** Groups revealed together, one per step (all tied winners share the last step). */
  steps: ScoredCaption[][];
}

export function planReveal(results: ScoredCaption[]): RevealPlan {
  const order = [...results].sort((a, b) => a.votes - b.votes || b.text.length - a.text.length);
  const max = Math.max(0, ...order.map((c) => c.votes));
  const winners = new Set(max > 0 ? order.filter((c) => c.votes === max).map((c) => c.id) : []);
  const steps: ScoredCaption[][] = order.filter((c) => !winners.has(c.id)).map((c) => [c]);
  const w = order.filter((c) => winners.has(c.id));
  if (w.length) steps.push(w);
  return { order, winners, steps };
}

export function Results({ view }: { view: TvView }) {
  const round = view.round!;
  const results = round.results ?? [];
  const plan = useMemo(() => planReveal(results), [results]);
  const [step, setStep] = useState(0); // number of steps revealed
  const done = step >= plan.steps.length;

  useEffect(() => {
    setStep(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = TIMING.resultsFirstDelay;
    plan.steps.forEach((group, i) => {
      const isWinnerStep = group.some((c) => plan.winners.has(c.id));
      if (isWinnerStep && i > 0) t += TIMING.resultsWinnerHold - TIMING.resultsPerCaption;
      timers.push(setTimeout(() => setStep(i + 1), t));
      t += TIMING.resultsPerCaption;
    });
    return () => timers.forEach(clearTimeout);
  }, [plan, round.index]);

  const revealed = plan.steps.slice(0, step).flat();
  const losers = revealed.filter((c) => !plan.winners.has(c.id));
  const winners = revealed.filter((c) => plan.winners.has(c.id));
  const nextIsWinner = !done && plan.steps[step]?.some((c) => plan.winners.has(c.id));
  const subject = round.subjectRevealed && round.photo.subject ? round.photo.subject : null;
  const density = captionDensity(results.length, Math.max(0, ...results.map((c) => c.text.length)));

  const tough = results.length <= 1;
  return (
    <div className="screen results">
      <RoundHeader index={round.index} total={round.totalPhotosQueued} title="And the votes are in…" />
      <div className="results-body">
        <div className="results-left">
          <Polaroid
            src={round.photo.url}
            tilt={-3}
            className="polaroid-small"
            label={
              <AnimatePresence mode="wait">
                {subject && done ? (
                  <motion.span key="s" className="subject-name" initial={{ scale: 0, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={SPRING_POP}>
                    It’s {subject}!
                  </motion.span>
                ) : (
                  <motion.span key="q" exit={{ opacity: 0 }}>?</motion.span>
                )}
              </AnimatePresence>
            }
          />
          {tough && (
            <motion.p className="tough-crowd" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...SPRING_POP, delay: 0.4 }}>
              {results.length === 0 ? 'Tough crowd! Nobody wrote a caption 🦗' : 'Only one brave soul this round!'}
            </motion.p>
          )}
        </div>

        <div className={`results-list density-${density}`}>
          <ul className="loser-list">
            <AnimatePresence>
              {losers.map((c) => (
                <ResultCard key={c.id} caption={c} />
              ))}
            </AnimatePresence>
          </ul>
          {nextIsWinner && (
            <motion.p className="drumroll" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: [1, 1.08, 1] }} transition={{ scale: { repeat: Infinity, duration: 0.5 } }}>
              🥁 And the winner is…
            </motion.p>
          )}
          <div className="winner-zone">
            {winners.map((c) => (
              <ResultCard key={c.id} caption={c} winner tie={plan.winners.size > 1} />
            ))}
          </div>
          {done && results.length > 0 && plan.winners.size === 0 && (
            <motion.p className="tough-crowd" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={SPRING_POP}>
              Zero votes?! Everybody’s a critic. 🙄
            </motion.p>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultCard({ caption, winner, tie }: { caption: ScoredCaption; winner?: boolean; tie?: boolean }) {
  const [stage, setStage] = useState(0); // 0 text, 1 votes tally, 2 author
  useEffect(() => {
    const timers = [
      setTimeout(() => setStage(1), 500),
      setTimeout(() => setStage(2), 500 + Math.min(1400, 400 + caption.votes * 250)),
    ];
    if (!winner) playSfx('cardDeal');
    // one tally blip per vote while the number counts up
    for (let v = 0; v < caption.votes; v++) timers.push(setTimeout(() => playSfx('tally'), 600 + v * 220));
    return () => timers.forEach(clearTimeout);
  }, [caption.votes, winner]);
  useEffect(() => {
    if (winner && stage === 2) {
      playSfx('winner');
      burst(0.62, 0.7, 1.2);
      const t = setTimeout(() => burst(0.4, 0.4, 0.8), 600);
      return () => clearTimeout(t);
    }
  }, [winner, stage]);
  const pc = playerColor({ id: caption.playerId, color: null });
  const El = winner ? motion.div : motion.li;
  return (
    <El
      layout
      className={`result-card paper-card ${winner ? 'winner-card' : ''}`}
      style={{ '--pc': pc } as CSSProperties}
      initial={winner ? { scale: 0.2, rotate: -12, opacity: 0 } : { x: 120, opacity: 0, rotate: 4 }}
      animate={{ scale: 1, x: 0, rotate: winner ? -1.5 : 0, opacity: 1 }}
      transition={winner ? { type: 'spring', stiffness: 200, damping: 12 } : SPRING_POP}
    >
      {winner && <Doodle name="crown" className="winner-crown" />}
      {winner && <span className="winner-ribbon">{tie ? 'Tied for the win!' : 'Winner!'}</span>}
      <span className="result-text">“{caption.text}”</span>
      <span className="result-meta">
        <motion.span className="vote-badge" animate={stage >= 1 ? { scale: [1, 1.25, 1] } : {}} transition={{ duration: 0.4 }}>
          {stage >= 1 ? <CountUp to={caption.votes} duration={Math.max(300, caption.votes * 220)} /> : 0}
          <small>{caption.votes === 1 ? ' vote' : ' votes'}</small>
        </motion.span>
        <AnimatePresence>
          {stage >= 2 && (
            <motion.span className="author" initial={{ rotateX: 90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} transition={{ duration: 0.35 }}>
              — {caption.playerName}
              {caption.points > 0 && <b className="points">+{caption.points}</b>}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </El>
  );
}
