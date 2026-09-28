/**
 * Play a sound for each broadcast event, and unlock audio on the first gesture.
 */
import { useEffect, useState } from "react";
import { isMuted, play, setMuted, unlock, type SoundName } from "../lib/sounds";
import type { ApiGameUpdate } from "../lib/types";

const SOUND_FOR_EVENT: Partial<Record<string, SoundName>> = {
  BUZZ: "buzz",
  ANSWER_REVEALED: "ding",
  STRIKE: "strike",
  POT_AWARDED: "win",
};

export function useSounds(lastEvent: ApiGameUpdate | undefined): { muted: boolean; toggleMuted: () => void } {
  const [muted, setMutedState] = useState(isMuted);

  useEffect(() => {
    const onGesture = (): void => unlock();
    window.addEventListener("pointerdown", onGesture, { passive: true });
    window.addEventListener("keydown", onGesture);
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, []);

  useEffect(() => {
    if (!lastEvent) return;
    const sound = SOUND_FOR_EVENT[lastEvent.event];
    if (sound) play(sound);
  }, [lastEvent]);

  return {
    muted,
    toggleMuted: () => {
      const next = !muted;
      setMuted(next);
      setMutedState(next);
      if (!next) unlock();
    },
  };
}
