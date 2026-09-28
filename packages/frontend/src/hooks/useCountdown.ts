/**
 * Seconds left on a server-owned deadline. `clockOffset` is
 * `serverTime - Date.now()` from the last payload, so the countdown agrees
 * with the server's clock rather than the phone's.
 */
import { useEffect, useState } from "react";

export function useCountdown(timerEndsAt: number | null | undefined, clockOffset: number): number | null {
  const compute = (): number | null => {
    if (timerEndsAt === null || timerEndsAt === undefined) return null;
    const serverNow = Date.now() + clockOffset;
    return Math.max(0, Math.ceil((timerEndsAt - serverNow) / 1000));
  };
  const [seconds, setSeconds] = useState<number | null>(compute);

  useEffect(() => {
    setSeconds(compute());
    if (timerEndsAt === null || timerEndsAt === undefined) return;
    const timer = window.setInterval(() => setSeconds(compute()), 200);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerEndsAt, clockOffset]);

  return seconds;
}
