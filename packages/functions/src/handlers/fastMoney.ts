// Tasks 4.2–4.5 — Fast Money. Thin persistence wrappers around core/fastMoney.
import {
  answerQuestion,
  buildQueue,
  clearAnswer,
  emptyResponses,
  isWithinDeadline,
  skipQuestion,
  type FastMoneyResponse,
  type FastMoneySlot,
  type FastMoneyStage,
} from "@familyfeud/core";
import { optionalInt, requiredArray, requiredInt, requiredString, type Args } from "../lib/args.js";
import { requireHost } from "../lib/auth.js";
import { batchWrite, putItem, updateItem } from "../lib/db.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../lib/errors.js";
import { fastMoneySet, loadGame, type FullGame } from "../lib/gameState.js";
import { keys } from "../lib/keys.js";
import { fastMoneyResponseItem } from "../lib/mappers.js";
import { playerMessage, type PlayerMessage } from "../lib/messages.js";
import { serverTime } from "../lib/time.js";
import { gameUpdate, type GameUpdate } from "../lib/views.js";

function requireFastMoney(game: FullGame): void {
  if (game.status !== "FAST_MONEY") throw new ConflictError("Fast Money has not started");
}

/** Which slot is currently answering, if any (a stage with a running timer). */
export function activeSlot(game: FullGame): FastMoneySlot | null {
  const { stage, timerEndsAt } = game.fastMoney;
  if (timerEndsAt === null) return null;
  if (stage === "P1_ANSWERING") return 1;
  if (stage === "P2_ANSWERING") return 2;
  return null;
}

interface MetaPatch {
  fastMoneyStage?: FastMoneyStage;
  fastMoneyTeamId?: string | null;
  fastMoneyPlayerIds?: string[];
  timerEndsAt?: number | null;
}

async function patchMeta(gameId: string, patch: MetaPatch): Promise<void> {
  const entries = Object.entries(patch);
  await updateItem(keys.game(gameId), {
    updateExpression: `SET ${entries.map(([key]) => `#${key} = :${key}`).join(", ")}`,
    names: Object.fromEntries(entries.map(([key]) => [`#${key}`, key])),
    values: Object.fromEntries(entries.map(([key, value]) => [`:${key}`, value])),
    conditionExpression: "attribute_exists(pk)",
  });
}

function withFastMoney(game: FullGame, patch: Partial<FullGame["fastMoney"]>): FullGame {
  return { ...game, fastMoney: { ...game.fastMoney, ...patch } };
}

/**
 * Pick the two Fast Money players. The frontend preselects the leading team;
 * the host may override. Re-selecting before player 1 starts is allowed and
 * resets the answer sheet.
 */
export async function selectFastMoneyPlayers(args: Args): Promise<GameUpdate> {
  const gameId = requiredString(args, "gameId");
  const hostToken = requiredString(args, "hostToken");
  const teamId = requiredString(args, "teamId");
  const rawIds = requiredArray(args, "playerIds");

  const game = await requireHost(gameId, hostToken);
  requireFastMoney(game);
  if (game.fastMoney.stage !== "SETUP") throw new ConflictError("Fast Money players are locked once play starts");
  if (!game.teams.some((team) => team.id === teamId)) throw new NotFoundError("No such team in this game");

  const playerIds = rawIds.map((id) => (typeof id === "string" ? id : ""));
  if (playerIds.length !== 2 || playerIds[0] === playerIds[1] || playerIds.some((id) => !id)) {
    throw new ValidationError("Pick exactly two different players");
  }
  for (const playerId of playerIds) {
    const player = game.players.find((candidate) => candidate.id === playerId);
    if (!player || player.teamId !== teamId || !player.active) {
      throw new ValidationError(`Player ${playerId} is not an active member of that team`);
    }
  }
  const questionCount = game.config.fastMoneyQuestionCount;
  const available = fastMoneySet(game).length;
  if (available < questionCount) {
    throw new ConflictError(`Fast Money needs ${questionCount} questions; ${available} available`);
  }

  const responses = emptyResponses(questionCount);
  // Rows from an earlier selection that no longer exist (question count changed) are removed.
  const stale = game.fastMoney.responses
    .filter((r) => r.questionIndex >= questionCount)
    .map((r) => keys.fastMoneyResponse(gameId, r.slot, r.questionIndex));
  await batchWrite(
    responses.map((r) => fastMoneyResponseItem(gameId, r)),
    stale,
  );
  await patchMeta(gameId, { fastMoneyTeamId: teamId, fastMoneyPlayerIds: playerIds, timerEndsAt: null });

  return gameUpdate(withFastMoney(game, { teamId, playerIds, timerEndsAt: null, responses }), "FM_PLAYERS_SELECTED");
}

