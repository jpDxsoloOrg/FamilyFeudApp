// Task 2.6 — upsertSurvey, deleteSurvey, upsertFastMoneyQuestion, deleteFastMoneyQuestion, setLineupPins.
import type { FastMoneyQuestion, LineupPins, Survey, SurveyAnswer } from "@familyfeud/core";
import { requiredArray, requiredInt, requiredString, type Args } from "../lib/args.js";
import { requireHost } from "../lib/auth.js";
import { deleteItem, putItem, updateItem } from "../lib/db.js";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors.js";
import { keys } from "../lib/keys.js";
import type { FastMoneyQuestionItem, SurveyItem } from "../lib/mappers.js";
import { toHostGame, type LineupView } from "../lib/views.js";

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
  if (game.lineup?.surveys.includes(number)) {
    throw new ConflictError(`Survey ${number} is in this game's lineup and cannot be deleted`);
  }

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

export async function deleteFastMoneyQuestion(args: Args): Promise<boolean> {
  const gameId = requiredString(args, "gameId");
  const hostToken = requiredString(args, "hostToken");
  const number = requiredInt(args, "number", { min: 1, max: MAX_QUESTION_NUMBER });

  const game = await requireHost(gameId, hostToken);
  if (game.status === "FAST_MONEY" || game.status === "FINISHED") {
    throw new ConflictError("Fast Money questions cannot be changed once Fast Money has started");
  }
  const existing = game.fastMoneyQuestions.find((question) => question.number === number);
  if (!existing) throw new NotFoundError(`No Fast Money question ${number} in this game`);
  if (game.lineup?.fastMoney.includes(number)) {
    throw new ConflictError(`Fast Money question ${number} is in this game's lineup and cannot be deleted`);
  }

  await deleteItem(keys.fastMoneyQuestion(gameId, number));
  return true;
}

/** Slots kept per bank: the largest round / Fast Money count the config allows. */
const MAX_LINEUP_SLOTS = 10;

/** `[Int]!` of question numbers, null = random; every pin must exist and be unique. */
function parsePins(args: Args, name: string, existing: readonly number[]): (number | null)[] {
  const raw = requiredArray(args, name);
  if (raw.length > MAX_LINEUP_SLOTS) throw new ValidationError(`"${name}" has more than ${MAX_LINEUP_SLOTS} slots`);
  const seen = new Set<number>();
  return raw.map((entry, slot) => {
    if (entry === null || entry === undefined) return null;
    if (typeof entry !== "number" || !Number.isInteger(entry)) {
      throw new ValidationError(`Slot ${slot + 1} must be a question number or null`);
    }
    if (!existing.includes(entry)) throw new NotFoundError(`Question ${entry} is not in the bank`);
    if (seen.has(entry)) throw new ValidationError(`Question ${entry} is picked for more than one slot`);
    seen.add(entry);
    return entry;
  });
}

/**
 * Pin specific questions to round / Fast Money slots before the game starts.
 * Unpinned slots are drawn at random when round 1 starts.
 */
export async function setLineupPins(args: Args): Promise<LineupView> {
  const gameId = requiredString(args, "gameId");
  const hostToken = requiredString(args, "hostToken");

  const game = await requireHost(gameId, hostToken);
  if ((game.status !== "LOBBY" && game.status !== "TEAMS_SET") || game.lineup !== null) {
    throw new ConflictError("The lineup is locked once the first round starts");
  }
  const pins: LineupPins = {
    surveys: parsePins(
      args,
      "surveys",
      game.surveys.filter((survey) => !survey.used).map((survey) => survey.number),
    ),
    fastMoney: parsePins(
      args,
      "fastMoney",
      game.fastMoneyQuestions.map((question) => question.number),
    ),
  };
  await updateItem(keys.game(gameId), {
    updateExpression: "SET lineupPins = :pins",
    values: { ":pins": pins },
    conditionExpression: "attribute_exists(pk)",
  });
  return toHostGame({ ...game, lineupPins: pins }).lineup;
}
