// Task 3.1 — pure round state machine. See PLAN.md.
import type { BoardAnswer, GameConfig, Player, RoundData, Survey } from "./types.js";

export type RoundAction =
  | { type: "ARM_BUZZERS" }
  | { type: "BUZZ"; playerId: string }
  | { type: "RESET_BUZZERS" }
  | { type: "REVEAL"; index: number }
  | { type: "STRIKE" }
  | { type: "SET_FACE_OFF_WINNER"; teamId: string }
  | { type: "CHOOSE_PASS_OR_PLAY"; playingTeamId: string }
  | { type: "SKIP_GUESSER" }
  | { type: "END_ROUND" };

export type RoundEvent =
  | { type: "BUZZERS_ARMED" }
  | { type: "BUZZ"; playerId: string }
  | { type: "BUZZERS_RESET" }
  | { type: "ANSWER_REVEALED"; index: number; points: number }
  | { type: "STRIKE"; strikes: number }
  | { type: "FACE_OFF_WON"; teamId: string }
  | { type: "PLAYING"; teamId: string }
  | { type: "GUESSER_CHANGED"; playerId: string }
  | { type: "STEAL_OPPORTUNITY"; teamId: string }
  | { type: "POT_AWARDED"; teamId: string; points: number }
  | { type: "ROUND_ENDED" };

export interface RoundContext {
  config: GameConfig;
  players: readonly Player[];
  teamIds: readonly [string, string];
}

export interface RoundResult {
  round: RoundData;
  events: RoundEvent[];
}

/** Build the board from a survey, sorted by points descending (index 0 = #1 answer). */
export function makeBoard(_survey: Survey): BoardAnswer[] {
  throw new Error("Not implemented: makeBoard (Task 3.1)");
}

export function createRound(
  _number: number,
  _survey: Survey,
  _multiplier: number,
  _contestants: Record<string, string>,
): RoundData {
  throw new Error("Not implemented: createRound (Task 3.1)");
}

export function currentGuesser(_round: RoundData): string | null {
  throw new Error("Not implemented: currentGuesser (Task 3.1)");
}

/**
 * Pure state machine for one round (see the state table in PLAN.md). Throws on illegal
 * transitions; never mutates its input; returns events for the Lambda to fan out.
 */
export function roundReducer(_round: RoundData, _action: RoundAction, _ctx: RoundContext): RoundResult {
  throw new Error("Not implemented: roundReducer (Task 3.1)");
}
