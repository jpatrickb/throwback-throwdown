import type { CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { TvView } from '../../../shared/types.ts';
import { BRAND } from '../brand.ts';
import { ART } from '../theme/art.ts';
import { ArtImg, Avatar, Doodle, Logo, playerColor, useSfxOnIncrease } from './common.tsx';
import { SPRING_POP } from './motion.ts';

export function Lobby({ view }: { view: TvView }) {
  const players = [...view.players].sort((a, b) => a.name.localeCompare(b.name));
  useSfxOnIncrease(players.length, 'join');
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
            </>
          )}
        </h2>
        <ul className="lobby-grid">
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
        {players.length === 0 && (
          <div className="lobby-empty">
            <ArtImg src={ART.mascot} className="mascot bob" />
            <p>Grab your phone and scan the code!</p>
          </div>
        )}
        <p className="waiting-host">
          <span className="dot-pulse" /> Waiting for the host to start the game…
        </p>
      </div>
    </div>
  );
}
