import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors.js";
import { keys } from "../lib/keys.js";
import { installFakeDynamo, type FakeTable } from "../testSupport/fakeDynamo.js";
import { GAME_ID, HOST_TOKEN, player, seedFastMoneyQuestions, seedGame, team } from "../testSupport/fixtures.js";
import { hostGame } from "./queries.js";
import {
  armBuzzers,
  choosePassOrPlay,
  endRound,
  resetBuzzers,
  revealAnswer,
  setFaceOffWinner,
  skipContestant,
  skipGuesser,
  startRound,
  strike,
  undoRoundAction,
} from "./round.js";

let table: FakeTable;
const host = { gameId: GAME_ID, hostToken: HOST_TOKEN };

function seedReady(overrides: { roundCount?: number } = {}): void {
  seedGame(table, {
    meta: { status: "TEAMS_SET", config: { roundCount: overrides.roundCount ?? 2, roundMultipliers: [1, 2].slice(0, overrides.roundCount ?? 2), strikesToSteal: 3, fastMoneyQuestionCount: 2, fastMoneyP1Seconds: 20, fastMoneyP2Seconds: 25, fastMoneyTarget: 200 },
      // Pinned so round 1 is always "Name a pet"; drawing is covered in its own tests.
      lineupPins: { surveys: [1, 2], fastMoney: [] },
    },
    players: [
      player("a1", { teamId: "t1", order: 0 }),
      player("a2", { teamId: "t1", order: 1 }),
      player("a3", { teamId: "t1", order: 2 }),
      player("b1", { teamId: "t2", order: 0 }),
      player("b2", { teamId: "t2", order: 1 }),
    ],
    teams: [team("t1", "Team 1"), team("t2", "Team 2")],
  });
  table.seed(
    { ...keys.survey(GAME_ID, 1), text: "Name a pet", answers: [{ text: "Dog", points: 55 }, { text: "Cat", points: 30 }], used: false },
    { ...keys.survey(GAME_ID, 2), text: "Name a fruit", answers: [{ text: "Apple", points: 60 }], used: false },
  );
  seedFastMoneyQuestions(table, 2);
}

beforeEach(() => {
  table = installFakeDynamo();
  seedReady();
});

