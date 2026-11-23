import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import type { PlayerView } from '../../../../shared/types.ts';
import { Avatar } from '../Avatar.tsx';
import { COPY } from '../copy.ts';
import { rankOf } from './rank.ts';

/** RESULTS and SCOREBOARD: how you did this round and where you stand. */
export function Results({ view }: { view: PlayerView }) {
  const results = view.round?.results ?? [];
  const mine = results.find((r) => r.playerId === view.me.id) ?? null;
  const topVotes = Math.max(0, ...results.map((r) => r.votes));
  const won = !!mine && mine.votes > 0 && mine.votes === topVotes;
  const votedFor = results.find((r) => r.id === view.myVoteCaptionId) ?? null;
  const rank = rankOf(view.players, view.me.id);

  useEffect(() => {
    if (won && view.phase === 'RESULTS') {
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.35 }, disableForReducedMotion: true });
    }
  }, [won, view.phase, view.round?.index]);

  return (
    <section className="ph-stack">
      <div className={`ph-card ph-result${won ? ' ph-result--won' : ''}`}>
        {won && <div className="ph-result__banner">{COPY.results.winner}</div>}
        {mine ? (
          <>
            <p className="ph-quote">“{mine.text}”</p>
            <div className="ph-result__nums">
              <span className="ph-big-num">{COPY.results.points(mine.points)}</span>
              <span className="ph-muted">{COPY.results.votes(mine.votes)}</span>
            </div>
          </>
        ) : (
          <p className="ph-sub">{COPY.results.noCaption}</p>
        )}
      </div>

      {votedFor && (
        <div className="ph-card ph-card--soft">
          <span className="ph-muted">{COPY.results.yourVote}</span>
          <p className="ph-quote ph-quote--small">“{votedFor.text}”</p>
          <span className="ph-muted">— {votedFor.playerName}</span>
        </div>
      )}

      <div className="ph-card ph-standing">
        <Avatar player={view.me} size={56} />
        <div>
          <div className="ph-standing__rank">{COPY.results.rank(rank, view.players.length)}</div>
          <div className="ph-muted">{COPY.results.total(view.me.score)}</div>
        </div>
      </div>
    </section>
  );
}
