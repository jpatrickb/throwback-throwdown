// Shared animated stage: rotating sunburst, spotlight, floating doodles.
// Optional ART.background image sits underneath if Patrick provides one.
import { useMemo, type CSSProperties } from 'react';
import { ART, DOODLE_KEYS } from '../theme/art.ts';
import { ArtImg, Doodle } from './common.tsx';

export function Background({ calm = false }: { calm?: boolean }) {
  // Fixed pseudo-random layout so doodles don't jump between renders.
  const doodles = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const r = (n: number) => ((Math.sin(i * 97.13 + n * 13.7) + 1) / 2);
        return {
          key: DOODLE_KEYS[i % DOODLE_KEYS.length],
          style: {
            left: `${4 + r(1) * 92}%`,
            top: `${4 + r(2) * 88}%`,
            '--size': `${2.2 + r(3) * 2.6}em`,
            '--rot': `${-30 + r(4) * 60}deg`,
            '--float-dur': `${7 + r(5) * 8}s`,
            '--float-delay': `${-r(6) * 10}s`,
          } as CSSProperties,
        };
      }),
    [],
  );
  return (
    <div className={`stage-bg ${calm ? 'stage-calm' : ''}`} aria-hidden>
      <ArtImg src={ART.background} className="stage-bg-img" />
      <div className="sunburst" />
      <div className="spotlight" />
      <div className="doodles">
        {doodles.map((d, i) => (
          <Doodle key={i} name={d.key} className="float-doodle" style={d.style} />
        ))}
      </div>
      <div className="vignette" />
    </div>
  );
}
