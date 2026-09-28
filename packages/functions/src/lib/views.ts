/**
 * Response shapes the GraphQL schema asks for. `toPublicGame` is the ONLY way a
 * `Game` leaves the API, and it strips everything players must not see; the
 * host view is built on top of it and gated by `requireHost`.
 */
import {
  toPublicFastMoneyRows,
  toPublicRound,
  type BoardAnswer,
  type FastMoneyQuestion,
  type FastMoneyStage,
  type GameConfig,
  type GameStatus,
  type Player,
  type PublicRound,
  type Survey,
  type Team,
} from "@familyfeud/core";
import { currentRoundOf, type FullGame } from "./gameState.js";
import { serverTime } from "./time.js";

export interface TeamView extends Team {
  players: Player[];
}

export interface FastMoneyView {
  stage: FastMoneyStage;
  teamId: string | null;
  playerIds: string[];
  timerEndsAt: number | null;
  rows: ReturnType<typeof toPublicFastMoneyRows>;
  total: number;
}

/** The schema's `Game` type: the public, player-safe view. */
export interface GameView {
  id: string;
  joinCode: string;
  status: GameStatus;
  config: GameConfig;
  players: Player[];
  teams: TeamView[];
  currentRound: PublicRound | null;
  fastMoney: FastMoneyView | null;
}

export function teamPlayers(players: readonly Player[], teamId: string): Player[] {
  return players.filter((player) => player.teamId === teamId).sort((a, b) => a.order - b.order);
}

export function toPublicGame(game: FullGame): GameView {
  const round = currentRoundOf(game);
  return {
    id: game.id,
    joinCode: game.joinCode,
    status: game.status,
    config: game.config,
    players: game.players,
    teams: game.teams.map((team) => ({ ...team, players: teamPlayers(game.players, team.id) })),
    currentRound: round ? toPublicRound(round) : null,
    fastMoney:
      game.status === "FAST_MONEY" || game.status === "FINISHED"
        ? {
            stage: game.fastMoney.stage,
            teamId: game.fastMoney.teamId,
            playerIds: game.fastMoney.playerIds,
            timerEndsAt: game.fastMoney.timerEndsAt,
            rows: toPublicFastMoneyRows(game.fastMoney.responses),
            total: game.fastMoney.responses
              .filter((response) => response.revealed)
              .reduce((sum, response) => sum + response.points, 0),
          }
        : null,
  };
}

export interface HostFastMoneyRow {
  slot: number;
  questionIndex: number;
  answer: string | null;
  skipped: boolean;
  likelyDuplicate: boolean;
  matchedIndex: number | null;
  points: number | null;
  revealed: boolean;
}

/** The schema's `HostGame`: public view plus everything hidden from players. */
export interface HostGameView {
  game: GameView;
  surveys: Survey[];
  fastMoneyQuestions: FastMoneyQuestion[];
  currentBoard: BoardAnswer[];
  currentQuestion: string | null;
  fastMoneyAnswers: HostFastMoneyRow[];
}

/**
 * Everything the host console needs. Only ever returned after `requireHost`.
 * `likelyDuplicate` is wired to core `isDuplicate` in Task 4.4; until then it
 * is always false.
 */
export function toHostGame(game: FullGame): HostGameView {
  const round = currentRoundOf(game);
  return {
    game: toPublicGame(game),
    surveys: game.surveys,
    fastMoneyQuestions: game.fastMoneyQuestions,
    currentBoard: round ? round.board : [],
    currentQuestion: round ? round.questionText : null,
    fastMoneyAnswers: game.fastMoney.responses.map((response) => ({
      slot: response.slot,
      questionIndex: response.questionIndex,
      answer: response.answer,
      skipped: response.skipped,
      likelyDuplicate: false,
      matchedIndex: response.matchedIndex,
      points: response.revealed ? response.points : null,
      revealed: response.revealed,
    })),
  };
}

/**
 * Event hints carried by `GameUpdate`. Named so a typo in a handler is a compile
 * error instead of a subscription filter that never matches.
 */
export type GameEvent =
  | "PLAYER_JOINED"
  | "CONFIG_UPDATED"
  | "TEAMS_SET"
  | "TEAM_RENAMED"
  | "ROSTER_CHANGED"
  | "ROUND_STARTED"
  | "CONTESTANT_SKIPPED"
  | "BUZZERS_ARMED"
  | "BUZZERS_RESET"
  | "BUZZ"
  | "ANSWER_REVEALED"
  | "STRIKE"
  | "FACE_OFF_WON"
  | "PLAYING"
  | "GUESSER_CHANGED"
  | "STEAL_OPPORTUNITY"
  | "POT_AWARDED"
  | "ROUND_ENDED"
  | "FM_PLAYERS_SELECTED"
  | "FM_TIMER_STARTED"
  | "FM_TURN_ENDED"
  | "FM_ANSWER_REVEALED"
  | "GAME_FINISHED";

export interface GameUpdate {
  gameId: string;
  event: GameEvent;
  serverTime: number;
  game: GameView;
}

/**
 * Wrap a game as a `GameUpdate`. Fanned out to every subscriber, players
 * included, so `game` is always the public view — never the host view.
 */
export function gameUpdate(game: FullGame, event: GameEvent): GameUpdate {
  return { gameId: game.id, event, serverTime: serverTime(), game: toPublicGame(game) };
}
