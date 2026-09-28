// Task 4.1 — Fast Money queue, duplicate detection, scoring. Pure; never mutates input.
import type { FastMoneyResponse, FastMoneySlot, SurveyAnswer } from "./types.js";

export const FAST_MONEY_GRACE_MS = 1500;
export const FAST_MONEY_SLOTS: readonly FastMoneySlot[] = [1, 2];

export function emptyResponses(questionCount: number): FastMoneyResponse[] {
  if (!Number.isInteger(questionCount) || questionCount < 1) {
    throw new Error(`questionCount must be a positive integer, got ${questionCount}`);
  }
  return FAST_MONEY_SLOTS.flatMap((slot) =>
    Array.from({ length: questionCount }, (_, questionIndex) => ({
      slot,
      questionIndex,
      answer: null,
      skipped: false,
      skippedSeq: null,
      matchedIndex: null,
      points: 0,
      revealed: false,
    })),
  );
}

function forSlot(responses: readonly FastMoneyResponse[], slot: FastMoneySlot): FastMoneyResponse[] {
  return responses.filter((response) => response.slot === slot);
}

function find(responses: readonly FastMoneyResponse[], slot: FastMoneySlot, questionIndex: number): FastMoneyResponse {
  const response = responses.find((r) => r.slot === slot && r.questionIndex === questionIndex);
  if (!response) throw new Error(`No Fast Money question ${questionIndex} for player ${slot}`);
  return response;
}

function replace(
  responses: readonly FastMoneyResponse[],
  slot: FastMoneySlot,
  questionIndex: number,
  patch: Partial<FastMoneyResponse>,
): FastMoneyResponse[] {
  return responses.map((r) => (r.slot === slot && r.questionIndex === questionIndex ? { ...r, ...patch } : r));
}

/** Unanswered questions: never-skipped first (by index), then skipped ones in skip order. */
export function buildQueue(responses: readonly FastMoneyResponse[], slot: FastMoneySlot): number[] {
  const open = forSlot(responses, slot).filter((r) => r.answer === null);
  const fresh = open.filter((r) => !r.skipped).sort((a, b) => a.questionIndex - b.questionIndex);
  const skipped = open.filter((r) => r.skipped).sort((a, b) => (a.skippedSeq ?? 0) - (b.skippedSeq ?? 0));
  return [...fresh, ...skipped].map((r) => r.questionIndex);
}

/** Send a question to the back of the queue. */
export function skipQuestion(responses: readonly FastMoneyResponse[], slot: FastMoneySlot, questionIndex: number): FastMoneyResponse[] {
  const current = find(responses, slot, questionIndex);
  if (current.answer !== null) throw new Error(`Question ${questionIndex} is already answered`);
  const nextSeq = forSlot(responses, slot).reduce((max, r) => Math.max(max, r.skippedSeq ?? 0), 0) + 1;
  return replace(responses, slot, questionIndex, { skipped: true, skippedSeq: nextSeq });
}

export function answerQuestion(
  responses: readonly FastMoneyResponse[],
  slot: FastMoneySlot,
  questionIndex: number,
  answer: string,
): FastMoneyResponse[] {
  const current = find(responses, slot, questionIndex);
  if (current.answer !== null) throw new Error(`Question ${questionIndex} is already answered`);
  const text = answer.trim();
  if (!text) throw new Error("Answer must not be empty");
  return replace(responses, slot, questionIndex, { answer: text });
}

/** Host buzzed a duplicate: clear the answer so it comes straight back around. */
export function clearAnswer(responses: readonly FastMoneyResponse[], slot: FastMoneySlot, questionIndex: number): FastMoneyResponse[] {
  find(responses, slot, questionIndex);
  return replace(responses, slot, questionIndex, { answer: null, skipped: false, skippedSeq: null, matchedIndex: null, points: 0 });
}

const ARTICLES = new Set(["a", "an", "the"]);

function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("ss")) return word;
  if (/(s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/** Lowercase, strip accents/punctuation/articles, crude plural strip, collapse spaces. */
export function normalizeAnswer(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !ARTICLES.has(word))
    .map(singular)
    .join(" ");
}

export function isDuplicate(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false;
  const na = normalizeAnswer(a);
  const nb = normalizeAnswer(b);
  return na.length > 0 && na === nb;
}

/**
 * Best guess at which board answer a free-text answer matches: an exact
 * normalized match, else a whole-word containment either way. Null when nothing fits.
 */
export function suggestMatch(answer: string, boardAnswers: readonly SurveyAnswer[]): number | null {
  const needle = normalizeAnswer(answer);
  if (!needle) return null;
  const normalized = boardAnswers.map((candidate) => normalizeAnswer(candidate.text));
  const exact = normalized.findIndex((candidate) => candidate === needle);
  if (exact !== -1) return exact;
  const needleWords = needle.split(" ");
  const loose = normalized.findIndex((candidate) => {
    const words = candidate.split(" ");
    return needleWords.every((w) => words.includes(w)) || words.every((w) => needleWords.includes(w));
  });
  return loose === -1 ? null : loose;
}

/** Points on the board so far: revealed rows only. */
export function totalPoints(responses: readonly FastMoneyResponse[]): number {
  return responses.filter((r) => r.revealed).reduce((sum, r) => sum + r.points, 0);
}

export function hasWon(total: number, target: number): boolean {
  return total >= target;
}

/** No running timer means no submissions; otherwise allow a small grace for network lag. */
export function isWithinDeadline(now: number, timerEndsAt: number | null, graceMs = FAST_MONEY_GRACE_MS): boolean {
  if (timerEndsAt === null) return false;
  return now <= timerEndsAt + graceMs;
}
