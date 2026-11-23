import type { CSSProperties } from 'react';
import type { TvView } from '../../../shared/types.ts';
import { isTeamMode, teamColor, teamInitials } from './entrants.ts';
import { SPRING_POP } from './motion.ts';
import { AnimatePresence, motion } from 'motion/react';
import { CountdownRing, PlayerChip, Polaroid, RoundHeader, useSfxOnIncrease } from './common.tsx';

export function Captioning({ view }: { view: TvView }) {
  return isTeamMode(view) ? <TeamCaptioning view={view} /> : <SoloCaptioning view={view} />;
}

function SoloCaptioning({ view }: { view: TvView }) {
  const round = view.round!;
  const submitted = new Set(round.submittedPlayerIds);
  useSfxOnIncrease(submitted.size, 'submit');
  const active = view.players.filter((p) => p.connected || submitted.has(p.id));
  const players = [...active].sort((a, b) => a.name.localeCompare(b.name));
  const allIn = players.length > 0 && players.every((p) => submitted.has(p.id));
  // Big groups: a progress bar, and chips only for the stragglers once few are left.
  const crowd = players.length > 14;
  const waiting = players.filter((p) => !submitted.has(p.id));
  const shown = crowd ? (waiting.length <= 12 ? waiting : []) : players;
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
                {crowd && (
                  <>
                    <span className="progress-bar progress-bar-lg" aria-hidden>
                      <motion.span className="progress-fill" animate={{ width: `${(100 * submitted.size) / Math.max(1, players.length)}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
                    </span>
                    <small className="waiting-on">{shown.length ? 'Still writing:' : `Waiting on ${waiting.length} more…`}</small>
                  </>
                )}
              </>
            )}
          </p>
          <ul className="chip-grid">
            <AnimatePresence>
              {shown.map((p) => (
                <PlayerChip key={p.id} player={p} done={submitted.has(p.id)} />
              ))}
            </AnimatePresence>
          </ul>
        </aside>
      </div>
    </div>
  );
}

/** Team mode: one caption per team, so show a big chip per team flipping to ✓. */
function TeamCaptioning({ view }: { view: TvView }) {
  const round = view.round!;
  const connected = new Set(view.players.filter((p) => p.connected).map((p) => p.id));
  // Teams with nobody connected can't write, so they don't hold the round up.
  const teams = view.teams.filter((t) => t.memberIds.some((id) => connected.has(id)) || round.submittedTeamIds.includes(t.id));
  const done = new Set(round.submittedTeamIds);
  useSfxOnIncrease(done.size, 'submit');
  const allIn = teams.length > 0 && teams.every((t) => done.has(t.id));
  return (
    <div className="screen captioning">
      <RoundHeader index={round.index} total={round.totalPhotosQueued} title="Write your team’s caption!" />
      <div className="caption-body">
        <Polaroid src={round.photo.url} label="Caption this!" tilt={-3} className="polaroid-main" />
        <aside className="caption-side">
          <CountdownRing deadline={view.deadline} serverNow={view.serverNow} phase={view.phase} settings={view.settings} />
          <p className="progress-line">
            {allIn ? 'Every team is in! 🎉' : (
              <>
                <b>{done.size}</b> of <b>{teams.length}</b> teams ready
              </>
            )}
          </p>
          <ul className="team-chips">
            {teams.map((t) => {
              const ok = done.has(t.id);
              return (
                <motion.li
                  key={t.id}
                  layout
                  className={`team-chip ${ok ? 'team-chip-done' : ''}`}
                  style={{ '--tc': teamColor(t) } as CSSProperties}
                  initial={{ scale: 0 }}
                  animate={{ scale: ok ? [1, 1.12, 1] : 1 }}
                  transition={SPRING_POP}
                >
                  <motion.span className="team-chip-face" key={ok ? 'y' : 'n'} initial={{ rotateY: 90 }} animate={{ rotateY: 0 }} transition={{ duration: 0.35 }}>
                    {ok ? '✓' : teamInitials(t.name)}
                  </motion.span>
                  <span className="team-chip-name">{t.name}</span>
                  <span className="team-chip-state">{ok ? 'Ready!' : 'Writing…'}</span>
                </motion.li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}