describe("startRound", () => {
  it("auto-picks contestants, marks the survey used and activates the round", async () => {
    const update = await startRound(host);
    expect(update.event).toBe("ROUND_STARTED");
    expect(update.game.status).toBe("ROUND_ACTIVE");
    expect(update.game.currentRound).toMatchObject({
      number: 1,
      multiplier: 1,
      state: "PICK_CONTESTANTS",
      questionText: null,
      contestantPlayerIds: ["a1", "b1"],
      pot: 0,
    });
    expect(update.game.currentRound?.board.map((s) => s.text)).toEqual([null, null]);

    expect(table.get(`GAME#${GAME_ID}`, "META")).toMatchObject({ status: "ROUND_ACTIVE", currentRound: 1 });
    expect(table.get(`GAME#${GAME_ID}`, "SURVEY#001")?.used).toBe(true);
    expect(table.get(`GAME#${GAME_ID}`, "TEAM#t1")?.nextContestantCursor).toBe(1);
    const view = await hostGame(host);
    expect(view.currentBoard.map((s) => s.text)).toEqual(["Dog", "Cat"]);
    // The host reads the question aloud, so it is visible before buzzers are armed.
    expect(view.currentQuestion).toBe("Name a pet");
  });

  it("uses the configured multiplier and rotates contestants across rounds", async () => {
    await startRound(host);
    await finishRound();
    const second = await startRound(host);
    expect(second.game.currentRound).toMatchObject({ number: 2, multiplier: 2, contestantPlayerIds: ["a2", "b2"] });
  });

  it("rejects a round in progress and too many rounds", async () => {
    await startRound(host);
    await expect(startRound(host)).rejects.toThrow(/still in progress/);
    await finishRound();
    await startRound(host);
    await finishRound();
    expect(table.get(`GAME#${GAME_ID}`, "META")?.status).toBe("FAST_MONEY");
    await expect(startRound(host)).rejects.toThrow(ConflictError);
  });

  it("draws the whole lineup when round 1 starts and plays it in order", async () => {
    await startRound(host);
    const meta = table.get(`GAME#${GAME_ID}`, "META");
    expect(meta?.lineup).toMatchObject({ surveys: [1, 2] });
    const fm = (meta?.lineup as { fastMoney: number[] }).fastMoney;
    expect([...fm].sort()).toEqual([1, 2]);

    const view = await hostGame(host);
    expect(view.lineup).toMatchObject({ surveyPins: [1, 2], surveys: [1, 2] });
    expect(view.fastMoneyInPlay.map((q) => q.number)).toEqual(fm);

    await finishRound();
    const second = await startRound(host);
    expect(second.game.currentRound?.number).toBe(2);
    expect(table.get(`GAME#${GAME_ID}`, "SURVEY#002")?.used).toBe(true);
  });

  it("draws unpinned rounds at random from the bank with no repeats", async () => {
    table.seed(
      { ...table.get(`GAME#${GAME_ID}`, "META")!, lineupPins: { surveys: [null, 2], fastMoney: [] } },
      { ...keys.survey(GAME_ID, 3), text: "Name a color", answers: [{ text: "Red", points: 40 }], used: false },
    );
    await startRound(host);
    const surveys = (table.get(`GAME#${GAME_ID}`, "META")?.lineup as { surveys: number[] }).surveys;
    expect(surveys[1]).toBe(2);
    expect([1, 3]).toContain(surveys[0]);
  });

  it("refuses to start while either bank is short", async () => {
    table.delete(`GAME#${GAME_ID}`, "SURVEY#002");
    await expect(startRound(host)).rejects.toThrow(/need 2 survey questions but the bank has 1/);
    seedReady();
    table.delete(`GAME#${GAME_ID}`, "FMQ#002");
    await expect(startRound(host)).rejects.toThrow(/Fast Money needs 2 questions but the bank has 1/);
    expect(table.get(`GAME#${GAME_ID}`, "META")?.lineup).toBeUndefined();
  });

  it("requires teams", async () => {
    seedGame(table, { meta: { status: "LOBBY" } });
    await expect(startRound(host)).rejects.toThrow(ConflictError);
  });
});

describe("skipContestant", () => {
  it("advances that team's cursor and swaps the contestant", async () => {
    await startRound(host);
    const update = await skipContestant({ ...host, teamId: "t1" });
    expect(update.event).toBe("CONTESTANT_SKIPPED");
    expect(update.game.currentRound?.contestantPlayerIds).toEqual(["a2", "b1"]);
    expect(table.get(`GAME#${GAME_ID}`, "TEAM#t1")?.nextContestantCursor).toBe(2);
  });

  it("is illegal once buzzers are armed", async () => {
    await startRound(host);
    await armBuzzers(host);
    await expect(skipContestant({ ...host, teamId: "t1" })).rejects.toThrow(ConflictError);
  });
});

