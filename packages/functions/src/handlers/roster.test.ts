import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { installFakeDynamo, type FakeTable } from "../testSupport/fakeDynamo.js";
import { GAME_ID, HOST_TOKEN, player, seedGame, team } from "../testSupport/fixtures.js";
import { joinGame } from "./lobby.js";
import { assignPlayer, removePlayer, reorderPlayer, restorePlayer } from "./roster.js";

let table: FakeTable;
const host = { gameId: GAME_ID, hostToken: HOST_TOKEN };

function stored(playerId: string) {
  return table.get(`GAME#${GAME_ID}`, `PLAYER#${playerId}`);
}

beforeEach(() => {
  table = installFakeDynamo();
  seedGame(table, {
    meta: { status: "TEAMS_SET" },
    players: [
      player("a", { teamId: "t1", order: 0 }),
      player("b", { teamId: "t1", order: 1 }),
      player("x", { teamId: "t2", order: 0 }),
    ],
    teams: [team("t1", "Team 1"), team("t2", "Team 2")],
  });
});

describe("assignPlayer", () => {
  it("puts a late joiner at the bottom of the chosen team", async () => {
    await joinGame({ joinCode: "ABCDE", playerId: "late", displayName: "Late" });
    const update = await assignPlayer({ ...host, playerId: "late", teamId: "t2" });
    expect(update.event).toBe("ROSTER_CHANGED");
    const t2 = update.game.teams.find((t) => t.id === "t2");
    expect(t2?.players.map((p) => [p.id, p.order])).toEqual([
      ["x", 0],
      ["late", 1],
    ]);
    expect(stored("late")).toMatchObject({ teamId: "t2", order: 1 });
  });

  it("moves a player between teams and closes the gap", async () => {
    const update = await assignPlayer({ ...host, playerId: "a", teamId: "t2" });
    expect(update.game.teams.find((t) => t.id === "t1")?.players.map((p) => [p.id, p.order])).toEqual([["b", 0]]);
    expect(update.game.teams.find((t) => t.id === "t2")?.players.map((p) => p.id)).toEqual(["x", "a"]);
    expect(stored("b")?.order).toBe(0);
  });

  it("rejects an unknown team, unknown player, or bad token", async () => {
    await expect(assignPlayer({ ...host, playerId: "a", teamId: "t9" })).rejects.toThrow(NotFoundError);
    await expect(assignPlayer({ ...host, playerId: "ghost", teamId: "t1" })).rejects.toThrow(NotFoundError);
    await expect(assignPlayer({ ...host, hostToken: "bad", playerId: "a", teamId: "t1" })).rejects.toThrow(ForbiddenError);
  });
});

describe("reorderPlayer", () => {
  it("moves a player within their team", async () => {
    const update = await reorderPlayer({ ...host, playerId: "b", newOrder: 0 });
    expect(update.game.teams.find((t) => t.id === "t1")?.players.map((p) => p.id)).toEqual(["b", "a"]);
    expect(stored("a")?.order).toBe(1);
    expect(stored("b")?.order).toBe(0);
  });

  it("refuses to reorder an unassigned player", async () => {
    await joinGame({ joinCode: "ABCDE", playerId: "late", displayName: "Late" });
    await expect(reorderPlayer({ ...host, playerId: "late", newOrder: 0 })).rejects.toThrow(ConflictError);
  });
});

describe("removePlayer / restorePlayer", () => {
  it("deactivates and reactivates without losing the seat", async () => {
    const removed = await removePlayer({ ...host, playerId: "a" });
    expect(removed.game.players.find((p) => p.id === "a")).toMatchObject({ active: false, teamId: "t1", order: 0 });
    expect(stored("a")?.active).toBe(false);

    const restored = await restorePlayer({ ...host, playerId: "a" });
    expect(restored.game.players.find((p) => p.id === "a")?.active).toBe(true);
    expect(stored("a")?.active).toBe(true);
  });

  it("is a no-op write when nothing changes", async () => {
    const before = JSON.stringify(table.all());
    await restorePlayer({ ...host, playerId: "a" });
    expect(JSON.stringify(table.all())).toBe(before);
  });
});
