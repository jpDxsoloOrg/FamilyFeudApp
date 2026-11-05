/**
 * Opens the TV screen in a named window. `window.open(url, name)` on a running
 * tab would navigate it, reloading the TV and losing its audio unlock, so this
 * asks for the window first and only sets a URL on a blank one.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const CHECK_MS = 2000;

export interface DisplayWindow {
  url: string;
  opened: boolean;
  /** The browser refused the popup; offer a plain link instead. */
  blocked: boolean;
  open: () => void;
}

export function useDisplayWindow(gameId: string): DisplayWindow {
  const url = `${window.location.origin}/display/${gameId}`;
  const handle = useRef<Window | null>(null);
  const [opened, setOpened] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const open = useCallback(() => {
    const target = window.open("", `ff-display-${gameId}`);
    if (!target) {
      setBlocked(true);
      return;
    }
    setBlocked(false);
    if (target.location.href === "about:blank") target.location.href = url;
    target.focus();
    handle.current = target;
    setOpened(true);
  }, [gameId, url]);

  useEffect(() => {
    if (!opened) return;
    const timer = window.setInterval(() => {
      if (handle.current?.closed) {
        handle.current = null;
        setOpened(false);
      }
    }, CHECK_MS);
    return () => window.clearInterval(timer);
  }, [opened]);

  return { url, opened, blocked, open };
}
