import { useRef, useState } from 'react';
import { REACTIONS } from '../avatars.ts';
import { sendReaction } from '../emit.ts';

const THROTTLE_MS = 700;

/** Emoji buttons that float a reaction up on the TV. Throttled per phone. */
export function Reactions() {
  const last = useRef(0);
  const [floats, setFloats] = useState<{ id: number; emoji: string; x: number }[]>([]);
  const nextId = useRef(1);

  const react = (emoji: string) => {
    const now = Date.now();
    if (now - last.current < THROTTLE_MS) return;
    last.current = now;
    sendReaction(emoji);
    const id = nextId.current++;
    setFloats((f) => [...f, { id, emoji, x: 10 + Math.random() * 80 }]);
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1200);
  };

  return (
    <div className="ph-reactions">
      {floats.map((f) => (
        <span key={f.id} className="ph-reactions__float" style={{ left: `${f.x}%` }} aria-hidden>
          {f.emoji}
        </span>
      ))}
      {REACTIONS.map((e) => (
        <button key={e} className="ph-reactions__btn" onClick={() => react(e)} aria-label={`React ${e}`}>
          {e}
        </button>
      ))}
    </div>
  );
}
