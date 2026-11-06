/** Keeps the screen on while `active`. The browser drops the lock when the tab hides, so it is taken again on return. */
import { useEffect } from "react";

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !navigator.wakeLock) return;
    let lock: WakeLockSentinel | undefined;
    let stopped = false;

    const acquire = (): void => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock
        .request("screen")
        .then((sentinel) => {
          if (stopped) void sentinel.release();
          else lock = sentinel;
        })
        .catch(() => undefined);
    };

    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}
