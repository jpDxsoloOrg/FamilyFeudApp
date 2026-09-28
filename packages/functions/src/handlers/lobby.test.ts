import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../lib/errors.js";
import { keys } from "../lib/keys.js";
import { installFakeDynamo, type FakeTable } from "../testSupport/fakeDynamo.js";
import { GAME_ID, HOST_TOKEN, JOIN_CODE, player, seedGame, team } from "../testSupport/fixtures.js";
import { createGame, joinGame, randomizeTeams, setTeamName, updateConfig } from "./lobby.js";
import { game as gameQuery } from "./queries.js";

let table: FakeTable;

beforeEach(() => {
  table = installFakeDynamo();
});

const host = { gameId: GAME_ID, hostToken: HOST_TOKEN };

describe("createGame", () => {
  it("creates a LOBBY game with a join code and returns the host token once", async () => {
    const { game, hostToken } = await createGame({});
    expect(hostToken).toHaveLength(43);
    expect(game.status).toBe("LOBBY");
    expect(game.joinCode).toMatch(/^[A-Z2-9]{5}$/);
    expect(game.config.roundCount).toBe(4);
    expect(game.players).toEqual([]);
    expect(game.currentRound).toBeNull();
    expect(game.fastMoney).toBeNull();

    const meta = table.get(`GAME#${game.id}`, "META");
    expect(meta?.hostTokenHash).not.toBe(hostToken);
    expect(table.get(`JOIN#${game.joinCode}`, "GAME")?.gameId).toBe(game.id);
  });

  it("applies a partial config over the defaults", async () => {
    const { game } = await createGame({ config: { roundCount: 2, fastMoneyTarget: 150 } });
    expect(game.config).toMatchObject({ roundCount: 2, roundMultipliers: [1, 1], fastMoneyTarget: 150 });
  });

  it("rejects an out-of-range config", async () => {
    await expect(createGame({ config: { roundCount: 0 } })).rejects.toThrow(ValidationError);
    await expect(createGame({ config: { roundMultipliers: [1, 2] } })).rejects.toThrow(/exactly 4/);
  });
});

describe("joinGame", () => {
  const args = { joinCode: JOIN_CODE, playerId: "p1", displayName: "Ada" };

  it("adds an unassigned player and fans out PLAYER_JOINED", async () => {
    seedGame(table);
    const update = await joinGame(args);
    expect(update.event).toBe("PLAYER_JOINED");
    expect(update.gameId).toBe(GAME_ID);
    expect(update.serverTime).toBeGreaterThan(0);
    expect(update.game.players).toEqual([
      { id: "p1", displayName: "Ada", teamId: null, order: 0, active: true },
    ]);
    expect(table.get(keys.player(GAME_ID, "p1").pk, keys.player(GAME_ID, "p1").sk)).toMatchObject({
      displayName: "Ada",
      teamId: null,
    });
  });

  it("normalises the code and trims the name", async () => {
    seedGame(table);
    const update = await joinGame({ ...args, joinCode: ` ${JOIN_CODE.toLowerCase()} `, displayName: "  Ada " });
    expect(update.game.players[0]?.displayName).toBe("Ada");
  });

  it("is idempotent for a returning player, keeping their seat", async () => {
    seedGame(table, { players: [player("p1", { teamId: "t1", order: 2 })] });
    const update = await joinGame({ ...args, displayName: "Ada Prime" });
    expect(update.game.players).toEqual([
      { id: "p1", displayName: "Ada Prime", teamId: "t1", order: 2, active: true },
    ]);
  });

  it("lets a late joiner in after teams are set, unassigned", async () => {
    seedGame(table, {
      meta: { status: "TEAMS_SET" },
      players: [player("a", { teamId: "t1" }), player("b", { teamId: "t2" })],
      teams: [team("t1", "Team 1"), team("t2", "Team 2")],
    });
    const update = await joinGame(args);
    const me = update.game.players.find((p) => p.id === "p1");
    expect(me?.teamId).toBeNull();
    expect(update.game.teams.map((t) => t.players.length)).toEqual([1, 1]);
  });

  it("appends late joiners to the unassigned bucket in arrival order", async () => {
    seedGame(table, { players: [player("x", { order: 0 }), player("y", { order: 1 })] });
    const update = await joinGame(args);
    expect(update.game.players.find((p) => p.id === "p1")?.order).toBe(2);
  });

  it("rejects a display name already taken by another player", async () => {
    seedGame(table, { players: [player("p2", { displayName: "ada" })] });
    await expect(joinGame(args)).rejects.toThrow(/already taken/);
  });

  it("rejects an unknown join code and a finished game", async () => {
    await expect(joinGame(args)).rejects.toThrow(NotFoundError);
    seedGame(table, { meta: { status: "FINISHED" } });
    await expect(joinGame(args)).rejects.toThrow(ConflictError);
  });

  it("rejects empty or over-long names", async () => {
    seedGame(table);
    await expect(joinGame({ ...args, displayName: "  " })).rejects.toThrow(ValidationError);
    await expect(joinGame({ ...args, displayName: "x".repeat(25) })).rejects.toThrow(/at most 24/);
  });
});

