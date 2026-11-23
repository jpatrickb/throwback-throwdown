// Results, paced for big groups (see planReveal in ranking.ts):
// zero-vote captions all at once, low-vote captions by vote count, then 3rd and 2nd place
// one at a time, then a drumroll and the winner(s) with confetti. The header title narrates each beat.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { ScoredCaption, TvView } from '../../../shared/types.ts';
import { POINTS_PER_VOTE, SWEEP_BONUS } from '../../../shared/types.ts';
import { playSfx } from '../audio/index.ts';
import { CountUp, Doodle, Polaroid, RoundHeader } from './common.tsx';
import { captionAuthor } from './entrants.ts';
import { burst } from './confetti.ts';
import { SPRING_POP } from './motion.ts';
import { captionDensity } from './Voting.tsx';
import { planReveal, revealSchedule, DRUMROLL_MS, type Beat } from './ranking.ts';
import { useFitText } from './fit.ts';

/** More captions than this: low-vote captions go in a compact grid instead of a list. */
const CROWD = 8;

const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

function beatTitle(beat: Beat | undefined, place: string): ReactNode {
  if (!beat) return 'And the votes are in…';
  switch (beat.kind) {
    case 'zero':
      return beat.captions.length === 1 ? 'No votes… we still love you 💛' : `${beat.captions.length} with no votes… we still love you 💛`;
    case 'tier': {
      const vs = [...new Set(beat.captions.map((c) => c.votes))];
      return vs.length === 1 ? `${vs[0]} ${vs[0] === 1 ? 'vote' : 'votes'}` : `${Math.min(...vs)}–${Math.max(...vs)} votes`;
    }
    case 'drama':
      return `In ${place} place…`;
    case 'winner':
      return beat.captions.length > 1 ? 'It’s a tie for the win! 🏆' : 'The winner! 🏆';
  }
}

