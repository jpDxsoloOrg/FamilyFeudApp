/** Rolls a score up to its new value. A decrease (an undo) lands at once, so it never reads as earned. */
import { useEffect, useRef, useState } from "react";

const ROLL_MS = 500;

export function useRollingNumber(value: number): number {
  const [shown, setShown] = useState(value);
  const current = useRef(value);

  useEffect(() => {
    const from = current.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (value <= from || reduced || document.hidden) {
      current.current = value;
      setShown(value);
      return;
    }
    const started = performance.now();
    let frame = 0;
    const step = (now: number): void => {
      const progress = Math.min(1, (now - started) / ROLL_MS);
      const eased = 1 - (1 - progress) ** 3;
      current.current = Math.round(from + (value - from) * eased);
      setShown(current.current);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return shown;
}
