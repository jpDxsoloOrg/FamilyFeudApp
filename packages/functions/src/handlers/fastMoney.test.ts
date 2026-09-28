import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ForbiddenError, ValidationError } from "../lib/errors.js";
import { keys } from "../lib/keys.js";
import { installFakeDynamo, type FakeTable } from "../testSupport/fakeDynamo.js";
import { GAME_ID, HOST_TOKEN, player, seedGame, team } from "../testSupport/fixtures.js";
import {
  endFastMoneyTurn,
  fastMoneyView,
  selectFastMoneyPlayers,
  skipFastMoneyQuestion,
  startFastMoneyTurn,
  submitFastMoneyAnswer,
} from "./fastMoney.js";

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

afterEach(() => {
  vi.restoreAllMocks();
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

describe("fastMoneyView / submit / skip", () => {
  beforeEach(async () => {
    await selectFastMoneyPlayers({ ...host, teamId: "t1", playerIds: ["a1", "a2"] });
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
  });

  it("only the active player receives a queue", async () => {
    let view = await fastMoneyView({ gameId: GAME_ID, playerId: "a1" });
    expect(view).toMatchObject({ slot: 1, timerEndsAt: null, queue: [], answered: 0, total: 3 });

    await startFastMoneyTurn({ ...host, slot: 1 });
    view = await fastMoneyView({ gameId: GAME_ID, playerId: "a1" });
    expect(view?.queue).toEqual([
      { questionIndex: 0, text: "FM1" },
      { questionIndex: 1, text: "FM2" },
      { questionIndex: 2, text: "FM3" },
    ]);
    expect(view?.timerEndsAt).toBe(1_020_000);
    expect(view?.serverTime).toBe(1_000_000);

    const other = await fastMoneyView({ gameId: GAME_ID, playerId: "a2" });
    expect(other).toMatchObject({ slot: 2, queue: [], timerEndsAt: null });
    const spectator = await fastMoneyView({ gameId: GAME_ID, playerId: "b1" });
    expect(spectator).toMatchObject({ slot: 0, queue: [] });
    await expect(fastMoneyView({ gameId: "nope", playerId: "a1" })).resolves.toBeNull();
  });

  it("submit and skip update the sheet and the queue", async () => {
    await startFastMoneyTurn({ ...host, slot: 1 });
    let view = await skipFastMoneyQuestion({ gameId: GAME_ID, playerId: "a1", questionIndex: 0 });
    expect(view.queue.map((q) => q.questionIndex)).toEqual([1, 2, 0]);
    view = await submitFastMoneyAnswer({ gameId: GAME_ID, playerId: "a1", questionIndex: 1, answer: " Apple " });
    expect(view.queue.map((q) => q.questionIndex)).toEqual([2, 0]);
    expect(view.answered).toBe(1);
    expect(table.get(`GAME#${GAME_ID}`, "FMRESP#1#001")).toMatchObject({ answer: "Apple", skipped: false });
    expect(table.get(`GAME#${GAME_ID}`, "FMRESP#1#000")).toMatchObject({ answer: null, skipped: true, skippedSeq: 1 });
    await expect(submitFastMoneyAnswer({ gameId: GAME_ID, playerId: "a1", questionIndex: 1, answer: "again" })).rejects.toThrow(ConflictError);
  });

  it("refuses the wrong player, the wrong turn, and late submissions", async () => {
    await expect(submitFastMoneyAnswer({ gameId: GAME_ID, playerId: "a1", questionIndex: 0, answer: "x" })).rejects.toThrow(/not your turn/);
    await startFastMoneyTurn({ ...host, slot: 1 });
    await expect(submitFastMoneyAnswer({ gameId: GAME_ID, playerId: "a2", questionIndex: 0, answer: "x" })).rejects.toThrow(/not your turn/);
    await expect(submitFastMoneyAnswer({ gameId: GAME_ID, playerId: "b1", questionIndex: 0, answer: "x" })).rejects.toThrow(ForbiddenError);
    vi.spyOn(Date, "now").mockReturnValue(1_021_400); // inside the 1.5 s grace
    await expect(submitFastMoneyAnswer({ gameId: GAME_ID, playerId: "a1", questionIndex: 0, answer: "x" })).resolves.toBeDefined();
    vi.spyOn(Date, "now").mockReturnValue(1_021_600);
    await expect(submitFastMoneyAnswer({ gameId: GAME_ID, playerId: "a1", questionIndex: 1, answer: "y" })).rejects.toThrow(/Time is up/);
    await expect(skipFastMoneyQuestion({ gameId: GAME_ID, playerId: "a1", questionIndex: 1 })).rejects.toThrow(/Time is up/);
  });
});
