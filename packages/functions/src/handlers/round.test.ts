import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors.js";
import { keys } from "../lib/keys.js";
import { installFakeDynamo, type FakeTable } from "../testSupport/fakeDynamo.js";
import { GAME_ID, HOST_TOKEN, player, seedGame, team } from "../testSupport/fixtures.js";
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
} from "./round.js";

let table: FakeTable;
const host = { gameId: GAME_ID, hostToken: HOST_TOKEN };

function seedReady(overrides: { roundCount?: number } = {}): void {
  seedGame(table, {
    meta: { status: "TEAMS_SET", config: { roundCount: overrides.roundCount ?? 2, roundMultipliers: [1, 2].slice(0, overrides.roundCount ?? 2), strikesToSteal: 3, fastMoneyQuestionCount: 5, fastMoneyP1Seconds: 20, fastMoneyP2Seconds: 25, fastMoneyTarget: 200 } },
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
}

beforeEach(() => {
  table = installFakeDynamo();
  seedReady();
});

describe("startRound", () => {
  it("auto-picks contestants, marks the survey used and activates the round", async () => {
    const update = await startRound({ ...host, surveyNumber: 1 });
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
  });

  it("uses the configured multiplier and rotates contestants across rounds", async () => {
    await startRound({ ...host, surveyNumber: 1 });
    await finishRound();
    const second = await startRound({ ...host, surveyNumber: 2 });
    expect(second.game.currentRound).toMatchObject({ number: 2, multiplier: 2, contestantPlayerIds: ["a2", "b2"] });
  });

  it("rejects a used or missing survey, a round in progress, and too many rounds", async () => {
    await expect(startRound({ ...host, surveyNumber: 9 })).rejects.toThrow(NotFoundError);
    await startRound({ ...host, surveyNumber: 1 });
    await expect(startRound({ ...host, surveyNumber: 2 })).rejects.toThrow(/still in progress/);
    await finishRound();
    await expect(startRound({ ...host, surveyNumber: 1 })).rejects.toThrow(ValidationError);
    await startRound({ ...host, surveyNumber: 2 });
    await finishRound();
    expect(table.get(`GAME#${GAME_ID}`, "META")?.status).toBe("FAST_MONEY");
    await expect(startRound({ ...host, surveyNumber: 2 })).rejects.toThrow(ConflictError);
  });

  it("requires teams", async () => {
    seedGame(table, { meta: { status: "LOBBY" } });
    await expect(startRound({ ...host, surveyNumber: 1 })).rejects.toThrow(ConflictError);
  });
});

describe("skipContestant", () => {
  it("advances that team's cursor and swaps the contestant", async () => {
    await startRound({ ...host, surveyNumber: 1 });
    const update = await skipContestant({ ...host, teamId: "t1" });
    expect(update.event).toBe("CONTESTANT_SKIPPED");
    expect(update.game.currentRound?.contestantPlayerIds).toEqual(["a2", "b1"]);
    expect(table.get(`GAME#${GAME_ID}`, "TEAM#t1")?.nextContestantCursor).toBe(2);
  });

  it("is illegal once buzzers are armed", async () => {
    await startRound({ ...host, surveyNumber: 1 });
    await armBuzzers(host);
    await expect(skipContestant({ ...host, teamId: "t1" })).rejects.toThrow(ConflictError);
  });
});

describe("round actions", () => {
  it("plays a full round through the handlers and banks the pot", async () => {
    await startRound({ ...host, surveyNumber: 1 });
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
    await startRound({ ...host, surveyNumber: 1 });
    await expect(revealAnswer({ ...host, index: 0 })).rejects.toThrow(ConflictError);
    await expect(endRound(host)).rejects.toThrow(ConflictError);
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