/** Start player 1's or player 2's timer using the configured seconds. */
export async function startFastMoneyTurn(args: Args): Promise<GameUpdate> {
  const gameId = requiredString(args, "gameId");
  const hostToken = requiredString(args, "hostToken");
  const slot = requiredInt(args, "slot", { min: 1, max: 2 }) as FastMoneySlot;

  const game = await requireHost(gameId, hostToken);
  requireFastMoney(game);
  const { stage, playerIds, timerEndsAt } = game.fastMoney;
  if (playerIds.length !== 2) throw new ConflictError("Select the two Fast Money players first");
  if (timerEndsAt !== null) throw new ConflictError("A turn is already running");
  if (slot === 1 && stage !== "SETUP") throw new ConflictError("Player 1 has already had their turn");
  if (slot === 2 && stage !== "P2_ANSWERING") throw new ConflictError("Player 2's turn comes after player 1's");

  const seconds = slot === 1 ? game.config.fastMoneyP1Seconds : game.config.fastMoneyP2Seconds;
  const endsAt = serverTime() + seconds * 1000;
  const nextStage: FastMoneyStage = slot === 1 ? "P1_ANSWERING" : "P2_ANSWERING";
  await patchMeta(gameId, { fastMoneyStage: nextStage, timerEndsAt: endsAt });
  return gameUpdate(withFastMoney(game, { stage: nextStage, timerEndsAt: endsAt }), "FM_TIMER_STARTED");
}

/** End the running turn (early or after the clock ran out). P1 → waiting for P2; P2 → reveal. */
export async function endFastMoneyTurn(args: Args): Promise<GameUpdate> {
  const gameId = requiredString(args, "gameId");
  const hostToken = requiredString(args, "hostToken");

  const game = await requireHost(gameId, hostToken);
  requireFastMoney(game);
  const slot = activeSlot(game);
  if (slot === null) throw new ConflictError("No Fast Money turn is running");
  const nextStage: FastMoneyStage = slot === 1 ? "P2_ANSWERING" : "REVEAL";
  await patchMeta(gameId, { fastMoneyStage: nextStage, timerEndsAt: null });
  return gameUpdate(withFastMoney(game, { stage: nextStage, timerEndsAt: null }), "FM_TURN_ENDED");
}

/* ---------- 4.3 — the answering player's view and mutations ---------- */

export const MAX_FM_ANSWER_LENGTH = 60;

export interface FastMoneyPrompt {
  questionIndex: number;
  text: string;
}

/** The schema's `FastMoneyView`. */
export interface FastMoneyViewPayload {
  slot: number;
  timerEndsAt: number | null;
  serverTime: number;
  queue: FastMoneyPrompt[];
  answered: number;
  total: number;
}

/** Which slot this player holds (1/2), or 0 if they are not a Fast Money player. */
function slotOf(game: FullGame, playerId: string): FastMoneySlot | 0 {
  const index = game.fastMoney.playerIds.indexOf(playerId);
  return index === 0 ? 1 : index === 1 ? 2 : 0;
}

/**
 * Only the player whose turn is running gets a queue; everyone else (the
 * other player, spectators) gets an empty one, so questions never reach a
 * device that should not have them.
 */
