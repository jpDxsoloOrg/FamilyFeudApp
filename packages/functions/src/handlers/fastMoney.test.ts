import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ValidationError } from "../lib/errors.js";
import { keys } from "../lib/keys.js";
import { installFakeDynamo, type FakeTable } from "../testSupport/fakeDynamo.js";
import { GAME_ID, HOST_TOKEN, player, seedGame, team } from "../testSupport/fixtures.js";
import { endFastMoneyTurn, selectFastMoneyPlayers, startFastMoneyTurn } from "./fastMoney.js";

let table: FakeTable;
const host = { gameId: GAME_ID, hostToken: HOST_TOKEN };
const meta = () => table.get(`GAME#${GAME_ID}`, "META");

export function seedFastMoney(t: FakeTable, questionCount = 3, authored = questionCount): void {
  seedGame(t, {
    meta: {
      status: "FAST_MONEY",
      config: { roundCount: 1, roundMultipliers: [1], strikesToSteal: 3, fastMoneyQuestionCount: questionCount, fastMoneyP1Seconds: 20, fastMoneyP2Seconds: 25, fastMoneyTarget: 100 },
    },
    players: [
      player("a1", { teamId: "t1", order: 0 }),
      player("a2", { teamId: "t1", order: 1 }),
      player("a3", { teamId: "t1", order: 2, active: false }),
      player("b1", { teamId: "t2", order: 0 }),
    ],
    teams: [team("t1", "Sharks"), team("t2", "Jets")],
  });
  for (let n = 1; n <= authored; n++) {
    t.seed({ ...keys.fastMoneyQuestion(GAME_ID, n), text: `FM${n}`, answers: [{ text: `Top${n}`, points: 60 }, { text: `Low${n}`, points: 20 }] });
  }
}

beforeEach(() => {
  table = installFakeDynamo();
  seedFastMoney(table);
});

describe("selectFastMoneyPlayers", () => {
  it("records the team and players and lays out a blank answer sheet", async () => {
    const update = await selectFastMoneyPlayers({ ...host, teamId: "t1", playerIds: ["a1", "a2"] });
    expect(update.event).toBe("FM_PLAYERS_SELECTED");
    expect(update.game.fastMoney).toMatchObject({ stage: "SETUP", teamId: "t1", playerIds: ["a1", "a2"], timerEndsAt: null, total: 0 });
    expect(update.game.fastMoney?.rows).toHaveLength(6);
    expect(update.game.fastMoney?.rows.every((r) => r.answer === null && r.points === null)).toBe(true);
    expect(meta()).toMatchObject({ fastMoneyTeamId: "t1", fastMoneyPlayerIds: ["a1", "a2"] });
    expect(table.get(`GAME#${GAME_ID}`, "FMRESP#2#002")).toMatchObject({ answer: null, skipped: false, revealed: false, points: 0 });
  });

  it("validates the pair, membership, activity and question count", async () => {
    await expect(selectFastMoneyPlayers({ ...host, teamId: "t1", playerIds: ["a1"] })).rejects.toThrow(ValidationError);
    await expect(selectFastMoneyPlayers({ ...host, teamId: "t1", playerIds: ["a1", "a1"] })).rejects.toThrow(ValidationError);
    await expect(selectFastMoneyPlayers({ ...host, teamId: "t1", playerIds: ["a1", "b1"] })).rejects.toThrow(/not an active member/);
    await expect(selectFastMoneyPlayers({ ...host, teamId: "t1", playerIds: ["a1", "a3"] })).rejects.toThrow(/not an active member/);
    table.reset();
    seedFastMoney(table, 5, 3);
    await expect(selectFastMoneyPlayers({ ...host, teamId: "t1", playerIds: ["a1", "a2"] })).rejects.toThrow(/needs 5 questions/);
  });

  it("refuses outside Fast Money and once play has started", async () => {
    await selectFastMoneyPlayers({ ...host, teamId: "t1", playerIds: ["a1", "a2"] });
    await startFastMoneyTurn({ ...host, slot: 1 });
    await expect(selectFastMoneyPlayers({ ...host, teamId: "t1", playerIds: ["a2", "a1"] })).rejects.toThrow(/locked/);
    seedGame(table, { meta: { status: "ROUND_ACTIVE" } });
    await expect(selectFastMoneyPlayers({ ...host, teamId: "t1", playerIds: ["a1", "a2"] })).rejects.toThrow(/not started/);
  });
});

describe("startFastMoneyTurn / endFastMoneyTurn", () => {
  beforeEach(async () => {
    await selectFastMoneyPlayers({ ...host, teamId: "t1", playerIds: ["a1", "a2"] });
  });

  it("runs P1 then P2 with the configured timers, then moves to REVEAL", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    let update = await startFastMoneyTurn({ ...host, slot: 1 });
    expect(update.event).toBe("FM_TIMER_STARTED");
    expect(update.game.fastMoney).toMatchObject({ stage: "P1_ANSWERING", timerEndsAt: 1_020_000 });
    expect(update.serverTime).toBe(1_000_000);
    expect(meta()).toMatchObject({ fastMoneyStage: "P1_ANSWERING", timerEndsAt: 1_020_000 });

    update = await endFastMoneyTurn(host);
    expect(update.event).toBe("FM_TURN_ENDED");
    expect(update.game.fastMoney).toMatchObject({ stage: "P2_ANSWERING", timerEndsAt: null });

    update = await startFastMoneyTurn({ ...host, slot: 2 });
    expect(update.game.fastMoney).toMatchObject({ stage: "P2_ANSWERING", timerEndsAt: 1_025_000 });

    update = await endFastMoneyTurn(host);
    expect(update.game.fastMoney).toMatchObject({ stage: "REVEAL", timerEndsAt: null });
    vi.restoreAllMocks();
  });

  it("enforces the order and refuses double starts or ending when nothing runs", async () => {
    await expect(startFastMoneyTurn({ ...host, slot: 2 })).rejects.toThrow(/after player 1/);
    await expect(endFastMoneyTurn(host)).rejects.toThrow(/No Fast Money turn/);
    await startFastMoneyTurn({ ...host, slot: 1 });
    await expect(startFastMoneyTurn({ ...host, slot: 1 })).rejects.toThrow(/already running/);
    await endFastMoneyTurn(host);
    await expect(startFastMoneyTurn({ ...host, slot: 1 })).rejects.toThrow(ConflictError);
  });

  it("needs players selected first", async () => {
    table.reset();
    seedFastMoney(table);
    await expect(startFastMoneyTurn({ ...host, slot: 1 })).rejects.toThrow(/Select the two/);
  });
});
