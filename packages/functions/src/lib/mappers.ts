/**
 * Stored item shapes and the validating mappers that turn them back into core
 * types. DynamoDB returns `unknown` in practice, so everything is re-checked on
 * the way out rather than cast.
 */
import type {
  BoardAnswer,
  FastMoneyQuestion,
  FastMoneyResponse,
  FastMoneySlot,
  FastMoneyStage,
  GameConfig,
  GameStatus,
  Lineup,
  LineupPins,
  Player,
  RoundData,
  RoundState,
  Survey,
  SurveyAnswer,
  Team,
} from "@familyfeud/core";
import { DEFAULT_CONFIG } from "@familyfeud/core";
import type { Item } from "./db.js";
import { ValidationError } from "./errors.js";
import { suffixAfter } from "./keys.js";

export interface GameMetaItem extends Item {
  status: GameStatus;
  hostTokenHash: string;
  joinCode: string;
  config: GameConfig;
  currentRound: number | null;
  fastMoneyStage: FastMoneyStage;
  fastMoneyTeamId: string | null;
  fastMoneyPlayerIds: string[];
  timerEndsAt: number | null;
  createdAt: string;
  /** Host-pinned questions per slot (null = random). Absent on older games. */
  lineupPins?: LineupPins;
  /** Drawn when round 1 starts; absent/null until then. */
  lineup?: Lineup | null;
}

export interface JoinCodeItem extends Item {
  gameId: string;
}

export interface PlayerItem extends Item {
  displayName: string;
  teamId: string | null;
  order: number;
  active: boolean;
}

export interface TeamItem extends Item {
  name: string;
  order: number;
  score: number;
  nextContestantCursor: number;
}

export interface SurveyItem extends Item {
  text: string;
  answers: SurveyAnswer[];
  used: boolean;
}

export interface FastMoneyQuestionItem extends Item {
  text: string;
  answers: SurveyAnswer[];
}

export interface RoundItem extends Item, Omit<RoundData, "number"> {}

export interface FastMoneyResponseItem extends Item, Omit<FastMoneyResponse, "slot" | "questionIndex"> {}

const GAME_STATUSES: readonly GameStatus[] = ["LOBBY", "TEAMS_SET", "ROUND_ACTIVE", "FAST_MONEY", "FINISHED"];
const ROUND_STATES: readonly RoundState[] = [
  "PICK_CONTESTANTS",
  "FACE_OFF_ARMED",
  "FACE_OFF_ANSWERING",
  "PASS_OR_PLAY",
  "PLAYING",
  "STEAL",
  "REVEAL_REMAINING",
  "ENDED",
];
const FAST_MONEY_STAGES: readonly FastMoneyStage[] = ["SETUP", "P1_ANSWERING", "P2_ANSWERING", "REVEAL", "DONE"];

/* ---------- attribute readers ---------- */

function invalid(item: Item, field: string, expected: string): never {
  throw new ValidationError(`Item ${item.pk}/${item.sk} has an invalid "${field}" (expected ${expected})`);
}

function str(item: Item, field: string): string {
  const value = item[field];
  return typeof value === "string" ? value : invalid(item, field, "a string");
}

function nullableStr(item: Item, field: string): string | null {
  const value = item[field];
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value : invalid(item, field, "a string or null");
}

function num(item: Item, field: string): number {
  const value = item[field];
  return typeof value === "number" && Number.isFinite(value) ? value : invalid(item, field, "a number");
}

function nullableNum(item: Item, field: string): number | null {
  const value = item[field];
  if (value === undefined || value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : invalid(item, field, "a number or null");
}

function bool(item: Item, field: string): boolean {
  const value = item[field];
  return typeof value === "boolean" ? value : invalid(item, field, "a boolean");
}

function boolOr(item: Item, field: string, fallback: boolean): boolean {
  const value = item[field];
  if (value === undefined || value === null) return fallback;
  return typeof value === "boolean" ? value : invalid(item, field, "a boolean");
}

function strList(item: Item, field: string): string[] {
  const value = item[field];
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? [...value]
    : invalid(item, field, "an array of strings");
}

function oneOf<T extends string>(item: Item, field: string, allowed: readonly T[]): T {
  const value = item[field];
  const match = allowed.find((candidate) => candidate === value);
  return match ?? invalid(item, field, `one of ${allowed.join(", ")}`);
}

function isSurveyAnswer(value: unknown): value is SurveyAnswer {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as SurveyAnswer).text === "string" &&
    typeof (value as SurveyAnswer).points === "number"
  );
}

