// Task 4.1 — Fast Money queue, duplicate detection, scoring. See PLAN.md.
import type { FastMoneyResponse, FastMoneySlot, SurveyAnswer } from "./types.js";

export const FAST_MONEY_GRACE_MS = 1500;

export function emptyResponses(_questionCount: number): FastMoneyResponse[] {
  throw new Error("Not implemented: emptyResponses (Task 4.1)");
}

/** Unanswered never-skipped questions first (by index), then skipped ones in skip order. */
export function buildQueue(_responses: readonly FastMoneyResponse[], _slot: FastMoneySlot): number[] {
  throw new Error("Not implemented: buildQueue (Task 4.1)");
}

export function skipQuestion(_responses: readonly FastMoneyResponse[], _slot: FastMoneySlot, _questionIndex: number): FastMoneyResponse[] {
  throw new Error("Not implemented: skipQuestion (Task 4.1)");
}

export function answerQuestion(_responses: readonly FastMoneyResponse[], _slot: FastMoneySlot, _questionIndex: number, _answer: string): FastMoneyResponse[] {
  throw new Error("Not implemented: answerQuestion (Task 4.1)");
}

/** Host buzzed a duplicate: clear the answer so the player must re-enter one. */
export function clearAnswer(_responses: readonly FastMoneyResponse[], _slot: FastMoneySlot, _questionIndex: number): FastMoneyResponse[] {
  throw new Error("Not implemented: clearAnswer (Task 4.1)");
}

/** Lowercase, strip accents/punctuation/articles, crude plural strip. */
export function normalizeAnswer(_text: string): string {
  throw new Error("Not implemented: normalizeAnswer (Task 4.1)");
}

export function isDuplicate(_a: string | null, _b: string | null): boolean {
  throw new Error("Not implemented: isDuplicate (Task 4.1)");
}

export function suggestMatch(_answer: string, _boardAnswers: readonly SurveyAnswer[]): number | null {
  throw new Error("Not implemented: suggestMatch (Task 4.1)");
}

export function totalPoints(_responses: readonly FastMoneyResponse[]): number {
  throw new Error("Not implemented: totalPoints (Task 4.1)");
}

export function isWithinDeadline(_now: number, _timerEndsAt: number | null, _graceMs = FAST_MONEY_GRACE_MS): boolean {
  throw new Error("Not implemented: isWithinDeadline (Task 4.1)");
}
