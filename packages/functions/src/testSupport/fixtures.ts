/** Seed helpers for handler tests. */
import { DEFAULT_CONFIG, type Player, type Team } from "@familyfeud/core";
import { hashHostToken } from "../lib/auth.js";
import { keys } from "../lib/keys.js";
import { playerItem, teamItem, type GameMetaItem, type JoinCodeItem } from "../lib/mappers.js";
import type { FakeTable } from "./fakeDynamo.js";

export const GAME_ID = "g1";
export const JOIN_CODE = "ABCDE";
export const HOST_TOKEN = "host-secret";

export function metaItem(overrides: Partial<GameMetaItem> = {}): GameMetaItem {
  return {
    ...keys.game(GAME_ID),
    status: "LOBBY",
    hostTokenHash: hashHostToken(HOST_TOKEN),
    joinCode: JOIN_CODE,
    config: { ...DEFAULT_CONFIG },
    currentRound: null,
    fastMoneyStage: "SETUP",
    fastMoneyTeamId: null,
    fastMoneyPlayerIds: [],
    timerEndsAt: null,
    createdAt: "2026-09-27T00:00:00.000Z",
    ...overrides,
  };
}

export function joinCodeItem(): JoinCodeItem {
  return { ...keys.joinCode(JOIN_CODE), gameId: GAME_ID };
}

export function player(id: string, overrides: Partial<Player> = {}): Player {
  return { id, displayName: id.toUpperCase(), teamId: null, order: 0, active: true, ...overrides };
}

export function team(id: string, name: string): Team {
  return { id, name, score: 0, nextContestantCursor: 0 };
}

/** A game in LOBBY with the join-code lookup, plus any players/teams given. */
export function seedGame(
  table: FakeTable,
  options: { meta?: Partial<GameMetaItem>; players?: Player[]; teams?: Team[] } = {},
): void {
  table.seed(metaItem(options.meta), joinCodeItem());
  for (const p of options.players ?? []) table.seed(playerItem(GAME_ID, p));
  for (const t of options.teams ?? []) table.seed(teamItem(GAME_ID, t));
}
