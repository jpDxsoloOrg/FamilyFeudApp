import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../lib/errors.js";
import { keys } from "../lib/keys.js";
import { installFakeDynamo, type FakeTable } from "../testSupport/fakeDynamo.js";
import { GAME_ID, HOST_TOKEN, seedGame } from "../testSupport/fixtures.js";
import { deleteFastMoneyQuestion, deleteSurvey, parseAnswers, upsertFastMoneyQuestion, upsertSurvey } from "./authoring.js";
import { hostGame } from "./queries.js";

let table: FakeTable;
const host = { gameId: GAME_ID, hostToken: HOST_TOKEN };
const answers = [
  { text: "cat", points: 30 },
  { text: " Dog ", points: 55 },
  { text: "Fish", points: 10 },
];

beforeEach(() => {
  table = installFakeDynamo();
  seedGame(table);
});

describe("parseAnswers", () => {
  it("trims, keeps author order for ties, and sorts by points descending", () => {
    expect(parseAnswers({ a: [...answers, { text: "Bird", points: 30 }] }, "a")).toEqual([
      { text: "Dog", points: 55 },
      { text: "cat", points: 30 },
      { text: "Bird", points: 30 },
      { text: "Fish", points: 10 },
    ]);
  });

  it("rejects empty lists, more than 8, bad points, blank or duplicate text", () => {
    expect(() => parseAnswers({ a: [] }, "a")).toThrow(/between 1 and 8/);
    expect(() => parseAnswers({ a: Array.from({ length: 9 }, (_, i) => ({ text: `a${i}`, points: 1 })) }, "a")).toThrow(ValidationError);
    expect(() => parseAnswers({ a: [{ text: "x", points: 1.5 }] }, "a")).toThrow(/integer points/);
    expect(() => parseAnswers({ a: [{ text: "x", points: 101 }] }, "a")).toThrow(ValidationError);
    expect(() => parseAnswers({ a: [{ text: "  ", points: 1 }] }, "a")).toThrow(/needs text/);
    expect(() => parseAnswers({ a: [{ text: "Dog", points: 1 }, { text: "dog", points: 2 }] }, "a")).toThrow(/more than once/);
    expect(() => parseAnswers({}, "a")).toThrow(ValidationError);
  });
});

describe("upsertSurvey", () => {
  it("stores a sorted survey and exposes it through hostGame", async () => {
    const survey = await upsertSurvey({ ...host, number: 2, text: " Name a pet ", answers });
    expect(survey).toEqual({
      number: 2,
      text: "Name a pet",
      answers: [
        { text: "Dog", points: 55 },
        { text: "cat", points: 30 },
        { text: "Fish", points: 10 },
      ],
      used: false,
    });
    const view = await hostGame(host);
    expect(view.surveys).toEqual([survey]);
  });

  it("overwrites an unused survey with the same number", async () => {
    await upsertSurvey({ ...host, number: 1, text: "First", answers });
    await upsertSurvey({ ...host, number: 1, text: "Second", answers: [{ text: "Only", points: 99 }] });
    const view = await hostGame(host);
    expect(view.surveys).toHaveLength(1);
    expect(view.surveys[0]).toMatchObject({ text: "Second", answers: [{ text: "Only", points: 99 }] });
  });

  it("refuses to edit or delete a survey that has been played", async () => {
    table.seed({ ...keys.survey(GAME_ID, 3), text: "Played", answers, used: true });
    await expect(upsertSurvey({ ...host, number: 3, text: "x", answers })).rejects.toThrow(ConflictError);
    await expect(deleteSurvey({ ...host, number: 3 })).rejects.toThrow(ConflictError);
  });

  it("validates number, text and token", async () => {
    await expect(upsertSurvey({ ...host, number: 0, text: "x", answers })).rejects.toThrow(ValidationError);
    await expect(upsertSurvey({ ...host, number: 1, text: "  ", answers })).rejects.toThrow(ValidationError);
    await expect(upsertSurvey({ ...host, hostToken: "bad", number: 1, text: "x", answers })).rejects.toThrow(ForbiddenError);
  });
});

describe("deleteSurvey", () => {
  it("deletes an existing unused survey and 404s otherwise", async () => {
    await upsertSurvey({ ...host, number: 1, text: "Q", answers });
    await expect(deleteSurvey({ ...host, number: 1 })).resolves.toBe(true);
    expect(table.get(`GAME#${GAME_ID}`, "SURVEY#001")).toBeUndefined();
    await expect(deleteSurvey({ ...host, number: 1 })).rejects.toThrow(NotFoundError);
  });
});

describe("upsertFastMoneyQuestion", () => {
  it("stores a Fast Money question", async () => {
    const question = await upsertFastMoneyQuestion({ ...host, number: 1, text: "Name a fruit", answers });
    expect(question.answers[0]).toEqual({ text: "Dog", points: 55 });
    const view = await hostGame(host);
    expect(view.fastMoneyQuestions).toEqual([question]);
  });

  it("is locked once Fast Money has started", async () => {
    seedGame(table, { meta: { status: "FAST_MONEY" } });
    await expect(upsertFastMoneyQuestion({ ...host, number: 1, text: "x", answers })).rejects.toThrow(ConflictError);
  });
});

describe("deleteFastMoneyQuestion", () => {
  it("deletes an existing question and 404s otherwise", async () => {
    await upsertFastMoneyQuestion({ ...host, number: 2, text: "Q", answers });
    await expect(deleteFastMoneyQuestion({ ...host, number: 2 })).resolves.toBe(true);
    expect(table.get(`GAME#${GAME_ID}`, "FMQ#002")).toBeUndefined();
    await expect(deleteFastMoneyQuestion({ ...host, number: 2 })).rejects.toThrow(NotFoundError);
  });

  it("is locked once Fast Money has started", async () => {
    await upsertFastMoneyQuestion({ ...host, number: 1, text: "Q", answers });
    seedGame(table, { meta: { status: "FAST_MONEY" } });
    await expect(deleteFastMoneyQuestion({ ...host, number: 1 })).rejects.toThrow(ConflictError);
  });
});