function answerList(item: Item, field: string): SurveyAnswer[] {
  const value = item[field];
  return Array.isArray(value) && value.every(isSurveyAnswer)
    ? value.map((entry) => ({ text: entry.text, points: entry.points }))
    : invalid(item, field, "an array of { text, points }");
}

function isBoardAnswer(value: unknown): value is BoardAnswer {
  if (!isSurveyAnswer(value)) return false;
  const slot = value as Partial<BoardAnswer>;
  return typeof slot.index === "number" && typeof slot.revealed === "boolean";
}

function boardList(item: Item, field: string): BoardAnswer[] {
  const value = item[field];
  if (!Array.isArray(value) || !value.every(isBoardAnswer)) {
    return invalid(item, field, "an array of board answers");
  }
  return value.map((entry) => ({
    index: entry.index,
    text: entry.text,
    points: entry.points,
    revealed: entry.revealed,
  }));
}

function stringMap(item: Item, field: string): Record<string, string> {
  const value = item[field];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalid(item, field, "a map of strings");
  }
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== "string") return invalid(item, field, "a map of strings");
    out[key] = entry;
  }
  return out;
}

function numberFrom(value: string, sk: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new ValidationError(`Unexpected numeric segment in sort key "${sk}"`);
  }
  return parsed;
}

/** Fill any missing config keys with defaults so older games keep working. */
export function toConfig(value: unknown): GameConfig {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const n = (key: keyof GameConfig): number => {
    const v = raw[key];
    return typeof v === "number" && Number.isFinite(v) ? v : (DEFAULT_CONFIG[key] as number);
  };
  const multipliers = raw.roundMultipliers;
  return {
    roundCount: n("roundCount"),
    roundMultipliers:
      Array.isArray(multipliers) && multipliers.every((m) => typeof m === "number")
        ? [...multipliers]
        : [...DEFAULT_CONFIG.roundMultipliers],
    strikesToSteal: n("strikesToSteal"),
    fastMoneyQuestionCount: n("fastMoneyQuestionCount"),
    fastMoneyP1Seconds: n("fastMoneyP1Seconds"),
    fastMoneyP2Seconds: n("fastMoneyP2Seconds"),
    fastMoneyTarget: n("fastMoneyTarget"),
  };
}

/* ---------- item → domain ---------- */

export function gameIdFromPk(pk: string): string {
  return suffixAfter(pk, "GAME#");
}

export interface GameMeta {
  id: string;
  joinCode: string;
  status: GameStatus;
  config: GameConfig;
  currentRound: number | null;
  fastMoneyStage: FastMoneyStage;
  fastMoneyTeamId: string | null;
  fastMoneyPlayerIds: string[];
  timerEndsAt: number | null;
  createdAt: string;
  hostTokenHash: string;
  lineupPins: LineupPins;
  lineup: Lineup | null;
}

function intList(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((n): n is number => typeof n === "number" && Number.isInteger(n)) : [];
}

function pinList(value: unknown): (number | null)[] {
  return Array.isArray(value) ? value.map((n) => (typeof n === "number" && Number.isInteger(n) ? n : null)) : [];
}

/** Lenient: older games have no pins and no lineup. */
export function toLineupPins(value: unknown): LineupPins {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return { surveys: pinList(raw.surveys), fastMoney: pinList(raw.fastMoney) };
}

export function toLineup(value: unknown): Lineup | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  return { surveys: intList(raw.surveys), fastMoney: intList(raw.fastMoney) };
}

export function toGameMeta(item: Item): GameMeta {
  return {
    id: gameIdFromPk(item.pk),
    joinCode: str(item, "joinCode"),
    status: oneOf(item, "status", GAME_STATUSES),
    config: toConfig(item.config),
    currentRound: nullableNum(item, "currentRound"),
    fastMoneyStage: item.fastMoneyStage === undefined ? "SETUP" : oneOf(item, "fastMoneyStage", FAST_MONEY_STAGES),
    fastMoneyTeamId: nullableStr(item, "fastMoneyTeamId"),
    fastMoneyPlayerIds: item.fastMoneyPlayerIds === undefined ? [] : strList(item, "fastMoneyPlayerIds"),
    timerEndsAt: nullableNum(item, "timerEndsAt"),
    createdAt: str(item, "createdAt"),
    hostTokenHash: str(item, "hostTokenHash"),
    lineupPins: toLineupPins(item.lineupPins),
    lineup: toLineup(item.lineup),
  };
}

export function toPlayer(item: Item): Player {
  return {
    id: suffixAfter(item.sk, "PLAYER#"),
    displayName: str(item, "displayName"),
    teamId: nullableStr(item, "teamId"),
    order: num(item, "order"),
    active: boolOr(item, "active", true),
  };
}

