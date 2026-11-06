/**
 * Holds the buzzer on screen just long enough to say who won it, even if this
 * player never tapped. A `BUZZERS_RESET` never reaches ANSWERING, so it gives no verdict.
 */
import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import type { PublicRound } from "../lib/types";

const HOLD_MS = 1400;

export interface BuzzVerdict {
  won: boolean;
  winnerId: string;
}

export interface BuzzVerdictState {
  verdict: BuzzVerdict | null;
  /** The last round a verdict was shown for, so a late BUZZ_RESULT toast can stand down. */
  shownForRound: MutableRefObject<number | null>;
}

export function useBuzzVerdict(round: PublicRound | null | undefined, me: string): BuzzVerdictState {
  const previous = useRef(round);
  const shownForRound = useRef<number | null>(null);
  const [verdict, setVerdict] = useState<BuzzVerdict | null>(null);

  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = round;
    if (!round || round.state === "FACE_OFF_ARMED") {
      setVerdict(null);
      return;
    }
    const winnerId = round.buzzWinnerPlayerId;
    const buzzed = before?.number === round.number && before.state === "FACE_OFF_ARMED" && round.state === "FACE_OFF_ANSWERING";
    if (!buzzed || !winnerId || !round.contestantPlayerIds.includes(me)) return;
    shownForRound.current = round.number;
    setVerdict({ won: winnerId === me, winnerId });
  }, [round, me]);

  useEffect(() => {
    if (!verdict) return;
    const timer = window.setTimeout(() => setVerdict(null), HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [verdict]);

  return { verdict, shownForRound };
}
