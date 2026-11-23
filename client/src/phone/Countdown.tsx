import { useCountdown } from '../socket.ts';

export function Countdown({ deadline, serverNow }: { deadline: number | null; serverNow: number }) {
  const left = useCountdown(deadline, serverNow);
  if (left === null) return null;
  const urgent = left <= 10;
  return (
    <span className={`ph-countdown${urgent ? ' ph-countdown--urgent' : ''}`} aria-label={`${left} seconds left`}>
      {left}
    </span>
  );
}
