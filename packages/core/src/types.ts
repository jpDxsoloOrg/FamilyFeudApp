export type GameStatus = "LOBBY" | "TEAMS_SET" | "ROUND_ACTIVE" | "FAST_MONEY" | "FINISHED";

export type RoundState =
  | "PICK_CONTESTANTS"
  | "FACE_OFF_ARMED"
  | "FACE_OFF_ANSWERING"
  | "PASS_OR_PLAY"
  | "PLAYING"
  | "STEAL"
  | "REVEAL_REMAINING"
  | "ENDED";

export type FastMoneyStage = "SETUP" | "P1_ANSWERING" | "P2_ANSWERING" | "REVEAL" | "DONE";

export type FastMoneySlot = 1 | 2;

export interface GameConfig {
  roundCount: number;
  /** One multiplier per round, e.g. [1, 1, 2, 3]. */
  roundMultipliers: number[];
  strikesToSteal: number;
  fastMoneyQuestionCount: number;
  fastMoneyP1Seconds: number;
  fastMoneyP2Seconds: number;
  fastMoneyTarget: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  roundCount: 4,
  roundMultipliers: [1, 1, 2, 3],
  strikesToSteal: 3,
  fastMoneyQuestionCount: 5,
  fastMoneyP1Seconds: 50,
  fastMoneyP2Seconds: 55,
  fastMoneyTarget: 200,
};

export interface Player {
  id: string;
  displayName: string;
  /** Null while unassigned (late joiner awaiting manual assignment). */
  teamId: string | null;
  /** Position within the team's turn order (0-based). */
  order: number;
  /** False once removed by the host; skipped in rotation. */
  active: boolean;
}

export interface Team {
  id: string;
  name: string;
  /** Display position (0 = first). Stable across renames and re-draws. */
  order: number;
  score: number;
  /** How many contestants have been pulled from this team so far. */
  nextContestantCursor: number;
}

export interface SurveyAnswer {
  text: string;
  points: number;
}

export interface Survey {
  number: number;
  text: string;
  /** Sorted by points descending; index 0 is the #1 answer. */
  answers: SurveyAnswer[];
  used: boolean;
}

export interface BoardAnswer {
  index: number;
  text: string;
  points: number;
  revealed: boolean;
}

/** Public-safe board slot: text/points hidden until revealed. */
export interface PublicBoardAnswer {
  index: number;
  text: string | null;
  points: number | null;
  revealed: boolean;
}

export interface RoundData {
  number: number;
  surveyNumber: number;
  multiplier: number;
  state: RoundState;
  questionText: string;
  board: BoardAnswer[];
  /** teamId -> playerId for the two face-off contestants. */
  contestants: Record<string, string>;
  buzzWinnerPlayerId: string | null;
  faceOffWinnerTeamId: string | null;
  playingTeamId: string | null;
  /** Ordered guesser queue for the playing team (cyclic). */
  guesserQueue: string[];
  guesserIndex: number;
  strikes: number;
  pot: number;
  awardedToTeamId: string | null;
}

export interface PublicRound {
  number: number;
  multiplier: number;
  state: RoundState;
  questionText: string | null;
  board: PublicBoardAnswer[];
  contestantPlayerIds: string[];
  buzzWinnerPlayerId: string | null;
  faceOffWinnerTeamId: string | null;
  playingTeamId: string | null;
  currentGuesserPlayerId: string | null;
  strikes: number;
  pot: number;
  awardedToTeamId: string | null;
}

export interface FastMoneyQuestion {
  number: number;
  text: string;
  answers: SurveyAnswer[];
}

export interface FastMoneyResponse {
  slot: FastMoneySlot;
  questionIndex: number;
  answer: string | null;
  skipped: boolean;
  /** Monotonic counter so skipped questions come back in skip order. */
  skippedSeq: number | null;
  matchedIndex: number | null;
  points: number;
  revealed: boolean;
}

export interface FastMoneyState {
  stage: FastMoneyStage;
  teamId: string | null;
  playerIds: string[];
  timerEndsAt: number | null;
  responses: FastMoneyResponse[];
}

export type PlayerMessageType = "YOU_ARE_UP" | "BUZZ_RESULT" | "FAST_MONEY_DUPLICATE" | "REMOVED";
