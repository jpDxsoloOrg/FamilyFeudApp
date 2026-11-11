import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ForbiddenError, ValidationError } from "../lib/errors.js";
import { keys } from "../lib/keys.js";
import { installFakeDynamo, type FakeTable } from "../testSupport/fakeDynamo.js";
import { GAME_ID, HOST_TOKEN, player, seedGame, team } from "../testSupport/fixtures.js";
import { hostGame } from "./queries.js";
import {
  buzzDuplicate,
  endFastMoneyTurn,
  fastMoneyView,
  finishGame,
  revealFastMoneyAnswer,
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

  it("asks the drawn lineup's questions in lineup order", async () => {
    table.seed({ ...meta()!, lineup: { surveys: [1], fastMoney: [3, 1, 2] } });
    await startFastMoneyTurn({ ...host, slot: 1 });
    const view = await fastMoneyView({ gameId: GAME_ID, playerId: "a1" });
    expect(view?.queue.map((q) => q.text)).toEqual(["FM3", "FM1", "FM2"]);
    expect((await hostGame(host)).fastMoneyInPlay.map((q) => q.number)).toEqual([3, 1, 2]);
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

describe("buzzDuplicate", () => {
  beforeEach(async () => {
    await selectFastMoneyPlayers({ ...host, teamId: "t1", playerIds: ["a1", "a2"] });
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    await startFastMoneyTurn({ ...host, slot: 1 });
    await submitFastMoneyAnswer({ gameId: GAME_ID, playerId: "a1", questionIndex: 0, answer: "Dogs" });
    await endFastMoneyTurn(host);
    await startFastMoneyTurn({ ...host, slot: 2 });
    await submitFastMoneyAnswer({ gameId: GAME_ID, playerId: "a2", questionIndex: 0, answer: "the dog" });
    await submitFastMoneyAnswer({ gameId: GAME_ID, playerId: "a2", questionIndex: 1, answer: "cat" });
  });

  it("the host view flags the likely duplicate", async () => {
    const view = await hostGame(host);
    const p2 = view.fastMoneyAnswers.filter((r) => r.slot === 2);
    expect(p2.find((r) => r.questionIndex === 0)).toMatchObject({ answer: "the dog", likelyDuplicate: true });
    expect(p2.find((r) => r.questionIndex === 1)).toMatchObject({ answer: "cat", likelyDuplicate: false });
    expect(view.fastMoneyAnswers.filter((r) => r.slot === 1).every((r) => !r.likelyDuplicate)).toBe(true);
  });

  it("clears player 2's answer, reopens the question and returns the private message", async () => {
    const message = await buzzDuplicate({ ...host, questionIndex: 0 });
    expect(message).toMatchObject({ gameId: GAME_ID, playerId: "a2", type: "FAST_MONEY_DUPLICATE", detail: "0" });
    expect(table.get(`GAME#${GAME_ID}`, "FMRESP#2#000")).toMatchObject({ answer: null, skipped: false });
    const view = await fastMoneyView({ gameId: GAME_ID, playerId: "a2" });
    expect(view?.queue.map((q) => q.questionIndex)).toEqual([0, 2]);
    await expect(buzzDuplicate({ ...host, questionIndex: 0 })).rejects.toThrow(/not answered/);
  });

  it("only during player 2's turn", async () => {
    await endFastMoneyTurn(host);
    await expect(buzzDuplicate({ ...host, questionIndex: 1 })).rejects.toThrow(/player 2's turn/);
  });
});

describe("revealFastMoneyAnswer / finishGame", () => {
  beforeEach(async () => {
    await selectFastMoneyPlayers({ ...host, teamId: "t1", playerIds: ["a1", "a2"] });
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    await startFastMoneyTurn({ ...host, slot: 1 });
    await submitFastMoneyAnswer({ gameId: GAME_ID, playerId: "a1", questionIndex: 0, answer: "top1" });
    await submitFastMoneyAnswer({ gameId: GAME_ID, playerId: "a1", questionIndex: 1, answer: "nothing" });
    await endFastMoneyTurn(host);
    await startFastMoneyTurn({ ...host, slot: 2 });
    await submitFastMoneyAnswer({ gameId: GAME_ID, playerId: "a2", questionIndex: 0, answer: "low1" });
  });

  it("is only allowed in REVEAL", async () => {
    await expect(revealFastMoneyAnswer({ ...host, slot: 1, questionIndex: 0, matchedIndex: 0 })).rejects.toThrow(/after both turns/);
  });

  it("scores matched answers, zero for not-on-board, and totals across both players", async () => {
    await endFastMoneyTurn(host);
    let update = await revealFastMoneyAnswer({ ...host, slot: 1, questionIndex: 0, matchedIndex: 0 });
    expect(update.event).toBe("FM_ANSWER_REVEALED");
    expect(update.game.fastMoney?.rows.find((r) => r.slot === 1 && r.questionIndex === 0)).toMatchObject({ answer: "top1", points: 60, revealed: true });
    expect(update.game.fastMoney?.total).toBe(60);
    // Unrevealed rows still hide their answers in the public payload.
    expect(update.game.fastMoney?.rows.find((r) => r.slot === 1 && r.questionIndex === 1)).toMatchObject({ answer: null, points: null, revealed: false });

    update = await revealFastMoneyAnswer({ ...host, slot: 1, questionIndex: 1, matchedIndex: null });
    expect(update.game.fastMoney?.rows.find((r) => r.slot === 1 && r.questionIndex === 1)).toMatchObject({ answer: "nothing", points: 0, revealed: true });

    update = await revealFastMoneyAnswer({ ...host, slot: 2, questionIndex: 0, matchedIndex: 1 });
    expect(update.game.fastMoney?.total).toBe(80);
    expect(table.get(`GAME#${GAME_ID}`, "FMRESP#2#000")).toMatchObject({ revealed: true, matchedIndex: 1, points: 20 });

    await expect(revealFastMoneyAnswer({ ...host, slot: 2, questionIndex: 0, matchedIndex: 1 })).rejects.toThrow(/already revealed/);
    await expect(revealFastMoneyAnswer({ ...host, slot: 2, questionIndex: 1, matchedIndex: 7 })).rejects.toThrow(ValidationError);
    // An unanswered (skipped / timed out) row can still be revealed as 0.
    update = await revealFastMoneyAnswer({ ...host, slot: 2, questionIndex: 1 });
    expect(update.game.fastMoney?.rows.find((r) => r.slot === 2 && r.questionIndex === 1)).toMatchObject({ answer: null, points: 0, revealed: true });
  });

  it("finishGame moves to FINISHED and locks Fast Money", async () => {
    await endFastMoneyTurn(host);
    const update = await finishGame(host);
    expect(update.event).toBe("GAME_FINISHED");
    expect(update.game.status).toBe("FINISHED");
    expect(update.game.fastMoney?.stage).toBe("DONE");
    expect(meta()).toMatchObject({ status: "FINISHED", fastMoneyStage: "DONE", timerEndsAt: null });
    await expect(finishGame(host)).rejects.toThrow(/not started/);
    await expect(revealFastMoneyAnswer({ ...host, slot: 1, questionIndex: 0 })).rejects.toThrow(ConflictError);
  });
});
