/** The Fast Money clock: Anton digits inside a ring that drains. */
import { useRef } from "react";

const URGENT_AT = 5;

interface Props {
  seconds: number | null;
  /** The deadline this clock counts to. A new one refills the ring. */
  timerKey: number | null | undefined;
  size?: "s" | "m" | "l";
  dim?: boolean;
}

export function ClockRing({ seconds, timerKey, size = "m", dim }: Props) {
  const full = useRef<{ key: number | null | undefined; value: number }>({ key: undefined, value: 0 });
  if (seconds !== null && full.current.key !== timerKey) full.current = { key: timerKey, value: seconds };
  const left = full.current.value > 0 && seconds !== null ? seconds / full.current.value : 0;
  const urgent = seconds !== null && seconds <= URGENT_AT;

  return (
    <div className="sx-clock" data-size={size} data-urgent={urgent ? "" : undefined} data-dim={dim ? "" : undefined} role="timer" aria-label={seconds === null ? "No clock running" : `${seconds} seconds left`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="sx-clock__track" cx="50" cy="50" r="44" />
        <circle className="sx-clock__ring" cx="50" cy="50" r="44" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - left} transform="rotate(-90 50 50)" />
      </svg>
      <span className="sx-clock__digits" aria-hidden="true">
        {seconds ?? "—"}
      </span>
    </div>
  );
}
