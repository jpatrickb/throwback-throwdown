import type { CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Player, TvView } from '../../../shared/types.ts';
import { isTeamMode, teamColor } from './entrants.ts';
import { BRAND } from '../brand.ts';
import { ART } from '../theme/art.ts';
import { ArtImg, Avatar, Doodle, Logo, playerColor, useSfxOnIncrease } from './common.tsx';
import { SPRING_POP } from './motion.ts';

export function Lobby({ view }: { view: TvView }) {
  const players = [...view.players].sort((a, b) => a.name.localeCompare(b.name));
  useSfxOnIncrease(players.length, 'join');
  const teamMode = isTeamMode(view);
  const shortUrl = view.joinUrl.replace(/^https?:\/\//, '').replace(/\?.*$/, '');
  return (
    <div className="screen lobby">
      <div className="lobby-title">
        <Logo />
        <p className="tagline">{BRAND.tagline}</p>
      </div>

      <div className="lobby-join paper-card" style={{ '--tilt': '-2deg' } as CSSProperties}>
        <span className="tape tape-top" />
        <p className="join-step">Scan to join!</p>
        <img src={view.joinQrDataUrl} alt="Join QR code" className="qr" />
        <p className="join-url">{shortUrl}</p>
        <p className="room-label">
          Room code <span className="room-code">{view.roomCode}</span>
        </p>
        {view.lanJoinUrl && <p className="lan-url">No signal? Wi-Fi: {view.lanJoinUrl.replace(/^https?:\/\//, '')}</p>}
        <Doodle name="star" className="corner-doodle" />
      </div>

      <div className="lobby-players">
        <h2 className="players-heading">
          {players.length === 0 ? 'Who’s playing?' : (
            <>
              <motion.span key={players.length} className="count-bubble" initial={{ scale: 1.8 }} animate={{ scale: 1 }} transition={SPRING_POP}>
                {players.length}
              </motion.span>{' '}
              {players.length === 1 ? 'cousin is in!' : 'cousins are in!'}
              {teamMode && <small className="team-count"> · {view.teams.length} teams</small>}
            </>
          )}
        </h2>
        {teamMode ? (
          <TeamColumns view={view} />
        ) : (
        <ul className={`lobby-grid ${players.length > 28 ? 'crowd-xl' : players.length > 15 ? 'crowd-grid' : players.length > 10 ? 'crowd' : ''}`}>
          <AnimatePresence>
            {players.map((p, i) => (
              <motion.li
                key={p.id}
                layout
                className={`lobby-player ${p.connected ? '' : 'offline'}`}
                style={{ '--pc': playerColor(p), '--tilt': `${((i * 37) % 9) - 4}deg` } as CSSProperties}
                initial={{ scale: 0, y: 60, rotate: -20 }}
                animate={{ scale: 1, y: 0, rotate: 0 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={SPRING_POP}
              >
                <Avatar player={p} />
                <span className="lobby-name">{p.name}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        )}
        {players.length === 0 && !teamMode && (
          <div className="lobby-empty">
            <ArtImg src={ART.mascot} className="mascot bob" />
            <p>Grab your phone and scan the code!</p>
          </div>
        )}
        {!teamMode && players.length > 0 && players.length <= 10 && <ArtImg src={ART.mascot} className="mascot lobby-mascot bob" />}
        <p className="waiting-host">
          <span className="dot-pulse" /> Waiting for the host to start the game…
        </p>
      </div>
    </div>
  );
}

/** Team mode: one column per team; members pop in (join order) as they arrive. */
function TeamColumns({ view }: { view: TvView }) {
  const byId = new Map(view.players.map((p) => [p.id, p]));
  return (
    <div className="team-columns" style={{ '--teams': view.teams.length } as CSSProperties}>
      {view.teams.map((t, ti) => {
        const members = t.memberIds.map((id) => byId.get(id)).filter((p): p is Player => !!p);
        return (
          <motion.section
            key={t.id}
            className="team-col"
            style={{ '--tc': teamColor(t), '--tilt': `${((ti * 41) % 5) - 2}deg` } as CSSProperties}
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ ...SPRING_POP, delay: ti * 0.08 }}
          >
            <header className="team-col-head">
              <span className="team-col-name">{t.name}</span>
              <span className="team-col-count">{members.length}</span>
            </header>
            <ul className={`team-col-members ${members.length > 7 ? 'team-col-crowd' : ''}`}>
              <AnimatePresence>
                {members.map((p) => (
                  <motion.li
                    key={p.id}
                    layout
                    className={`team-member ${p.connected ? '' : 'offline'}`}
                    initial={{ scale: 0, x: -30, rotate: -12 }}
                    animate={{ scale: 1, x: 0, rotate: 0 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={SPRING_POP}
                  >
                    <Avatar player={p} />
                    <span className="team-member-name">{p.name}</span>
                  </motion.li>
                ))}
              </AnimatePresence>
              {members.length === 0 && <li className="team-empty">Waiting for players…</li>}
            </ul>
          </motion.section>
        );
      })}
    </div>
  );
}