export function Results({ view }: { view: TvView }) {
  const round = view.round!;
  const results = round.results ?? [];
  // Keyed on content, not identity: the server re-sends views often and the reveal must not restart.
  const sig = results.map((r) => `${r.id}:${r.votes}:${r.playerName}`).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => planReveal(results), [sig]);
  const [step, setStep] = useState(0); // number of beats revealed
  const [drumroll, setDrumroll] = useState(false);
  const done = step >= plan.beats.length;

  useEffect(() => {
    setStep(0);
    setDrumroll(false);
    const { starts } = revealSchedule(plan);
    const timers = starts.map((t, i) =>
      setTimeout(() => {
        setDrumroll(false);
        setStep(i + 1);
        const b = plan.beats[i];
        if (b.kind === 'zero') playSfx('zeroVotes'); // once per zero-vote batch
        if (b.kind === 'tier') playSfx('tally');
      }, t),
    );
    const wi = plan.beats.findIndex((b) => b.kind === 'winner');
    if (wi > 0) timers.push(setTimeout(() => setDrumroll(true), starts[wi] - DRUMROLL_MS));
    if (wi >= 0) {
      // The drumroll sound (~1.6s, ends dry) is timed so the winner/tie sting lands right on its end.
      const hit = starts[wi] + winnerHitDelay(plan.beats[wi].captions[0].votes);
      timers.push(setTimeout(() => playSfx('drumroll'), Math.max(0, hit - DRUMROLL_SFX_LEAD_MS)));
    }
    return () => timers.forEach(clearTimeout);
  }, [plan, round.index]);

  const shown = plan.beats.slice(0, step);
  const revealedIds = new Set(shown.flatMap((b) => b.captions.map((c) => c.id)));
  const restAll = plan.beats.filter((b) => b.kind === 'zero' || b.kind === 'tier').flatMap((b) => b.captions);
  const dramaShown = shown.filter((b) => b.kind === 'drama').flatMap((b) => b.captions);
  const winners = shown.filter((b) => b.kind === 'winner').flatMap((b) => b.captions);
  const current = shown[shown.length - 1];
  // Drama beats go lowest first, so the i-th one shown is in place (winners + drama count - i).
  const placeOf = (c: ScoredCaption) => ordinal(plan.winners.size + plan.drama.size - dramaShown.indexOf(c));
  const title = drumroll ? '🥁 And the winner is…' : beatTitle(current, current?.kind === 'drama' ? placeOf(current.captions[0]) : '');

  const crowd = results.length > CROWD;
  const density = captionDensity(results.length, Math.max(0, ...results.map((c) => c.text.length)));
  const tough = results.length <= 1;

  return (
    <div className={`screen results ${crowd ? 'results-big' : ''}`}>
      <RoundHeader
        index={round.index}
        total={round.totalPhotosQueued}
        fitKey={String(title)}
        title={
          <AnimatePresence mode="wait">
            <motion.span key={String(title)} initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} transition={{ duration: 0.25 }}>
              {title}
            </motion.span>
          </AnimatePresence>
        }
      />
      <div className="results-body">
        <div className="results-left">
          <Polaroid src={round.photo.url} tilt={-3} className="polaroid-small" />
          {tough && (
            <motion.p className="tough-crowd" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...SPRING_POP, delay: 0.4 }}>
              {results.length === 0 ? 'Tough crowd! Nobody wrote a caption 🦗' : 'Only one brave soul this round!'}
            </motion.p>
          )}
        </div>

        <div className={`results-list density-${density}`}>
          {crowd ? (
            <RestGrid captions={restAll} revealed={revealedIds} view={view} />
          ) : (
            <ul className="loser-list">
              <AnimatePresence>
                {restAll
                  .filter((c) => revealedIds.has(c.id))
                  .map((c) => (
                    <ResultCard key={c.id} caption={c} author={captionAuthor(c, view)} />
                  ))}
              </AnimatePresence>
            </ul>
          )}
          {/* In big rounds, space for the top 3 is reserved up front so the grid above never resizes. */}
          <ul className="loser-list drama-list" style={crowd ? { minHeight: `${Math.max(0, plan.drama.size * 5.3 - 0.5)}em` } : undefined}>
            <AnimatePresence>
              {dramaShown.map((c) => (
                <ResultCard key={c.id} caption={c} author={captionAuthor(c, view)} place={placeOf(c)} sfx />
              ))}
            </AnimatePresence>
          </ul>
          <div className="winner-zone" style={crowd && plan.winners.size ? { minHeight: `${1.2 + plan.winners.size * 7.4}em` } : undefined}>
            {winners.map((c, i) => (
              <ResultCard key={c.id} caption={c} author={captionAuthor(c, view)} winner tie={plan.winners.size > 1} sfx={i === 0} />
            ))}
          </div>
          {done && results.length > 1 && plan.winners.size === 0 && (
            <motion.p className="tough-crowd" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={SPRING_POP}>
              Zero votes?! Everybody’s a critic. 🙄
            </motion.p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Compact grid for the low-vote captions. Every slot is laid out from the start (hidden until
 *  revealed) so the shared font size is fitted once and nothing jumps. */
function RestGrid({ captions, revealed, view }: { captions: ScoredCaption[]; revealed: Set<string>; view: TvView }) {
  const cols = captions.length > 12 ? 4 : captions.length > 6 ? 3 : 2;
  const rows = Math.max(1, Math.ceil(captions.length / cols));
  const ref = useFitText<HTMLOListElement>([captions.map((c) => c.id).join()], { max: 1.3, min: 0.55 });
  if (!captions.length) return null;
  return (
    <ol ref={ref} className="rest-grid" style={{ '--cols': cols, '--rows': rows } as CSSProperties}>
      {captions.map((c) => {
        const on = revealed.has(c.id);
        const a = captionAuthor(c, view);
        return (
          <motion.li
            key={c.id}
            className={`rest-card paper-card ${on ? '' : 'rest-hidden'}`}
            style={{ '--pc': a.color } as CSSProperties}
            initial={false}
            animate={on ? { scale: 1, opacity: 1, rotate: 0 } : { scale: 0.85, opacity: 0, rotate: -3 }}
            transition={SPRING_POP}
          >
            <span className="fit-cell rest-inner">
              <span className="rest-text">“{c.text}”</span>
              <span className="rest-meta">
                <b>{c.votes}</b> · {a.name}
              </span>
            </span>
          </motion.li>
        );
      })}
    </ol>
  );
}

type Author = ReturnType<typeof captionAuthor>;

/** How long after a card appears its author flips in (the winner "hit"). */
export function winnerHitDelay(votes: number): number {
  return 500 + Math.min(1400, 400 + votes * 200);
}
/** Start the drumroll this long before the winner hit (audio: ~1.6s take that ends dry). */
const DRUMROLL_SFX_LEAD_MS = 1500;

/** True when this caption's points include the clean-sweep bonus. */
export function isSweep(c: Pick<ScoredCaption, 'votes' | 'points'>): boolean {
  return c.votes > 0 && c.points >= c.votes * POINTS_PER_VOTE + SWEEP_BONUS;
}

function ResultCard({ caption, author, winner, tie, place, sfx }: { caption: ScoredCaption; author: Author; winner?: boolean; tie?: boolean; place?: string; sfx?: boolean }) {
  const [stage, setStage] = useState(0); // 0 text, 1 votes tally, 2 author
  const sweep = isSweep(caption);
  useEffect(() => {
    const timers = [
      setTimeout(() => setStage(1), 500),
      setTimeout(() => setStage(2), winnerHitDelay(caption.votes)),
    ];
    // Winner cards stay quiet while counting: the drumroll covers that build.
    if (sfx && !winner) {
      timers.push(setTimeout(() => playSfx('cardDeal'), 0)); // via a timer so StrictMode's re-run cancels it
      // one tally blip per vote while the number counts up (capped; audio raises the pitch per step)
      for (let v = 0; v < Math.min(caption.votes, 8); v++) timers.push(setTimeout(() => playSfx('tally', { step: v }), 600 + v * 160));
    }
    return () => timers.forEach(clearTimeout);
  }, [caption.votes, winner, sfx]);
  useEffect(() => {
    if (stage !== 2) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (winner && sfx) {
      // Only the lead winner card makes noise and confetti, so a tie doesn't double up.
      playSfx(tie ? 'tie' : 'winner');
      burst(0.62, 0.7, 1.2);
      timers.push(setTimeout(() => burst(0.4, 0.4, 0.8), 600));
    }
    if (sweep && (sfx || !winner)) timers.push(setTimeout(() => playSfx('sweep'), winner ? 1100 : 300));
    return () => timers.forEach(clearTimeout);
  }, [winner, stage, sfx, tie, sweep]);
  const pc = author.color;
  const El = winner ? motion.div : motion.li;
  return (
    <El
      layout
      className={`result-card paper-card ${winner ? 'winner-card' : ''} ${place ? 'drama-card' : ''}`}
      style={{ '--pc': pc } as CSSProperties}
      initial={winner ? { scale: 0.2, rotate: -12, opacity: 0 } : place ? { scale: 0.5, opacity: 0, rotate: -6 } : { x: 120, opacity: 0, rotate: 4 }}
      animate={{ scale: 1, x: 0, rotate: winner ? -1.5 : 0, opacity: 1 }}
      transition={winner ? { type: 'spring', stiffness: 200, damping: 12 } : SPRING_POP}
    >
      {winner && <Doodle name="crown" className="winner-crown" />}
      {winner && <span className="winner-ribbon">{tie ? 'Tied for the win!' : 'Winner!'}</span>}
      {place && <span className="place-ribbon">{place}</span>}
      <span className="result-text">“{caption.text}”</span>
      <span className="result-meta">
        <motion.span className="vote-badge" animate={stage >= 1 ? { scale: [1, 1.25, 1] } : {}} transition={{ duration: 0.4 }}>
          {stage >= 1 ? <CountUp to={caption.votes} duration={Math.max(300, Math.min(1200, caption.votes * 160))} /> : 0}
          <small>{caption.votes === 1 ? ' vote' : ' votes'}</small>
        </motion.span>
        <AnimatePresence>
          {stage >= 2 && (
            <motion.span className="author" initial={{ rotateX: 90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} transition={{ duration: 0.35 }}>
              — {author.name}
              {caption.points > 0 && <b className="points">+{caption.points}</b>}
              {author.editor && (winner || place) && <small className="written-by">written by {author.editor}</small>}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      {sweep && stage >= 2 && (
        <motion.b className="sweep-badge" initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: -5 }} transition={{ ...SPRING_POP, delay: winner ? 1.1 : 0.3 }}>
          🧹 Clean sweep! +{SWEEP_BONUS}
        </motion.b>
      )}
    </El>
  );
}
