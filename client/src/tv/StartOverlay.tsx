// One-time "Click to start the party" overlay. Browsers block audio until a
// user gesture, so this click unlocks it. Also tries to go fullscreen.
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { unlockAudio } from '../audio/index.ts';
import { BRAND } from '../brand.ts';
import { ART } from '../theme/art.ts';
import { ArtImg } from './common.tsx';
import { SPRING_POP } from './motion.ts';

export function StartOverlay() {
  const [open, setOpen] = useState(true);
  const start = () => {
    unlockAudio();
    document.documentElement.requestFullscreen?.().catch(() => {});
    setOpen(false);
  };
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="start-overlay"
          onClick={start}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4 } }}
        >
          <motion.button
            className="start-button"
            autoFocus
            onClick={(e) => {
              e.stopPropagation();
              start();
            }}
            initial={{ scale: 0.6, rotate: -6 }}
            animate={{ scale: 1, rotate: -2 }}
            transition={SPRING_POP}
          >
            <ArtImg src={ART.mascot} className="start-mascot" />
            <span>Click to start the party!</span>
            <small>{BRAND.name} · turns on sound + fullscreen</small>
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
