import { useEffect, useMemo, type ReactElement } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Phase, TvView } from '../../../shared/types.ts';
import { socket, useConnected, useView, IS_MOCK } from '../socket.ts';
import { AudioIndicator, useGameAudio } from '../audio/index.ts';
import { Background } from '../tv/Background.tsx';
import { StartOverlay } from '../tv/StartOverlay.tsx';
import { Reactions } from '../tv/Reactions.tsx';
import { Lobby } from '../tv/Lobby.tsx';
import { PhotoReveal } from '../tv/PhotoReveal.tsx';
import { Captioning } from '../tv/Captioning.tsx';
import { Voting } from '../tv/Voting.tsx';
import { Results } from '../tv/Results.tsx';
import { Scoreboard } from '../tv/Scoreboard.tsx';
import { Final } from '../tv/Final.tsx';
import { Logo } from '../tv/common.tsx';
import { screenVariants } from '../tv/motion.ts';
import { stressView } from '../tv/devStress.ts';
import { decorateView } from '../tv/entrants.ts';
import '../tv/tv.css';

const SCREENS: Record<Phase, (p: { view: TvView }) => ReactElement> = {
  LOBBY: Lobby,
  PHOTO_REVEAL: PhotoReveal,
  CAPTIONING: Captioning,
  VOTING: Voting,
  RESULTS: Results,
  SCOREBOARD: Scoreboard,
  FINAL: Final,
};

// Phases that need a round; if the server ever sends one without, fall back to the lobby look.
const NEEDS_ROUND: Phase[] = ['PHOTO_REVEAL', 'CAPTIONING', 'VOTING', 'RESULTS'];

export function Tv() {
  const rawView = useView('tv');
  useGameAudio(rawView);
  const view = useMemo(() => decorateView(stressView(rawView)), [rawView]);
  const connected = useConnected();

  useEffect(() => {
    const hello = () => socket.emit('tv:hello');
    if (socket.connected) hello();
    socket.on('connect', hello); // re-register after reconnects
    return () => {
      socket.off('connect', hello);
    };
  }, []);

  const phase = view && NEEDS_ROUND.includes(view.phase) && !view.round ? 'LOBBY' : view?.phase;
  const Screen = phase ? SCREENS[phase] : null;
  // New key per phase + round so AnimatePresence plays the transition each time.
  const key = view ? `${phase}-${view.round?.index ?? 'x'}` : 'connecting';
  const calm = phase === 'CAPTIONING' || phase === 'VOTING';

  return (
    <main className="tv">
      <Background calm={calm} />
      <AnimatePresence mode="wait">
        <motion.div key={key} className="tv-stage" variants={screenVariants} initial="initial" animate="animate" exit="exit">
          {view && Screen ? (
            <Screen view={view} />
          ) : (
            <div className="screen connecting">
              <Logo />
              <p className="connecting-text">
                <span className="dot-pulse" /> Connecting…
              </p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
      {view && <Reactions players={view.players} />}
      {!IS_MOCK && view && !connected && <div className="tv-offline">Reconnecting to the game…</div>}
      {/* Rendered before the overlay so the overlay (same z-index) covers it until clicked. */}
      <AudioIndicator />
      <StartOverlay />
    </main>
  );
}
