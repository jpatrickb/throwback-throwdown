import type { TvView } from '../../../shared/types.ts';
import { AnimatePresence } from 'motion/react';
import { CountdownRing, PlayerChip, Polaroid, RoundHeader, useSfxOnIncrease } from './common.tsx';

export function Captioning({ view }: { view: TvView }) {
  const round = view.round!;
  const submitted = new Set(round.submittedPlayerIds);
  useSfxOnIncrease(submitted.size, 'submit');
  const active = view.players.filter((p) => p.connected || submitted.has(p.id));
  const players = [...active].sort((a, b) => a.name.localeCompare(b.name));
  const allIn = players.length > 0 && players.every((p) => submitted.has(p.id));
  return (
    <div className="screen captioning">
      <RoundHeader index={round.index} total={round.totalPhotosQueued} title="Write a caption!" />
      <div className="caption-body">
        <Polaroid src={round.photo.url} label="Caption this!" tilt={-3} className="polaroid-main" />
        <aside className="caption-side">
          <CountdownRing deadline={view.deadline} serverNow={view.serverNow} phase={view.phase} settings={view.settings} />
          <p className="progress-line">
            {allIn ? 'Everyone’s in! 🎉' : (
              <>
                <b>{submitted.size}</b> of <b>{players.length}</b> captions in
              </>
            )}
          </p>
          <ul className="chip-grid">
            <AnimatePresence>
              {players.map((p) => (
                <PlayerChip key={p.id} player={p} done={submitted.has(p.id)} />
              ))}
            </AnimatePresence>
          </ul>
        </aside>
      </div>
    </div>
  );
}
