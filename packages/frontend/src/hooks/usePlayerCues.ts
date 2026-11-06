/**
 * Announces a cue the moment it becomes this player's. The first render only
 * takes note, so a reload stays quiet. `YOU_ARE_UP` is not used: the broadcast
 * state always carries the same fact and covers the first guesser too.
 */
import { useEffect, useRef, useState } from "react";
import { buzzPhone } from "../lib/haptics";
import type { PlayerCue } from "../lib/playerCue";
import { play } from "../lib/sounds";

const SPLASH_MS = 1200;

export interface PlayerSplash {
  id: string;
  headline: string;
  detail?: string;
  mood: PlayerCue["mood"];
}

export function usePlayerCues(cue: PlayerCue | undefined): PlayerSplash | null {
  const announced = useRef<string | null | undefined>(undefined);
  const [splash, setSplash] = useState<PlayerSplash | null>(null);

  useEffect(() => {
    if (!cue) return;
    const current = cue.mine ? cue.id : null;
    const first = announced.current === undefined;
    const rising = current !== null && current !== announced.current;
    announced.current = current;
    if (first || !rising) return;

    if (cue.alert === "armed") {
      play("armed");
      buzzPhone(40);
    } else if (cue.alert === "turn") {
      play("yourTurn");
      buzzPhone([80, 60, 80]);
    }
    if (cue.splash) setSplash({ id: cue.id, mood: cue.mood, ...cue.splash });
  }, [cue]);

  useEffect(() => {
    if (!splash) return;
    const timer = window.setTimeout(() => setSplash(null), SPLASH_MS);
    return () => window.clearTimeout(timer);
  }, [splash]);

  return splash;
}