export function toFastMoneyView(game: FullGame, playerId: string): FastMoneyViewPayload {
  const slot = slotOf(game, playerId);
  const total = game.config.fastMoneyQuestionCount;
  const active = activeSlot(game);
  const mine = slot === 0 ? [] : game.fastMoney.responses.filter((r) => r.slot === slot);
  const answered = mine.filter((r) => r.answer !== null).length;
  const isActive = slot !== 0 && slot === active;
  const questions = fastMoneySet(game);
  const queue = isActive
    ? buildQueue(game.fastMoney.responses, slot).flatMap((questionIndex) => {
        const question = questions[questionIndex];
        return question ? [{ questionIndex, text: question.text }] : [];
      })
    : [];
  return { slot, timerEndsAt: isActive ? game.fastMoney.timerEndsAt : null, serverTime: serverTime(), queue, answered, total };
}

export async function fastMoneyView(args: Args): Promise<FastMoneyViewPayload | null> {
  const gameId = requiredString(args, "gameId");
  const playerId = requiredString(args, "playerId");
  const game = await loadGame(gameId);
  if (!game) return null;
  return toFastMoneyView(game, playerId);
}

/** Load, check this player is the one answering and the clock has not run out. */
async function requireAnswering(gameId: string, playerId: string): Promise<{ game: FullGame; slot: FastMoneySlot }> {
  const game = await loadGame(gameId);
  if (!game) throw new NotFoundError("No such game");
  requireFastMoney(game);
  const slot = slotOf(game, playerId);
  if (slot === 0) throw new ForbiddenError("You are not a Fast Money player");
  if (activeSlot(game) !== slot) throw new ConflictError("It is not your turn");
  if (!isWithinDeadline(serverTime(), game.fastMoney.timerEndsAt)) throw new ConflictError("Time is up");
  return { game, slot };
}

async function persistResponse(gameId: string, game: FullGame, responses: FastMoneyResponse[], slot: FastMoneySlot, questionIndex: number, playerId: string): Promise<FastMoneyViewPayload> {
  const changed = responses.find((r) => r.slot === slot && r.questionIndex === questionIndex);
  if (!changed) throw new NotFoundError(`No Fast Money question ${questionIndex}`);
  await putItem(fastMoneyResponseItem(gameId, changed));
  return toFastMoneyView(withFastMoney(game, { responses }), playerId);
}

function applyOrConflict<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    throw new ConflictError(error instanceof Error ? error.message : String(error));
  }
}

export async function submitFastMoneyAnswer(args: Args): Promise<FastMoneyViewPayload> {
  const gameId = requiredString(args, "gameId");
  const playerId = requiredString(args, "playerId");
  const questionIndex = requiredInt(args, "questionIndex", { min: 0 });
  const answer = requiredString(args, "answer", { maxLength: MAX_FM_ANSWER_LENGTH });

  const { game, slot } = await requireAnswering(gameId, playerId);
  const responses = applyOrConflict(() => answerQuestion(game.fastMoney.responses, slot, questionIndex, answer));
  return persistResponse(gameId, game, responses, slot, questionIndex, playerId);
}

export async function skipFastMoneyQuestion(args: Args): Promise<FastMoneyViewPayload> {
  const gameId = requiredString(args, "gameId");
  const playerId = requiredString(args, "playerId");
  const questionIndex = requiredInt(args, "questionIndex", { min: 0 });

  const { game, slot } = await requireAnswering(gameId, playerId);
  const responses = applyOrConflict(() => skipQuestion(game.fastMoney.responses, slot, questionIndex));
  return persistResponse(gameId, game, responses, slot, questionIndex, playerId);
}

/* ---------- 4.4 — duplicate buzz ---------- */

/**
 * Host flags player 2's answer as a duplicate of player 1's. The answer is
 * cleared so the question comes straight back around, and the returned
 * PlayerMessage is what AppSync fans out to player 2 (this mutation is in the
 * onPlayerMessage subscribe list, so no self-call is needed).
 */
