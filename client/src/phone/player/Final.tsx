import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import type { PlayerView } from '../../../../shared/types.ts';
import { Avatar } from '../Avatar.tsx';
import { COPY } from '../copy.ts';
import { rankOf } from './rank.ts';

export function Final({ view }: { view: PlayerView }) {
  const rank = rankOf(view.players, view.me.id);
  const podium = rank <= 3;

  useEffect(() => {
    if (!podium) return;
    const burst = (x: number) =>
      confetti({ particleCount: 120, spread: 80, origin: { x, y: 0.6 }, disableForReducedMotion: true });
    burst(0.2);
    const t1 = setTimeout(() => burst(0.8), 350);
    const t2 = setTimeout(() => burst(0.5), 800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [podium]);

  return (
    <section className="ph-center ph-final">
      <p className="ph-muted">{COPY.final.title}</p>
      <div className={podium ? 'ph-wait__bounce' : ''}>
        <Avatar player={view.me} size={120} />
      </div>
      <div className="ph-final__rank">#{rank}</div>
      {podium && <h2 className="ph-title">{COPY.final.medals[rank - 1]}</h2>}
      <p className="ph-sub">{COPY.results.total(view.me.score)}</p>
      <p className="ph-muted">{COPY.final.thanks}</p>
    </section>
  );
}
