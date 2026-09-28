// Task 3.4 — buzzer arbitration: one conditional UpdateItem, first write wins.
import { requiredString, type Args } from "../lib/args.js";
import { isConditionFailure, updateItem } from "../lib/db.js";
import { ForbiddenError, NotFoundError } from "../lib/errors.js";
import { loadGame, type FullGame } from "../lib/gameState.js";
import { keys } from "../lib/keys.js";
import { playerMessage, publishPlayerMessages } from "../lib/messages.js";
import { gameUpdate, type GameUpdate } from "../lib/views.js";
import { requireCurrentRound } from "./round.js";

export interface BuzzOutcome {
  update: GameUpdate;
  /** True when this call's write won the buzz. */
  won: boolean;
}

/**
 * `buzz(gameId, playerId)`: the round item moves FACE_OFF_ARMED → FACE_OFF_ANSWERING
 * under a ConditionExpression on the state, so of two near-simultaneous buzzes
 * exactly one write succeeds. The loser's conditional failure is swallowed and
 * the current state is returned — a lost buzz is a result, not an error.
 */
export async function buzzWithOutcome(args: Args): Promise<BuzzOutcome> {
  const gameId = requiredString(args, "gameId");
  const playerId = requiredString(args, "playerId");

  const game = await loadGame(gameId);
  if (!game) throw new NotFoundError("No such game");
  const round = requireCurrentRound(game);
  if (!Object.values(round.contestants).includes(playerId)) {
    throw new ForbiddenError("Only the two face-off contestants can buzz");
  }
  if (round.state !== "FACE_OFF_ARMED") {
    // Late buzz (already resolved, or not yet armed): nothing to arbitrate.
    return { update: gameUpdate(game, "BUZZ"), won: false };
  }

  try {
    await updateItem(keys.round(gameId, round.number), {
      updateExpression: "SET #state = :answering, buzzWinnerPlayerId = :playerId",
      conditionExpression: "#state = :armed",
      names: { "#state": "state" },
      values: { ":answering": "FACE_OFF_ANSWERING", ":armed": "FACE_OFF_ARMED", ":playerId": playerId },
    });
  } catch (error) {
    if (!isConditionFailure(error)) throw error;
    const latest = await loadGame(gameId);
    if (!latest) throw new NotFoundError("No such game");
    return { update: gameUpdate(latest, "BUZZ"), won: false };
  }

  await publishPlayerMessages(
    Object.values(round.contestants).map((contestant) =>
      playerMessage(gameId, contestant, "BUZZ_RESULT", contestant === playerId ? "WON" : "LOST"),
    ),
  );

  const won: FullGame = {
    ...game,
    rounds: game.rounds.map((r) =>
      r.number === round.number ? { ...r, state: "FACE_OFF_ANSWERING", buzzWinnerPlayerId: playerId } : r,
    ),
  };
  return { update: gameUpdate(won, "BUZZ"), won: true };
}

export async function buzz(args: Args): Promise<GameUpdate> {
  return (await buzzWithOutcome(args)).update;
}

