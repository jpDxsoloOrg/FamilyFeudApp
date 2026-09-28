import { describe, expect, it } from "vitest";
import { toPublicBoard, toPublicFastMoneyRows, toPublicRound } from "./publicView.js";
import { createRound, roundReducer } from "./round.js";
import { DEFAULT_CONFIG, type FastMoneyResponse, type Player, type RoundData, type Survey } from "./types.js";

const survey: Survey = {
  number: 1,
  text: "Name a pet",
  answers: [
    { text: "Dog", points: 55 },
    { text: "Cat", points: 30 },
  ],
  used: false,
};
const players: Player[] = [
  { id: "a1", displayName: "a1", teamId: "A", order: 0, active: true },
  { id: "b1", displayName: "b1", teamId: "B", order: 0, active: true },
];
const ctx = { config: DEFAULT_CONFIG, players, teamIds: ["A", "B"] as const };

function leaks(value: unknown, secrets: string[]): string[] {
  const json = JSON.stringify(value);
  return secrets.filter((secret) => json.includes(secret));
}

describe("toPublicBoard", () => {
  it("hides text and points on unrevealed slots and keeps them on revealed ones", () => {
    const board = createRound(1, survey, 1, { A: "a1", B: "b1" }).board;
    const half = board.map((slot) => (slot.index === 1 ? { ...slot, revealed: true } : slot));
    expect(toPublicBoard(half)).toEqual([
      { index: 0, text: null, points: null, revealed: false },
      { index: 1, text: "Cat", points: 30, revealed: true },
    ]);
    expect(leaks(toPublicBoard(board), ["Dog", "Cat", "55", "30"])).toEqual([]);
  });
});

describe("toPublicRound", () => {
  const fresh = createRound(1, survey, 2, { A: "a1", B: "b1" });

  it("hides the question until buzzers are armed", () => {
    expect(toPublicRound(fresh).questionText).toBeNull();
    expect(leaks(toPublicRound(fresh), ["Name a pet", "Dog", "Cat"])).toEqual([]);
    const armed = roundReducer(fresh, { type: "ARM_BUZZERS" }, ctx).round;
    expect(toPublicRound(armed).questionText).toBe("Name a pet");
    expect(leaks(toPublicRound(armed), ["Dog", "Cat"])).toEqual([]);
  });

  it("maps contestants, guesser and scalar fields", () => {
    let round: RoundData = fresh;
    for (const action of [
      { type: "ARM_BUZZERS" },
      { type: "BUZZ", playerId: "b1" },
      { type: "REVEAL", index: 1 },
      { type: "SET_FACE_OFF_WINNER", teamId: "B" },
      { type: "CHOOSE_PASS_OR_PLAY", playingTeamId: "A" },
    ] as const) {
      round = roundReducer(round, action, ctx).round;
    }
    const view = toPublicRound(round);
    expect(view).toMatchObject({
      number: 1,
      multiplier: 2,
      state: "PLAYING",
      contestantPlayerIds: ["a1", "b1"],
      buzzWinnerPlayerId: "b1",
      faceOffWinnerTeamId: "B",
      playingTeamId: "A",
      currentGuesserPlayerId: "a1",
      strikes: 0,
      pot: 60,
      awardedToTeamId: null,
    });
    expect(view.board).toEqual([
      { index: 0, text: null, points: null, revealed: false },
      { index: 1, text: "Cat", points: 30, revealed: true },
    ]);
    expect(view).not.toHaveProperty("guesserQueue");
    expect(view).not.toHaveProperty("surveyNumber");
  });
});

describe("toPublicFastMoneyRows", () => {
  const rows: FastMoneyResponse[] = [
    { slot: 1, questionIndex: 0, answer: "apple", skipped: false, skippedSeq: null, matchedIndex: 0, points: 40, revealed: true },
    { slot: 1, questionIndex: 1, answer: "secret", skipped: false, skippedSeq: null, matchedIndex: null, points: 0, revealed: false },
    { slot: 2, questionIndex: 0, answer: null, skipped: true, skippedSeq: 1, matchedIndex: null, points: 0, revealed: false },
  ];

  it("hides answers and points until revealed, keeps skipped flags", () => {
    const view = toPublicFastMoneyRows(rows);
    expect(view).toEqual([
      { slot: 1, questionIndex: 0, answer: "apple", points: 40, revealed: true, skipped: false },
      { slot: 1, questionIndex: 1, answer: null, points: null, revealed: false, skipped: false },
      { slot: 2, questionIndex: 0, answer: null, points: null, revealed: false, skipped: true },
    ]);
    expect(leaks(view, ["secret", "matchedIndex", "skippedSeq"])).toEqual([]);
  });
});
