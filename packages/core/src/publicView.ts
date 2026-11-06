// Task 3.2 — strip hidden data for the broadcast payload. See PLAN.md.
import { currentGuesser } from "./round.js";
import type { BoardAnswer, FastMoneyResponse, PublicBoardAnswer, PublicRound, RoundData, RoundState } from "./types.js";

/** Unrevealed slots carry only their index: no text, no points. */
export function toPublicBoard(board: readonly BoardAnswer[]): PublicBoardAnswer[] {
  return board.map((slot) =>
    slot.revealed
      ? { index: slot.index, text: slot.text, points: slot.points, revealed: true }
      : { index: slot.index, text: null, points: null, revealed: false },
  );
}

/** The closing reveal runs from the bottom of the board up, so the top answer lands last. */
export function nextClosingReveal<T extends { index: number; revealed: boolean }>(board: readonly T[]): T | undefined {
  return board.reduce<T | undefined>((lowest, slot) => (!slot.revealed && (!lowest || slot.index > lowest.index) ? slot : lowest), undefined);
}

/** The question is read aloud only once the buzzers are armed; before that it stays hidden. */
const QUESTION_HIDDEN_STATES: ReadonlySet<RoundState> = new Set(["PICK_CONTESTANTS"]);

export function toPublicRound(round: RoundData): PublicRound {
  return {
    number: round.number,
    multiplier: round.multiplier,
    state: round.state,
    questionText: QUESTION_HIDDEN_STATES.has(round.state) ? null : round.questionText,
    board: toPublicBoard(round.board),
    contestantPlayerIds: Object.values(round.contestants),
    buzzWinnerPlayerId: round.buzzWinnerPlayerId,
    faceOffWinnerTeamId: round.faceOffWinnerTeamId,
    playingTeamId: round.playingTeamId,
    currentGuesserPlayerId: currentGuesser(round),
    strikes: round.strikes,
    pot: round.pot,
    awardedToTeamId: round.awardedToTeamId,
  };
}

export interface PublicFastMoneyRow {
  slot: number;
  questionIndex: number;
  answer: string | null;
  points: number | null;
  revealed: boolean;
  skipped: boolean;
}

/** Answers and points are hidden until the host reveals that row. */
export function toPublicFastMoneyRows(responses: readonly FastMoneyResponse[]): PublicFastMoneyRow[] {
  return responses.map((response) => ({
    slot: response.slot,
    questionIndex: response.questionIndex,
    answer: response.revealed ? response.answer : null,
    points: response.revealed ? response.points : null,
    revealed: response.revealed,
    skipped: response.skipped,
  }));
}
