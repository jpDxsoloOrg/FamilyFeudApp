/**
 * Plays the moments a new snapshot earned. Only a commit that also changed
 * `lastEvent` counts, so a `refresh()` after a reconnect replays nothing.
 */
import { useEffect, useRef, useState } from "react";
import { diffMoments, showsOffStage, type Moment } from "../lib/moments";
import type { ApiGame, ApiGameUpdate } from "../lib/types";

interface Playing {
  moments: Moment[];
  index: number;
  /** Bumped per diff, so the same kind of moment twice in a row replays. */
  run: number;
}

export interface CurrentMoment {
  moment: Moment;
  key: string;
}

export function useMoments(game: ApiGame | undefined, lastEvent: ApiGameUpdate | undefined, onStage: boolean): CurrentMoment | null {
  const previous = useRef<ApiGame>();
  const seenEvent = useRef(lastEvent);
  const runs = useRef(0);
  const [playing, setPlaying] = useState<Playing | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = game;
    const fresh = lastEvent !== seenEvent.current;
    seenEvent.current = lastEvent;
    if (!fresh || !game) return;
    if (lastEvent?.event === "ROUND_UNDONE") {
      setPlaying(null);
      return;
    }
    if (!before || document.hidden) return;
    const moments = diffMoments(before, game).filter((moment) => onStage || showsOffStage(moment));
    if (moments.length === 0) return;
    runs.current += 1;
    setPlaying({ moments, index: 0, run: runs.current });
  }, [game, lastEvent, onStage]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      setPlaying((current) => {
        if (current !== playing) return current;
        const index = current.index + 1;
        return index < current.moments.length ? { ...current, index } : null;
      });
    }, playing.moments[playing.index].ms);
    return () => window.clearTimeout(timer);
  }, [playing]);

  if (!playing) return null;
  return { moment: playing.moments[playing.index], key: `${playing.run}-${playing.index}` };
}
