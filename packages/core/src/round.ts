// Task 3.1 — pure round state machine. See the state table in PLAN.md.
import { activeRoster, guesserOrderAfter } from "./rotation.js";
import type { BoardAnswer, GameConfig, Player, RoundData, Survey } from "./types.js";

export type RoundAction =
  | { type: "SET_CONTESTANT"; teamId: string; playerId: string }
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
  | { type: "CONTESTANT_CHANGED"; teamId: string; playerId: string }
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

export class IllegalTransitionError extends Error {
  constructor(round: RoundData, action: RoundAction["type"]) {
    super(`Cannot ${action} while the round is ${round.state}`);
    this.name = "IllegalTransitionError";
  }
}

/** Build the board from a survey, sorted by points descending (index 0 = #1 answer). */
export function makeBoard(survey: Survey): BoardAnswer[] {
  return [...survey.answers]
    .map((answer, index) => ({ answer, index }))
    .sort((a, b) => b.answer.points - a.answer.points || a.index - b.index)
    .map(({ answer }, index) => ({ index, text: answer.text, points: answer.points, revealed: false }));
}

export function createRound(
  number: number,
  survey: Survey,
  multiplier: number,
  contestants: Record<string, string>,
): RoundData {
  if (!Number.isInteger(multiplier) || multiplier < 1) {
    throw new Error(`Round multiplier must be a positive integer, got ${multiplier}`);
  }
  return {
    number,
    surveyNumber: survey.number,
    multiplier,
    state: "PICK_CONTESTANTS",
    questionText: survey.text,
    board: makeBoard(survey),
    contestants: { ...contestants },
    buzzWinnerPlayerId: null,
    faceOffWinnerTeamId: null,
    playingTeamId: null,
    guesserQueue: [],
    guesserIndex: 0,
    strikes: 0,
    pot: 0,
    awardedToTeamId: null,
  };
}

/** Whose turn it is to guess while the board is being played; null in every other state. */
export function currentGuesser(round: RoundData): string | null {
  if (round.state !== "PLAYING" || round.guesserQueue.length === 0) return null;
  return round.guesserQueue[round.guesserIndex % round.guesserQueue.length] ?? null;
}

export function allRevealed(board: readonly BoardAnswer[]): boolean {
  return board.every((slot) => slot.revealed);
}

function otherTeam(ctx: RoundContext, teamId: string): string {
  const other = ctx.teamIds.find((id) => id !== teamId);
  if (!other) throw new Error(`No opposing team for ${teamId}`);
  return other;
}

function requireTeam(ctx: RoundContext, teamId: string): void {
  if (!ctx.teamIds.includes(teamId)) throw new Error(`Unknown team: ${teamId}`);
}

function reveal(round: RoundData, index: number): { board: BoardAnswer[]; points: number } {
  const slot = round.board[index];
  if (!slot) throw new Error(`No board answer at index ${index}`);
  if (slot.revealed) throw new Error(`Answer ${index + 1} is already revealed`);
  return {
    board: round.board.map((s) => (s.index === index ? { ...s, revealed: true } : s)),
    points: slot.points,
  };
}

function advanceGuesser(round: RoundData, events: RoundEvent[]): RoundData {
  if (round.guesserQueue.length === 0) return round;
  const next = { ...round, guesserIndex: (round.guesserIndex + 1) % round.guesserQueue.length };
  const guesser = currentGuesser(next);
  if (guesser) events.push({ type: "GUESSER_CHANGED", playerId: guesser });
  return next;
}

/** Hand the pot to a team and move to revealing whatever is left. */
function award(round: RoundData, teamId: string, events: RoundEvent[]): RoundData {
  events.push({ type: "POT_AWARDED", teamId, points: round.pot });
  return { ...round, state: "REVEAL_REMAINING", awardedToTeamId: teamId, guesserQueue: [], guesserIndex: 0 };
}

/**
 * Pure state machine for one round. Throws on illegal transitions; never
 * mutates its input; returns events for the Lambda to fan out.
 */