export function toTeam(item: Item): Team {
  return {
    id: suffixAfter(item.sk, "TEAM#"),
    name: str(item, "name"),
    order: num(item, "order"),
    score: num(item, "score"),
    nextContestantCursor: num(item, "nextContestantCursor"),
  };
}

export function toSurvey(item: Item): Survey {
  return {
    number: numberFrom(suffixAfter(item.sk, "SURVEY#"), item.sk),
    text: str(item, "text"),
    answers: answerList(item, "answers"),
    used: boolOr(item, "used", false),
  };
}

export function toFastMoneyQuestion(item: Item): FastMoneyQuestion {
  return {
    number: numberFrom(suffixAfter(item.sk, "FMQ#"), item.sk),
    text: str(item, "text"),
    answers: answerList(item, "answers"),
  };
}

export function toRound(item: Item): RoundData {
  return {
    number: numberFrom(suffixAfter(item.sk, "ROUND#"), item.sk),
    surveyNumber: num(item, "surveyNumber"),
    multiplier: num(item, "multiplier"),
    state: oneOf(item, "state", ROUND_STATES),
    questionText: str(item, "questionText"),
    board: boardList(item, "board"),
    contestants: stringMap(item, "contestants"),
    buzzWinnerPlayerId: nullableStr(item, "buzzWinnerPlayerId"),
    faceOffWinnerTeamId: nullableStr(item, "faceOffWinnerTeamId"),
    playingTeamId: nullableStr(item, "playingTeamId"),
    guesserQueue: strList(item, "guesserQueue"),
    guesserIndex: num(item, "guesserIndex"),
    strikes: num(item, "strikes"),
    pot: num(item, "pot"),
    awardedToTeamId: nullableStr(item, "awardedToTeamId"),
  };
}

export function toFastMoneyResponse(item: Item): FastMoneyResponse {
  const [slotPart, indexPart] = suffixAfter(item.sk, "FMRESP#").split("#");
  if (slotPart === undefined || indexPart === undefined) {
    throw new ValidationError(`Unexpected Fast Money response sort key "${item.sk}"`);
  }
  const slot = numberFrom(slotPart, item.sk);
  if (slot !== 1 && slot !== 2) {
    throw new ValidationError(`Unexpected Fast Money slot in sort key "${item.sk}"`);
  }
  return {
    slot: slot as FastMoneySlot,
    questionIndex: numberFrom(indexPart, item.sk),
    answer: nullableStr(item, "answer"),
    skipped: bool(item, "skipped"),
    skippedSeq: nullableNum(item, "skippedSeq"),
    matchedIndex: nullableNum(item, "matchedIndex"),
    points: num(item, "points"),
    revealed: bool(item, "revealed"),
  };
}

/* ---------- domain → item ---------- */

export function playerItem(gameId: string, player: Player): PlayerItem {
  return {
    pk: `GAME#${gameId}`,
    sk: `PLAYER#${player.id}`,
    displayName: player.displayName,
    teamId: player.teamId,
    order: player.order,
    active: player.active,
  };
}

export function fastMoneyResponseItem(gameId: string, response: FastMoneyResponse): FastMoneyResponseItem {
  const { slot, questionIndex, ...rest } = response;
  return { pk: `GAME#${gameId}`, sk: `FMRESP#${slot}#${String(questionIndex).padStart(3, "0")}`, ...rest };
}

/** Undo depth kept on the round item. */
export const ROUND_HISTORY_LIMIT = 10;

export function roundItem(gameId: string, round: RoundData, history: readonly RoundData[] = []): RoundItem {
  const { number, ...rest } = round;
  return {
    pk: `GAME#${gameId}`,
    sk: `ROUND#${String(number).padStart(3, "0")}`,
    ...rest,
    history: history.slice(-ROUND_HISTORY_LIMIT).map(({ number: _n, ...snapshot }) => snapshot),
  };
}

/** The undo stack stored on a round item: previous states, oldest first. */
export function roundHistory(item: Item): RoundData[] {
  const raw = item.history;
  if (!Array.isArray(raw)) return [];
  return raw.map((snapshot) => toRound({ pk: item.pk, sk: item.sk, ...(snapshot as Record<string, unknown>) }));
}

export function teamItem(gameId: string, team: Team): TeamItem {
  return {
    pk: `GAME#${gameId}`,
    sk: `TEAM#${team.id}`,
    name: team.name,
    order: team.order,
    score: team.score,
    nextContestantCursor: team.nextContestantCursor,
  };
}
