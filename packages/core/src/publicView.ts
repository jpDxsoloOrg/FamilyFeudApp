// Task 3.2 — strip hidden data for the broadcast payload. See PLAN.md.
import type { BoardAnswer, FastMoneyResponse, PublicBoardAnswer, PublicRound, RoundData } from "./types.js";

export function toPublicBoard(_board: readonly BoardAnswer[]): PublicBoardAnswer[] {
  throw new Error("Not implemented: toPublicBoard (Task 3.2)");
}

export function toPublicRound(_round: RoundData): PublicRound {
  throw new Error("Not implemented: toPublicRound (Task 3.2)");
}

export interface PublicFastMoneyRow {
  slot: number;
  questionIndex: number;
  answer: string | null;
  points: number | null;
  revealed: boolean;
  skipped: boolean;
}

export function toPublicFastMoneyRows(_responses: readonly FastMoneyResponse[]): PublicFastMoneyRow[] {
  throw new Error("Not implemented: toPublicFastMoneyRows (Task 3.2)");
}
