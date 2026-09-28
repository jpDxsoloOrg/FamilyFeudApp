// Task 2.6 — upsertSurvey, deleteSurvey, upsertFastMoneyQuestion.
import type { FastMoneyQuestion, Survey, SurveyAnswer } from "@familyfeud/core";
import { requiredArray, requiredInt, requiredString, type Args } from "../lib/args.js";
import { requireHost } from "../lib/auth.js";
import { deleteItem, putItem } from "../lib/db.js";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors.js";
import { keys } from "../lib/keys.js";
import type { FastMoneyQuestionItem, SurveyItem } from "../lib/mappers.js";

export const MAX_BOARD_ANSWERS = 8;
export const MAX_QUESTION_LENGTH = 200;
export const MAX_ANSWER_LENGTH = 60;
export const MAX_ANSWER_POINTS = 100;
const MAX_QUESTION_NUMBER = 99;

/**
 * Validate `[SurveyAnswerInput!]!`: 1–8 answers, non-empty distinct text, integer
 * points 0–100. Returned sorted by points descending so index 0 is the #1 answer.
 */
export function parseAnswers(args: Args, name: string): SurveyAnswer[] {
  const raw = requiredArray(args, name);
  if (raw.length < 1 || raw.length > MAX_BOARD_ANSWERS) {
    throw new ValidationError(`"${name}" must have between 1 and ${MAX_BOARD_ANSWERS} answers`);
  }
  const seen = new Set<string>();
  const answers = raw.map((entry, index): SurveyAnswer => {
    if (typeof entry !== "object" || entry === null) {
      throw new ValidationError(`Answer ${index + 1} must be an object`);
    }
    const { text, points } = entry as { text?: unknown; points?: unknown };
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (trimmed.length === 0 || trimmed.length > MAX_ANSWER_LENGTH) {
      throw new ValidationError(`Answer ${index + 1} needs text of 1–${MAX_ANSWER_LENGTH} characters`);
    }
    if (typeof points !== "number" || !Number.isInteger(points) || points < 0 || points > MAX_ANSWER_POINTS) {
      throw new ValidationError(`Answer ${index + 1} needs integer points between 0 and ${MAX_ANSWER_POINTS}`);
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) throw new ValidationError(`Answer "${trimmed}" appears more than once`);
    seen.add(key);
    return { text: trimmed, points };
  });
  // Stable sort: equal points keep the author's order.
  return answers
    .map((answer, index) => ({ answer, index }))
    .sort((a, b) => b.answer.points - a.answer.points || a.index - b.index)
    .map(({ answer }) => answer);
}

export async function upsertSurvey(args: Args): Promise<Survey> {
  const gameId = requiredString(args, "gameId");
  const hostToken = requiredString(args, "hostToken");
  const number = requiredInt(args, "number", { min: 1, max: MAX_QUESTION_NUMBER });
  const text = requiredString(args, "text", { maxLength: MAX_QUESTION_LENGTH });
  const answers = parseAnswers(args, "answers");

  const game = await requireHost(gameId, hostToken);
  const existing = game.surveys.find((survey) => survey.number === number);
  if (existing?.used) throw new ConflictError(`Survey ${number} has already been played and cannot be edited`);

  const item: SurveyItem = { ...keys.survey(gameId, number), text, answers, used: false };
  await putItem(item);
  return { number, text, answers, used: false };
}

export async function deleteSurvey(args: Args): Promise<boolean> {
  const gameId = requiredString(args, "gameId");
  const hostToken = requiredString(args, "hostToken");
  const number = requiredInt(args, "number", { min: 1, max: MAX_QUESTION_NUMBER });

  const game = await requireHost(gameId, hostToken);
  const existing = game.surveys.find((survey) => survey.number === number);
  if (!existing) throw new NotFoundError(`No survey ${number} in this game`);
  if (existing.used) throw new ConflictError(`Survey ${number} has already been played and cannot be deleted`);

  await deleteItem(keys.survey(gameId, number));
  return true;
}

export async function upsertFastMoneyQuestion(args: Args): Promise<FastMoneyQuestion> {
  const gameId = requiredString(args, "gameId");
  const hostToken = requiredString(args, "hostToken");
  const number = requiredInt(args, "number", { min: 1, max: MAX_QUESTION_NUMBER });
  const text = requiredString(args, "text", { maxLength: MAX_QUESTION_LENGTH });
  const answers = parseAnswers(args, "answers");

  const game = await requireHost(gameId, hostToken);
  if (game.status === "FAST_MONEY" || game.status === "FINISHED") {
    throw new ConflictError("Fast Money questions cannot be changed once Fast Money has started");
  }

  const item: FastMoneyQuestionItem = { ...keys.fastMoneyQuestion(gameId, number), text, answers };
  await putItem(item);
  return { number, text, answers };
}
