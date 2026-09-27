import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError } from "../lib/errors.js";
import { keys } from "../lib/keys.js";
import { installFakeDynamo, type FakeTable } from "../testSupport/fakeDynamo.js";
import { GAME_ID, HOST_TOKEN, player, seedGame } from "../testSupport/fixtures.js";
import { hostGame } from "./queries.js";

let table: FakeTable;

beforeEach(() => {
  table = installFakeDynamo();
});

describe("hostGame", () => {
  it("returns surveys and Fast Money questions with full answers for the host", async () => {
    seedGame(table, { players: [player("a")] });
    table.seed(
      { ...keys.survey(GAME_ID, 1), text: "Name a pet", answers: [{ text: "Dog", points: 60 }, { text: "Cat", points: 30 }], used: false },
      { ...keys.fastMoneyQuestion(GAME_ID, 1), text: "Name a fruit", answers: [{ text: "Apple", points: 40 }] },
    );
    const view = await hostGame({ gameId: GAME_ID, hostToken: HOST_TOKEN });
    expect(view.game.players).toHaveLength(1);
    expect(view.surveys).toEqual([
      { number: 1, text: "Name a pet", answers: [{ text: "Dog", points: 60 }, { text: "Cat", points: 30 }], used: false },
    ]);
    expect(view.fastMoneyQuestions[0]?.answers[0]).toEqual({ text: "Apple", points: 40 });
    expect(view.currentBoard).toEqual([]);
    expect(view.fastMoneyAnswers).toEqual([]);
  });

  it("refuses a bad token or a missing game", async () => {
    seedGame(table);
    await expect(hostGame({ gameId: GAME_ID, hostToken: "nope" })).rejects.toThrow(ForbiddenError);
    await expect(hostGame({ gameId: "missing", hostToken: HOST_TOKEN })).rejects.toThrow(NotFoundError);
  });
});
