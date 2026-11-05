/** One window listener for the whole console. What each key does comes from the Cue. */
import { useEffect, useRef } from "react";
import type { Cue, CueAction } from "../lib/hostCue";

const GO_COOLDOWN_MS = 600;

export interface HostUiKeys {
  mute: () => void;
  display: () => void;
  chats: () => void;
  players: () => void;
  keys: () => void;
  escape: () => void;
}

export function useHostKeys(cue: Cue, ui: HostUiKeys, modalOpen: boolean): void {
  const latest = useRef({ cue, ui, modalOpen });
  latest.current = { cue, ui, modalOpen };

  // A double-press must not end a round and start the next. Repeating the same step (reveals) is not a hand-over.
  const lastGoId = useRef(cue.go?.id);
  const goReadyAt = useRef(0);
  if (lastGoId.current !== cue.go?.id) {
    lastGoId.current = cue.go?.id;
    goReadyAt.current = performance.now() + GO_COOLDOWN_MS;
  }

  useEffect(() => {
    const fire = (event: KeyboardEvent, action: CueAction | undefined): void => {
      if (!action?.enabled) return;
      event.preventDefault();
      action.run();
    };

    const onKey = (event: KeyboardEvent): void => {
      const { cue: now, ui: bound, modalOpen: modal } = latest.current;
      if (modal) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape") {
        bound.escape();
        return;
      }
      if (event.repeat) return;

      if (event.key === " ") {
        if (document.activeElement !== document.body) return;
        event.preventDefault();
        if (performance.now() >= goReadyAt.current) fire(event, now.go);
        return;
      }
      if (event.key === "ArrowLeft") return fire(event, now.left);
      if (event.key === "ArrowRight") return fire(event, now.right);

      const key = event.key.toLowerCase();
      const uiKeys: Record<string, () => void> = { m: bound.mute, d: bound.display, c: bound.chats, p: bound.players, "?": bound.keys };
      const uiAction = uiKeys[key];
      if (uiAction) {
        event.preventDefault();
        uiAction();
        return;
      }
      fire(event, now.keys?.[key]);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
