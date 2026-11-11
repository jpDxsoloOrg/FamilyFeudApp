/**
 * Loading a whole game partition into one in-memory object.
 *
 * Every handler that returns a `Game` goes through `loadGame`, so there is one
 * assembly path and one place (views.ts) where visibility rules are applied.
 * Handlers that have just written adjust the loaded state and snapshot that,
 * rather than re-reading eventually-consistent data.
 */
import type {
  FastMoneyQuestion,
  FastMoneyState,
  GameConfig,
  GameStatus,
  Lineup,
  LineupPins,
  Player,
  RoundData,
  Survey,
  Team,
} from "@familyfeud/core";
import { getItem, queryPrefix, type Item } from "./db.js";
import { gamePk, keys, prefixes } from "./keys.js";
import {
  toFastMoneyQuestion,
  toFastMoneyResponse,
  toGameMeta,
  toPlayer,
  toRound,
  toSurvey,
  toTeam,
} from "./mappers.js";

export interface FullGame {
  id: string;
  joinCode: string;
  status: GameStatus;
  config: GameConfig;
  currentRound: number | null;
  createdAt: string;
  /** Kept here, never on a view, so it cannot ride out in a response by accident. */
  hostTokenHash: string;
  players: Player[];
  teams: Team[];
  surveys: Survey[];
  rounds: RoundData[];
  fastMoneyQuestions: FastMoneyQuestion[];
  fastMoney: FastMoneyState;
  lineupPins: LineupPins;
  /** Question numbers in play order; null until round 1 starts. */
  lineup: Lineup | null;
}

function byNumber<T extends { number: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.number - b.number);
}

/** Players sorted by team order, then by name for the unassigned bucket. */
export function sortPlayers(players: readonly Player[]): Player[] {
  return [...players].sort((a, b) => a.order - b.order || a.displayName.localeCompare(b.displayName));
}

function ofKind(items: Item[], prefix: string): Item[] {
  return items.filter((item) => item.sk.startsWith(prefix));
}

/** Read a whole game partition, or `undefined` when the game does not exist. */
export async function loadGame(gameId: string): Promise<FullGame | undefined> {
  const items = await queryPrefix(gamePk(gameId));
  const metaItem = items.find((item) => item.sk === "META");
  if (!metaItem) return undefined;
  return assembleGame(metaItem, items);
}

/** Cheaper existence + auth check when only the META item is needed. */
export async function loadGameMeta(gameId: string) {
  const item = await getItem(keys.game(gameId));
  return item ? toGameMeta(item) : undefined;
}

export function assembleGame(metaItem: Item, items: Item[]): FullGame {
  const meta = toGameMeta(metaItem);
  const responses = ofKind(items, prefixes.fastMoneyResponses).map(toFastMoneyResponse);
  return {
    id: meta.id,
    joinCode: meta.joinCode,
    status: meta.status,
    config: meta.config,
    currentRound: meta.currentRound,
    createdAt: meta.createdAt,
    hostTokenHash: meta.hostTokenHash,
    players: sortPlayers(ofKind(items, prefixes.players).map(toPlayer)),
    teams: ofKind(items, prefixes.teams)
      .map(toTeam)
      .sort((a, b) => a.order - b.order),
    surveys: byNumber(ofKind(items, prefixes.surveys).map(toSurvey)),
    rounds: byNumber(ofKind(items, prefixes.rounds).map(toRound)),
    fastMoneyQuestions: byNumber(ofKind(items, prefixes.fastMoneyQuestions).map(toFastMoneyQuestion)),
    fastMoney: {
      stage: meta.fastMoneyStage,
      teamId: meta.fastMoneyTeamId,
      playerIds: meta.fastMoneyPlayerIds,
      timerEndsAt: meta.timerEndsAt,
      responses: responses.sort((a, b) => a.slot - b.slot || a.questionIndex - b.questionIndex),
    },
    lineupPins: meta.lineupPins,
    lineup: meta.lineup,
  };
}

/** The round in play, if any. */
export function currentRoundOf(game: FullGame): RoundData | undefined {
  if (game.currentRound === null) return undefined;
  return game.rounds.find((round) => round.number === game.currentRound);
}

/**
 * The Fast Money questions in play order: the drawn lineup, or (for games
 * that predate lineups) the first N questions in the bank. `questionIndex` on
 * a Fast Money response indexes into this list.
 */
export function fastMoneySet(game: FullGame): FastMoneyQuestion[] {
  if (game.lineup && game.lineup.fastMoney.length > 0) {
    return game.lineup.fastMoney.flatMap((number) => game.fastMoneyQuestions.filter((q) => q.number === number));
  }
  return game.fastMoneyQuestions.slice(0, game.config.fastMoneyQuestionCount);
}