describe("updateConfig", () => {
  it("merges and persists, resizing multipliers to the round count", async () => {
    seedGame(table);
    const update = await updateConfig({ ...host, config: { roundCount: 5 } });
    expect(update.event).toBe("CONFIG_UPDATED");
    expect(update.game.config.roundMultipliers).toEqual([1, 1, 2, 3, 1]);
    expect(table.get(`GAME#${GAME_ID}`, "META")?.config).toMatchObject({ roundCount: 5 });
  });

  it("requires the host token and a lobby-phase game", async () => {
    seedGame(table);
    await expect(updateConfig({ ...host, hostToken: "bad", config: {} })).rejects.toThrow(ForbiddenError);
    seedGame(table, { meta: { status: "ROUND_ACTIVE" } });
    await expect(updateConfig({ ...host, config: {} })).rejects.toThrow(ConflictError);
  });
});

describe("randomizeTeams", () => {
  it("deals every active player onto two teams with orders and sets TEAMS_SET", async () => {
    seedGame(table, {
      players: [player("a"), player("b"), player("c"), player("d"), player("e"), player("gone", { active: false })],
    });
    const update = await randomizeTeams(host);
    expect(update.event).toBe("TEAMS_SET");
    expect(update.game.status).toBe("TEAMS_SET");
    expect(update.game.teams.map((t) => t.name)).toEqual(["Team 1", "Team 2"]);
    const sizes = update.game.teams.map((t) => t.players.length).sort();
    expect(sizes).toEqual([2, 3]);
    for (const t of update.game.teams) {
      expect(t.players.map((p) => p.order)).toEqual(t.players.map((_, i) => i));
    }
    expect(update.game.players.find((p) => p.id === "gone")?.teamId).toBeNull();
    expect(table.get(`GAME#${GAME_ID}`, "META")?.status).toBe("TEAMS_SET");
  });

  it("keeps team ids and names on a re-draw", async () => {
    seedGame(table, {
      meta: { status: "TEAMS_SET" },
      players: [player("a", { teamId: "t1" }), player("b", { teamId: "t2" })],
      teams: [team("t1", "Sharks"), team("t2", "Jets")],
    });
    const update = await randomizeTeams(host);
    expect(update.game.teams.map((t) => [t.id, t.name])).toEqual([
      ["t1", "Sharks"],
      ["t2", "Jets"],
    ]);
  });

  it("needs at least two active players and a lobby-phase game", async () => {
    seedGame(table, { players: [player("a")] });
    await expect(randomizeTeams(host)).rejects.toThrow(ValidationError);
    seedGame(table, { meta: { status: "ROUND_ACTIVE" }, players: [player("a"), player("b")] });
    await expect(randomizeTeams(host)).rejects.toThrow(ConflictError);
  });
});

describe("setTeamName", () => {
  it("renames a team for the host", async () => {
    seedGame(table, { meta: { status: "TEAMS_SET" }, teams: [team("t1", "Team 1"), team("t2", "Team 2")] });
    const update = await setTeamName({ ...host, teamId: "t2", name: "  The Feudals " });
    expect(update.event).toBe("TEAM_RENAMED");
    expect(update.game.teams.find((t) => t.id === "t2")?.name).toBe("The Feudals");
    await expect(setTeamName({ ...host, teamId: "zzz", name: "x" })).rejects.toThrow(NotFoundError);
  });
});

describe("game query", () => {
  it("returns the public view or null", async () => {
    await expect(gameQuery({ gameId: "none" })).resolves.toBeNull();
    seedGame(table, { players: [player("a")] });
    const view = await gameQuery({ gameId: GAME_ID });
    expect(view?.joinCode).toBe(JOIN_CODE);
    expect(view).not.toHaveProperty("hostTokenHash");
  });
});
