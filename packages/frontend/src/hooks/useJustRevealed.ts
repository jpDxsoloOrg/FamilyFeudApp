/**
 * Which board slot was revealed by the latest update, for the flip animation.
 * The broadcast carries the whole board, not the index, so this diffs the
 * revealed set against the previous one.
 */
import { useEffect, useRef, useState } from "react";
import type { PublicRound } from "../lib/types";

const FLIP_MS = 600;

export function useJustRevealed(round: PublicRound | null | undefined): number | null {
  const seen = useRef<{ roundNumber: number; revealed: Set<number> } | null>(null);
  const [index, setIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!round) {
      seen.current = null;
      return;
    }
    const revealed = new Set(round.board.filter((slot) => slot.revealed).map((slot) => slot.index));
    const previous = seen.current;
    seen.current = { roundNumber: round.number, revealed };
    if (!previous || previous.roundNumber !== round.number) return;
    const fresh = [...revealed].find((i) => !previous.revealed.has(i));
    if (fresh === undefined) return;
    setIndex(fresh);
    const timer = window.setTimeout(() => setIndex(null), FLIP_MS);
    return () => window.clearTimeout(timer);
  }, [round]);

  return index;
}