export async function buzzDuplicate(args: Args): Promise<PlayerMessage> {
  const gameId = requiredString(args, "gameId");
  const hostToken = requiredString(args, "hostToken");
  const questionIndex = requiredInt(args, "questionIndex", { min: 0 });

  const game = await requireHost(gameId, hostToken);
  requireFastMoney(game);
  if (game.fastMoney.stage !== "P2_ANSWERING") throw new ConflictError("Duplicates can only be buzzed during player 2's turn");
  const playerId = game.fastMoney.playerIds[1];
  if (!playerId) throw new ConflictError("Player 2 has not been selected");
  const row = game.fastMoney.responses.find((r) => r.slot === 2 && r.questionIndex === questionIndex);
  if (!row) throw new NotFoundError(`No Fast Money question ${questionIndex}`);
  if (row.answer === null) throw new ConflictError("Player 2 has not answered that question");

  const responses = clearAnswer(game.fastMoney.responses, 2, questionIndex);
  const cleared = responses.find((r) => r.slot === 2 && r.questionIndex === questionIndex);
  if (cleared) await putItem(fastMoneyResponseItem(gameId, cleared));
  return playerMessage(gameId, playerId, "FAST_MONEY_DUPLICATE", String(questionIndex));
}

/* ---------- 4.5 — reveal and finish ---------- */

/**
 * Reveal one answer. The host decides which board answer it matches
 * (`matchedIndex`), or null for "not on the board" = 0 points. The public
 * total is derived from revealed rows, so the win at `fastMoneyTarget` is
 * visible to every screen from the broadcast alone.
 */
export async function revealFastMoneyAnswer(args: Args): Promise<GameUpdate> {
  const gameId = requiredString(args, "gameId");
  const hostToken = requiredString(args, "hostToken");
  const slot = requiredInt(args, "slot", { min: 1, max: 2 }) as FastMoneySlot;
  const questionIndex = requiredInt(args, "questionIndex", { min: 0 });
  const matchedIndex = optionalInt(args, "matchedIndex", { min: 0 }) ?? null;

  const game = await requireHost(gameId, hostToken);
  requireFastMoney(game);
  if (game.fastMoney.stage !== "REVEAL") throw new ConflictError("Answers are revealed after both turns");
  const row = game.fastMoney.responses.find((r) => r.slot === slot && r.questionIndex === questionIndex);
  if (!row) throw new NotFoundError(`No Fast Money question ${questionIndex}`);
  if (row.revealed) throw new ConflictError("That answer is already revealed");

  let points = 0;
  if (matchedIndex !== null) {
    const question = fastMoneySet(game)[questionIndex];
    const match = question?.answers[matchedIndex];
    if (!match) throw new ValidationError(`Question ${questionIndex + 1} has no board answer ${matchedIndex + 1}`);
    points = match.points;
  }
  const revealed: FastMoneyResponse = { ...row, revealed: true, matchedIndex, points };
  await putItem(fastMoneyResponseItem(gameId, revealed));
  const responses = game.fastMoney.responses.map((r) => (r.slot === slot && r.questionIndex === questionIndex ? revealed : r));
  return gameUpdate(withFastMoney(game, { responses }), "FM_ANSWER_REVEALED");
}

/** Wrap up: FAST_MONEY → FINISHED. Allowed at any Fast Money stage so a host can call it a night. */
export async function finishGame(args: Args): Promise<GameUpdate> {
  const gameId = requiredString(args, "gameId");
  const hostToken = requiredString(args, "hostToken");

  const game = await requireHost(gameId, hostToken);
  requireFastMoney(game);
  await updateItem(keys.game(gameId), {
    updateExpression: "SET #status = :finished, fastMoneyStage = :done, timerEndsAt = :null",
    names: { "#status": "status" },
    values: { ":finished": "FINISHED", ":done": "DONE", ":null": null },
    conditionExpression: "attribute_exists(pk)",
  });
  return gameUpdate({ ...withFastMoney(game, { stage: "DONE", timerEndsAt: null }), status: "FINISHED" }, "GAME_FINISHED");
}