describe("round actions", () => {
  it("plays a full round through the handlers and banks the pot", async () => {
    await startRound(host);
    let update = await armBuzzers(host);
    expect(update.event).toBe("BUZZERS_ARMED");
    expect(update.game.currentRound?.questionText).toBe("Name a pet");

    update = await resetBuzzers(host);
    expect(update.game.currentRound?.state).toBe("FACE_OFF_ARMED");

    update = await setFaceOffWinner({ ...host, teamId: "t1" });
    expect(update.event).toBe("FACE_OFF_WON");

    update = await choosePassOrPlay({ ...host, playingTeamId: "t1" });
    expect(update.event).toBe("PLAYING");
    expect(update.game.currentRound?.currentGuesserPlayerId).toBe("a2");

    update = await skipGuesser(host);
    expect(update.game.currentRound?.currentGuesserPlayerId).toBe("a3");

    update = await revealAnswer({ ...host, index: 1 });
    expect(update.event).toBe("ANSWER_REVEALED");
    expect(update.game.currentRound).toMatchObject({ pot: 30, currentGuesserPlayerId: "a1" });
    expect(update.game.currentRound?.board[1]).toEqual({ index: 1, text: "Cat", points: 30, revealed: true });

    for (let i = 0; i < 3; i++) update = await strike(host);
    expect(update.game.currentRound?.state).toBe("STEAL");

    update = await revealAnswer({ ...host, index: 0 });
    expect(update.game.currentRound).toMatchObject({ state: "REVEAL_REMAINING", awardedToTeamId: "t2", pot: 85 });

    update = await endRound(host);
    expect(update.event).toBe("ROUND_ENDED");
    expect(update.game.status).toBe("ROUND_ACTIVE");
    expect(update.game.teams.find((t) => t.id === "t2")?.score).toBe(85);
    expect(table.get(`GAME#${GAME_ID}`, "TEAM#t2")?.score).toBe(85);
    expect(table.get(`GAME#${GAME_ID}`, "ROUND#001")?.state).toBe("ENDED");
  });

  it("surfaces illegal transitions as conflicts and refuses without a round", async () => {
    await expect(armBuzzers(host)).rejects.toThrow(/No round/);
    await startRound(host);
    await expect(revealAnswer({ ...host, index: 0 })).rejects.toThrow(ConflictError);
    await expect(endRound(host)).rejects.toThrow(ConflictError);
  });
});

describe("undoRoundAction", () => {
  it("reverts host actions one at a time, oldest state last", async () => {
    await startRound(host);
    await expect(undoRoundAction(host)).rejects.toThrow(/Nothing to undo/);
    await armBuzzers(host);
    await setFaceOffWinner({ ...host, teamId: "t1" });
    await choosePassOrPlay({ ...host, playingTeamId: "t1" });
    let update = await revealAnswer({ ...host, index: 0 });
    expect(update.game.currentRound?.pot).toBe(55);

    update = await undoRoundAction(host);
    expect(update.event).toBe("ROUND_UNDONE");
    expect(update.game.currentRound).toMatchObject({ state: "PLAYING", pot: 0 });
    expect(update.game.currentRound?.board[0]?.revealed).toBe(false);
    expect(table.get(`GAME#${GAME_ID}`, "ROUND#001")).toMatchObject({ state: "PLAYING", pot: 0 });

    update = await undoRoundAction(host);
    expect(update.game.currentRound?.state).toBe("PASS_OR_PLAY");
    update = await undoRoundAction(host);
    expect(update.game.currentRound?.state).toBe("FACE_OFF_ARMED");
    update = await undoRoundAction(host);
    expect(update.game.currentRound?.state).toBe("PICK_CONTESTANTS");
    await expect(undoRoundAction(host)).rejects.toThrow(/Nothing to undo/);
  });

  it("undo then redo-by-hand keeps a clean stack", async () => {
    await startRound(host);
    await armBuzzers(host);
    await undoRoundAction(host);
    await armBuzzers(host);
    const item = table.get(`GAME#${GAME_ID}`, "ROUND#001");
    expect(Array.isArray(item?.history) ? item.history.length : -1).toBe(1);
  });

  it("caps the stack at ten states", async () => {
    await startRound(host);
    await armBuzzers(host);
    await setFaceOffWinner({ ...host, teamId: "t1" });
    await choosePassOrPlay({ ...host, playingTeamId: "t1" });
    for (let i = 0; i < 12; i++) await skipGuesser(host);
    const item = table.get(`GAME#${GAME_ID}`, "ROUND#001");
    expect(Array.isArray(item?.history) ? item.history.length : -1).toBe(10);
  });
});

/** Fast path: face-off winner plays and clears the board. */
async function finishRound(): Promise<void> {
  await armBuzzers(host);
  await setFaceOffWinner({ ...host, teamId: "t1" });
  await choosePassOrPlay({ ...host, playingTeamId: "t1" });
  const view = await hostGame(host);
  for (const slot of view.currentBoard) {
    if (!slot.revealed) await revealAnswer({ ...host, index: slot.index });
  }
  await endRound(host);
}
