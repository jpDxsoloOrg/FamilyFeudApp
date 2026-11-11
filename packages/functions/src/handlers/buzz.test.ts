import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError } from "../lib/errors.js";
import { keys } from "../lib/keys.js";
import { installFakeDynamo, type FakeTable } from "../testSupport/fakeDynamo.js";
import { GAME_ID, HOST_TOKEN, player, seedFastMoneyQuestions, seedGame, smallConfig, team } from "../testSupport/fixtures.js";
import { buzz, buzzWithOutcome } from "./buzz.js";
import { armBuzzers, startRound } from "./round.js";

let table: FakeTable;
const host = { gameId: GAME_ID, hostToken: HOST_TOKEN };

beforeEach(async () => {
  table = installFakeDynamo();
  seedGame(table, {
    meta: { status: "TEAMS_SET", config: smallConfig() },
    players: [player("a1", { teamId: "t1" }), player("a2", { teamId: "t1", order: 1 }), player("b1", { teamId: "t2" })],
    teams: [team("t1", "Team 1"), team("t2", "Team 2")],
  });
  table.seed({ ...keys.survey(GAME_ID, 1), text: "Q", answers: [{ text: "A", points: 50 }], used: false });
  seedFastMoneyQuestions(table, 1);
  await startRound(host);
});

describe("buzz", () => {
  it("the first contestant to write wins; the second gets the winner's state, not an error", async () => {
    await armBuzzers(host);
    const first = await buzzWithOutcome({ gameId: GAME_ID, playerId: "b1" });
    expect(first.won).toBe(true);
    expect(first.update.event).toBe("BUZZ");
    expect(first.update.game.currentRound).toMatchObject({ state: "FACE_OFF_ANSWERING", buzzWinnerPlayerId: "b1" });

    const second = await buzzWithOutcome({ gameId: GAME_ID, playerId: "a1" });
    expect(second.won).toBe(false);
    expect(second.update.game.currentRound?.buzzWinnerPlayerId).toBe("b1");
    expect(table.get(`GAME#${GAME_ID}`, "ROUND#001")).toMatchObject({ state: "FACE_OFF_ANSWERING", buzzWinnerPlayerId: "b1" });
  });

  it("truly simultaneous buzzes resolve to exactly one winner", async () => {
    await armBuzzers(host);
    const [a, b] = await Promise.all([
      buzzWithOutcome({ gameId: GAME_ID, playerId: "a1" }),
      buzzWithOutcome({ gameId: GAME_ID, playerId: "b1" }),
    ]);
    expect([a.won, b.won].filter(Boolean)).toHaveLength(1);
    const winner = table.get(`GAME#${GAME_ID}`, "ROUND#001")?.buzzWinnerPlayerId;
    expect(["a1", "b1"]).toContain(winner);
    expect(a.update.game.currentRound?.buzzWinnerPlayerId ?? b.update.game.currentRound?.buzzWinnerPlayerId).toBe(winner);
  });

  it("refuses non-contestants and returns current state when not armed", async () => {
    await expect(buzz({ gameId: GAME_ID, playerId: "a2" })).rejects.toThrow(ForbiddenError);
    const before = JSON.stringify(table.get(`GAME#${GAME_ID}`, "ROUND#001"));
    const late = await buzzWithOutcome({ gameId: GAME_ID, playerId: "a1" });
    expect(late.won).toBe(false);
    expect(late.update.game.currentRound?.state).toBe("PICK_CONTESTANTS");
    expect(JSON.stringify(table.get(`GAME#${GAME_ID}`, "ROUND#001"))).toBe(before);
  });

  it("rejects when no round is in progress", async () => {
    seedGame(table, { meta: { status: "LOBBY" } });
    await expect(buzz({ gameId: GAME_ID, playerId: "a1" })).rejects.toThrow(ConflictError);
  });
});
