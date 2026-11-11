/**
 * Shapes as they come back from the GraphQL API. Core types are reused where
 * the schema mirrors them exactly; the rest are declared here.
 */
import type {
  FastMoneyQuestion,
  FastMoneyStage,
  GameConfig,
  GameStatus,
  Player,
  PublicRound,
  Survey,
  BoardAnswer,
} from "@familyfeud/core";

export type { FastMoneyQuestion, GameConfig, GameStatus, Player, PublicRound, Survey, BoardAnswer };

export interface ApiTeam {
  id: string;
  name: string;
  score: number;
  players: Player[];
}

export interface ApiFastMoneyRow {
  slot: number;
  questionIndex: number;
  answer: string | null;
  points: number | null;
  revealed: boolean;
  skipped: boolean;
}

export interface ApiFastMoney {
  stage: FastMoneyStage;
  teamId: string | null;
  playerIds: string[];
  timerEndsAt: number | null;
  rows: ApiFastMoneyRow[];
  total: number;
}

/** The schema's `Game` (public view). */
export interface ApiGame {
  id: string;
  joinCode: string;
  status: GameStatus;
  config: GameConfig;
  players: Player[];
  teams: ApiTeam[];
  currentRound: PublicRound | null;
  fastMoney: ApiFastMoney | null;
}

export interface ApiGameUpdate {
  gameId: string;
  event: string;
  serverTime: number;
  game: ApiGame;
}

export interface ApiHostFastMoneyRow extends ApiFastMoneyRow {
  likelyDuplicate: boolean;
  matchedIndex: number | null;
}

/** The schema's `Lineup`: host pins per slot (null = random) and the drawn order once round 1 starts. */
export interface ApiLineup {
  surveyPins: (number | null)[];
  fastMoneyPins: (number | null)[];
  surveys: number[] | null;
  fastMoney: number[] | null;
}

/** The schema's `HostGame`. */
export interface ApiHostGame {
  game: ApiGame;
  surveys: Survey[];
  fastMoneyQuestions: FastMoneyQuestion[];
  /** Fast Money questions in play order; `questionIndex` indexes into this. */
  fastMoneyInPlay: FastMoneyQuestion[];
  lineup: ApiLineup;
  currentBoard: BoardAnswer[];
  currentQuestion: string | null;
  fastMoneyAnswers: ApiHostFastMoneyRow[];
}

export type PlayerMessageType = "YOU_ARE_UP" | "BUZZ_RESULT" | "FAST_MONEY_DUPLICATE" | "REMOVED";

export interface ApiPlayerMessage {
  gameId: string;
  playerId: string;
  type: PlayerMessageType;
  detail: string | null;
  serverTime: number;
}

/** The schema's `TeamMessage`. `sentAt` is server time in milliseconds. */
export interface ApiTeamMessage {
  gameId: string;
  teamId: string;
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  sentAt: number;
}

export interface ApiFastMoneyPrompt {
  questionIndex: number;
  text: string;
}

/** The schema's `FastMoneyView`: what the answering player sees. */
export interface ApiFastMoneyView {
  slot: number;
  timerEndsAt: number | null;
  serverTime: number;
  queue: ApiFastMoneyPrompt[];
  answered: number;
  total: number;
}

export interface SurveyAnswerInput {
  text: string;
  points: number;
}

export type GameConfigInput = Partial<GameConfig>;
