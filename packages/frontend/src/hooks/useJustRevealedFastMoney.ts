/** Which Fast Money row was revealed by the latest update (diffs revealed rows). */
import { useEffect, useRef, useState } from "react";
import type { ApiFastMoney } from "../lib/types";

const FLIP_MS = 600;

export function useJustRevealedFastMoney(fastMoney: ApiFastMoney | null | undefined): { slot: number; questionIndex: number } | null {
  const seen = useRef<Set<string> | null>(null);
  const [cell, setCell] = useState<{ slot: number; questionIndex: number } | null>(null);

  useEffect(() => {
    if (!fastMoney) {
      seen.current = null;
      return;
    }
    const revealed = new Set(fastMoney.rows.filter((r) => r.revealed).map((r) => `${r.slot}:${r.questionIndex}`));
    const previous = seen.current;
    seen.current = revealed;
    if (!previous) return;
    const fresh = [...revealed].find((key) => !previous.has(key));
    if (!fresh) return;
    const [slot, questionIndex] = fresh.split(":").map(Number);
    setCell({ slot, questionIndex });
    const timer = window.setTimeout(() => setCell(null), FLIP_MS);
    return () => window.clearTimeout(timer);
  }, [fastMoney]);

  return cell;
}
