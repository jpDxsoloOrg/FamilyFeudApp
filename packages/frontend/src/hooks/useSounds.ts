/**
 * Play a sound for each broadcast event, and unlock audio on the first gesture.
 */
import { useEffect, useRef, useState } from "react";
import { isMuted, play, setMuted, unlock, type SoundName } from "../lib/sounds";
import type { ApiGameUpdate } from "../lib/types";

const SOUND_FOR_EVENT: Partial<Record<string, SoundName>> = {
  BUZZ: "buzz",
  ANSWER_REVEALED: "clang",
  STRIKE: "strike",
  POT_AWARDED: "win",
  FM_ANSWER_REVEALED: "clang",
  GAME_FINISHED: "win",
};

/** The TV and host carry these for the room; a roomful of phones would only echo them. */
const ROOM_EVENTS: ReadonlySet<string> = new Set(["BUZZ", "STRIKE", "ANSWER_REVEALED", "FM_ANSWER_REVEALED"]);

export function withoutRoomSounds(update: ApiGameUpdate | undefined): ApiGameUpdate | undefined {
  return update && ROOM_EVENTS.has(update.event) ? undefined : update;
}

export function useSounds(lastEvent: ApiGameUpdate | undefined): { muted: boolean; toggleMuted: () => void } {
  const [muted, setMutedState] = useState(isMuted);
  const heard = useRef<string>();

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
    // Whoever made the change gets both the mutation's response and its broadcast.
    const key = `${lastEvent.event}:${lastEvent.serverTime}`;
    if (key === heard.current) return;
    heard.current = key;
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
