import { beforeEach, describe, expect, it } from "vitest";
import { assertHost, hashHostToken, requireHost, verifyHostToken } from "./auth.js";
import { ForbiddenError, NotFoundError } from "./errors.js";
import { loadGame } from "./gameState.js";
import { keys } from "./keys.js";
import { installFakeDynamo, type FakeTable } from "../testSupport/fakeDynamo.js";
import { GAME_ID, HOST_TOKEN, player, seedGame, team } from "../testSupport/fixtures.js";

let table: FakeTable;

beforeEach(() => {
  table = installFakeDynamo();
});

describe("loadGame", () => {
  it("returns undefined for a game that does not exist", async () => {
    await expect(loadGame("nope")).resolves.toBeUndefined();
  });

  it("assembles every item kind in the partition into one object", async () => {
    seedGame(table, {
      players: [player("p2", { teamId: "t1", order: 1 }), player("p1", { teamId: "t1", order: 0 })],
      teams: [team("t1", "Team 1"), team("t2", "Team 2")],
    });
    table.seed(
      { ...keys.survey(GAME_ID, 2), text: "Q2", answers: [{ text: "b", points: 10 }], used: false },
      { ...keys.survey(GAME_ID, 1), text: "Q1", answers: [{ text: "a", points: 50 }], used: true },
      { ...keys.fastMoneyQuestion(GAME_ID, 1), text: "FM1", answers: [{ text: "x", points: 30 }] },
    );

    const game = await loadGame(GAME_ID);
    expect(game).toBeDefined();
    expect(game?.id).toBe(GAME_ID);
    expect(game?.status).toBe("LOBBY");
    expect(game?.config.roundCount).toBe(4);
    expect(game?.players.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(game?.teams.map((t) => t.name)).toEqual(["Team 1", "Team 2"]);
    expect(game?.surveys.map((s) => s.number)).toEqual([1, 2]);
    expect(game?.surveys[0]?.used).toBe(true);
    expect(game?.fastMoneyQuestions[0]?.text).toBe("FM1");
    expect(game?.rounds).toEqual([]);
    expect(game?.fastMoney).toEqual({
      stage: "SETUP",
      teamId: null,
      playerIds: [],
      timerEndsAt: null,
      responses: [],
    });
    expect(game?.hostTokenHash).toBe(hashHostToken(HOST_TOKEN));
  });

  it("fills missing config keys with defaults", async () => {
    seedGame(table, { meta: { config: { roundCount: 2 } as never } });
    const game = await loadGame(GAME_ID);
    expect(game?.config).toMatchObject({ roundCount: 2, strikesToSteal: 3, fastMoneyTarget: 200 });
  });
});

describe("host auth", () => {
  it("hashes deterministically and verifies in constant time", () => {
    expect(hashHostToken("a")).toBe(hashHostToken("a"));
    expect(hashHostToken("a")).not.toBe(hashHostToken("b"));
    expect(verifyHostToken("a", hashHostToken("a"))).toBe(true);
    expect(verifyHostToken("b", hashHostToken("a"))).toBe(false);
    expect(verifyHostToken("a", "not-hex")).toBe(false);
  });

  it("assertHost throws on a missing or wrong token", () => {
    expect(() => assertHost(undefined, hashHostToken("a"))).toThrow(ForbiddenError);
    expect(() => assertHost("wrong", hashHostToken("a"))).toThrow(ForbiddenError);
    expect(() => assertHost("a", hashHostToken("a"))).not.toThrow();
  });

  it("requireHost loads the game for a valid token and refuses otherwise", async () => {
    seedGame(table);
    const game = await requireHost(GAME_ID, HOST_TOKEN);
    expect(game.id).toBe(GAME_ID);
    await expect(requireHost(GAME_ID, "nope")).rejects.toThrow(ForbiddenError);
    await expect(requireHost("missing", HOST_TOKEN)).rejects.toThrow(NotFoundError);
  });
});
