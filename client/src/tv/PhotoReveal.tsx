// Drumroll: "Round N" slams in, then the polaroid flips over to show the photo.
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import type { TvView } from '../../../shared/types.ts';
import { playSfx } from '../audio/index.ts';
import { ART } from '../theme/art.ts';
import { Polaroid } from './common.tsx';
import { SPRING_POP, TIMING } from './motion.ts';

export function PhotoReveal({ view }: { view: TvView }) {
  const round = view.round!;
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setFlipped(true);
      playSfx('reveal');
    }, TIMING.revealRoundTitle);
    return () => clearTimeout(t);
  }, [round.index]);
  const total = Math.max(round.totalPhotosQueued, round.index + 1);
  return (
    <div className="screen reveal">
      <motion.div
        className="reveal-title"
        initial={{ scale: 3, opacity: 0, rotate: -8 }}
        animate={flipped ? { scale: 0.7, opacity: 1, rotate: -3, y: '-0.4em' } : { scale: 1, opacity: 1, rotate: -3 }}
        transition={SPRING_POP}
      >
        <span className="reveal-round">Round {round.index + 1}</span>
        <span className="reveal-of">of {total}</span>
      </motion.div>

      <div className="flip-scene">
        <motion.div
          className="flip-card"
          initial={{ rotateY: 180, scale: 0.4, y: 300 }}
          animate={flipped ? { rotateY: 0, scale: 1, y: 0 } : { rotateY: 180, scale: 0.75, y: 40 }}
          transition={{ type: 'spring', stiffness: 120, damping: 14 }}
        >
          <div className="flip-front">
            <Polaroid src={round.photo.url} label="Who is this?!" tilt={-2} className="polaroid-hero" />
          </div>
          <div className="flip-back">
            {ART.photoBack ? <img src={ART.photoBack} alt="" className="photo-back" /> : <div className="photo-back" />}
          </div>
        </motion.div>
      </div>

      <motion.p
        className="reveal-hint"
        initial={{ opacity: 0, y: 30 }}
        animate={flipped ? { opacity: 1, y: 0 } : {}}
        transition={{ delay: 0.8 }}
      >
        Get your caption ready… ✍️
      </motion.p>
    </div>
  );
}
