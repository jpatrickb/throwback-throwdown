// Confetti helpers. Colours are read from theme tokens so a retheme carries over.
import confetti from 'canvas-confetti';

function tokenColors(): string[] {
  const cs = getComputedStyle(document.documentElement);
  return ['--c-sun', '--c-bubblegum', '--c-mint', '--c-sky', '--c-tangerine', '--c-grape']
    .map((v) => cs.getPropertyValue(v).trim())
    .filter(Boolean);
}

/** One celebratory burst from a point (0..1 screen coords). */
export function burst(x = 0.5, y = 0.5, scale = 1) {
  confetti({
    particleCount: Math.round(140 * scale),
    spread: 90,
    startVelocity: 45 * Math.sqrt(scale),
    origin: { x, y },
    colors: tokenColors(),
    scalar: 1.4,
    disableForReducedMotion: true,
  });
}

/** Side cannons for a few seconds: the champion moment. */
export function cannons(ms = 3500) {
  const end = Date.now() + ms;
  const colors = tokenColors();
  const frame = () => {
    confetti({ particleCount: 6, angle: 60, spread: 60, origin: { x: 0, y: 0.75 }, colors, scalar: 1.4, disableForReducedMotion: true });
    confetti({ particleCount: 6, angle: 120, spread: 60, origin: { x: 1, y: 0.75 }, colors, scalar: 1.4, disableForReducedMotion: true });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}
