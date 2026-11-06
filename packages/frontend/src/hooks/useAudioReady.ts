/** Whether sound can play yet. The prompts that ask for a tap read this. */
import { useEffect, useState } from "react";
import { isUnlocked, unlock } from "../lib/sounds";

export function useAudioReady(): boolean {
  const [ready, setReady] = useState(() => typeof AudioContext === "undefined" || isUnlocked());

  useEffect(() => {
    if (ready) return;
    const onGesture = (): void => {
      unlock();
      setReady(isUnlocked());
    };
    // A touch only counts as a gesture once it ends, which `pointerdown` is too early for.
    window.addEventListener("pointerdown", onGesture, { passive: true });
    window.addEventListener("click", onGesture);
    window.addEventListener("keydown", onGesture);
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("click", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, [ready]);

  return ready;
}