export function roundReducer(round: RoundData, action: RoundAction, ctx: RoundContext): RoundResult {
  const events: RoundEvent[] = [];
  const illegal = (): never => {
    throw new IllegalTransitionError(round, action.type);
  };

  switch (action.type) {
    case "SET_CONTESTANT": {
      if (round.state !== "PICK_CONTESTANTS") return illegal();
      requireTeam(ctx, action.teamId);
      const player = ctx.players.find((p) => p.id === action.playerId);
      if (!player || player.teamId !== action.teamId) {
        throw new Error(`Player ${action.playerId} is not on team ${action.teamId}`);
      }
      events.push({ type: "CONTESTANT_CHANGED", teamId: action.teamId, playerId: action.playerId });
      return { round: { ...round, contestants: { ...round.contestants, [action.teamId]: action.playerId } }, events };
    }

    case "ARM_BUZZERS": {
      if (round.state !== "PICK_CONTESTANTS") return illegal();
      for (const teamId of ctx.teamIds) {
        if (!round.contestants[teamId]) throw new Error(`Team ${teamId} has no contestant`);
      }
      events.push({ type: "BUZZERS_ARMED" });
      return { round: { ...round, state: "FACE_OFF_ARMED", buzzWinnerPlayerId: null }, events };
    }

    case "BUZZ": {
      if (round.state !== "FACE_OFF_ARMED") return illegal();
      if (!Object.values(round.contestants).includes(action.playerId)) {
        throw new Error(`Player ${action.playerId} is not a face-off contestant`);
      }
      events.push({ type: "BUZZ", playerId: action.playerId });
      return { round: { ...round, state: "FACE_OFF_ANSWERING", buzzWinnerPlayerId: action.playerId }, events };
    }

    case "RESET_BUZZERS": {
      if (round.state !== "FACE_OFF_ARMED" && round.state !== "FACE_OFF_ANSWERING") return illegal();
      events.push({ type: "BUZZERS_RESET" });
      return { round: { ...round, state: "FACE_OFF_ARMED", buzzWinnerPlayerId: null }, events };
    }

    case "SET_FACE_OFF_WINNER": {
      if (round.state !== "FACE_OFF_ARMED" && round.state !== "FACE_OFF_ANSWERING") return illegal();
      requireTeam(ctx, action.teamId);
      events.push({ type: "FACE_OFF_WON", teamId: action.teamId });
      return { round: { ...round, state: "PASS_OR_PLAY", faceOffWinnerTeamId: action.teamId, strikes: 0 }, events };
    }

    case "CHOOSE_PASS_OR_PLAY": {
      if (round.state !== "PASS_OR_PLAY") return illegal();
      requireTeam(ctx, action.playingTeamId);
      const roster = activeRoster(ctx.players, action.playingTeamId);
      const queue = guesserOrderAfter(roster, round.contestants[action.playingTeamId] ?? "");
      let next: RoundData = {
        ...round,
        state: "PLAYING",
        playingTeamId: action.playingTeamId,
        guesserQueue: queue,
        guesserIndex: 0,
        strikes: 0,
      };
      events.push({ type: "PLAYING", teamId: action.playingTeamId });
      if (allRevealed(next.board)) {
        // Nothing left to guess (e.g. a one-answer board revealed in the face-off).
        next = award(next, action.playingTeamId, events);
      } else {
        const guesser = currentGuesser(next);
        if (guesser) events.push({ type: "GUESSER_CHANGED", playerId: guesser });
      }
      return { round: next, events };
    }

    case "REVEAL": {
      switch (round.state) {
        case "FACE_OFF_ANSWERING": {
          const { board, points } = reveal(round, action.index);
          const earned = points * round.multiplier;
          events.push({ type: "ANSWER_REVEALED", index: action.index, points: earned });
          return { round: { ...round, board, pot: round.pot + earned }, events };
        }
        case "PLAYING": {
          const { board, points } = reveal(round, action.index);
          const earned = points * round.multiplier;
          events.push({ type: "ANSWER_REVEALED", index: action.index, points: earned });
          let next: RoundData = { ...round, board, pot: round.pot + earned };
          if (allRevealed(board)) {
            next = award(next, round.playingTeamId ?? illegal(), events);
          } else {
            next = advanceGuesser(next, events);
          }
          return { round: next, events };
        }
        case "STEAL": {
          const { board, points } = reveal(round, action.index);
          const earned = points * round.multiplier;
          events.push({ type: "ANSWER_REVEALED", index: action.index, points: earned });
          const stealer = otherTeam(ctx, round.playingTeamId ?? illegal());
          return { round: award({ ...round, board, pot: round.pot + earned }, stealer, events), events };
        }
        case "REVEAL_REMAINING": {
          const { board } = reveal(round, action.index);
          events.push({ type: "ANSWER_REVEALED", index: action.index, points: 0 });
          return { round: { ...round, board }, events };
        }
        default:
          return illegal();
      }
    }

    case "STRIKE": {
      switch (round.state) {
        case "FACE_OFF_ANSWERING": {
          const strikes = round.strikes + 1;
          events.push({ type: "STRIKE", strikes });
          return { round: { ...round, strikes }, events };
        }
        case "PLAYING": {
          const strikes = round.strikes + 1;
          events.push({ type: "STRIKE", strikes });
          let next: RoundData = { ...round, strikes };
          if (strikes >= ctx.config.strikesToSteal) {
            const stealer = otherTeam(ctx, round.playingTeamId ?? illegal());
            events.push({ type: "STEAL_OPPORTUNITY", teamId: stealer });
            next = { ...next, state: "STEAL", guesserQueue: [], guesserIndex: 0 };
          } else {
            next = advanceGuesser(next, events);
          }
          return { round: next, events };
        }
        case "STEAL": {
          events.push({ type: "STRIKE", strikes: round.strikes + 1 });
          return { round: award({ ...round, strikes: round.strikes + 1 }, round.playingTeamId ?? illegal(), events), events };
        }
        default:
          return illegal();
      }
    }

    case "SKIP_GUESSER": {
      if (round.state !== "PLAYING") return illegal();
      return { round: advanceGuesser(round, events), events };
    }

    case "END_ROUND": {
      if (round.state !== "REVEAL_REMAINING") return illegal();
      events.push({ type: "ROUND_ENDED" });
      return { round: { ...round, state: "ENDED" }, events };
    }

    default: {
      const exhaustive: never = action;
      throw new Error(`Unknown action ${JSON.stringify(exhaustive)}`);
    }
  }
}
