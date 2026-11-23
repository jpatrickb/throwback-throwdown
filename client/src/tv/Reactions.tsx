// Floating emoji reactions from phones (socket 'reaction' event, stretch feature).
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Player } from '../../../shared/types.ts';
import { socket, IS_MOCK } from '../socket.ts';
import { playerColor } from './common.tsx';

interface Floater { id: number; emoji: string; name: string; color: string; x: number }

const MAX_ON_SCREEN = 30;

export function Reactions({ players }: { players: Player[] }) {
  const [items, setItems] = useState<Floater[]>([]);
  const seq = useRef(0);
  const playersRef = useRef(players);
  playersRef.current = players;

  useEffect(() => {
    const add = (r: { playerId: string; emoji: string }) => {
      const p = playersRef.current.find((x) => x.id === r.playerId);
      const id = ++seq.current;
      const f: Floater = {
        id,
        emoji: r.emoji.slice(0, 8),
        name: p?.name ?? '',
        color: p ? playerColor(p) : 'var(--c-sun)',
        x: 6 + Math.random() * 88,
      };
      setItems((xs) => [...xs.slice(-(MAX_ON_SCREEN - 1)), f]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3800);
    };
    socket.on('reaction', add);
    // Dev: /tv?mock=LOBBY&mockreactions shows a stream of fake reactions.
    let t: ReturnType<typeof setInterval> | undefined;
    if (IS_MOCK && new URLSearchParams(location.search).has('mockreactions')) {
      const emojis = ['😂', '🔥', '👏', '😱', '💀'];
      t = setInterval(() => {
        const ps = playersRef.current;
        if (ps.length) add({ playerId: ps[Math.floor(Math.random() * ps.length)].id, emoji: emojis[Math.floor(Math.random() * emojis.length)] });
      }, 600);
    }
    return () => {
      socket.off('reaction', add);
      if (t) clearInterval(t);
    };
  }, []);

  return (
    <div className="reactions" aria-hidden>
      <AnimatePresence>
        {items.map((f) => (
          <motion.div
            key={f.id}
            className="reaction"
            style={{ left: `${f.x}%`, '--pc': f.color } as CSSProperties}
            initial={{ y: 0, opacity: 0, scale: 0.4 }}
            animate={{ y: '-70vh', opacity: [0, 1, 1, 0], scale: 1, x: [0, 20, -20, 10] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 3.6, ease: 'easeOut' }}
          >
            <span className="reaction-emoji">{f.emoji}</span>
            {f.name && <span className="reaction-name">{f.name}</span>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
