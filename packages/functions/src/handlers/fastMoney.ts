// Tasks 4.2–4.5 — Fast Money. Thin persistence wrappers around core/fastMoney.
import { emptyResponses, type FastMoneySlot, type FastMoneyStage } from "@familyfeud/core";
import { requiredArray, requiredInt, requiredString, type Args } from "../lib/args.js";
import { requireHost } from "../lib/auth.js";
import { batchWrite, updateItem } from "../lib/db.js";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors.js";
import type { FullGame } from "../lib/gameState.js";
import { keys } from "../lib/keys.js";
import { fastMoneyResponseItem } from "../lib/mappers.js";
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
  if (game.fastMoneyQuestions.length < questionCount) {
    throw new ConflictError(`Fast Money needs ${questionCount} questions; ${game.fastMoneyQuestions.length} written`);
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

export async function fastMoneyView(_args: Args): Promise<unknown> {
  throw new Error("Not implemented: fastMoneyView (Task 4.3)");
}

export async function submitFastMoneyAnswer(_args: Args): Promise<unknown> {
  throw new Error("Not implemented: submitFastMoneyAnswer (Task 4.3)");
}

export async function skipFastMoneyQuestion(_args: Args): Promise<unknown> {
  throw new Error("Not implemented: skipFastMoneyQuestion (Task 4.3)");
}

export async function buzzDuplicate(_args: Args): Promise<unknown> {
  throw new Error("Not implemented: buzzDuplicate (Task 4.4)");
}

export async function revealFastMoneyAnswer(_args: Args): Promise<unknown> {
  throw new Error("Not implemented: revealFastMoneyAnswer (Task 4.5)");
}

export async function finishGame(_args: Args): Promise<unknown> {
  throw new Error("Not implemented: finishGame (Task 4.5)");
}

