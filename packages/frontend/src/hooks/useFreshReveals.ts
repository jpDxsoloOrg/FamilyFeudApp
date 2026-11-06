/**
 * Every slot opened by the latest update. A reveal-all opens several at once,
 * which `useJustRevealed` (kept for the host) cannot say.
 */
import { useLayoutEffect, useRef, useState } from "react";
import type { PublicRound } from "../lib/types";

const FRESH_MS = 900;
const FRESH_MS_REDUCED = 600;
const NONE: ReadonlySet<number> = new Set();

export function useFreshReveals(round: PublicRound | null | undefined): ReadonlySet<number> {
  const seen = useRef<{ roundNumber: number; revealed: Set<number> } | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<number>>(NONE);

  // Layout, so a tile never paints open for a frame before its doors arrive.
  useLayoutEffect(() => {
    if (!round) {
      seen.current = null;
      return;
    }
    const revealed = new Set(round.board.filter((slot) => slot.revealed).map((slot) => slot.index));
    const previous = seen.current;
    seen.current = { roundNumber: round.number, revealed };
    if (!previous || previous.roundNumber !== round.number) return;
    const opened = [...revealed].filter((index) => !previous.revealed.has(index));
    if (opened.length === 0) return;
    setFresh(new Set(opened));
  }, [round]);

  useLayoutEffect(() => {
    if (fresh.size === 0) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setFresh(NONE), reduced ? FRESH_MS_REDUCED : FRESH_MS);
    return () => window.clearTimeout(timer);
  }, [fresh]);

  return fresh;
}
