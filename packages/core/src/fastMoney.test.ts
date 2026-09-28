import { describe, expect, it } from "vitest";
import {
  answerQuestion,
  buildQueue,
  clearAnswer,
  emptyResponses,
  FAST_MONEY_GRACE_MS,
  hasWon,
  isDuplicate,
  isWithinDeadline,
  normalizeAnswer,
  skipQuestion,
  suggestMatch,
  totalPoints,
} from "./fastMoney.js";

describe("emptyResponses / buildQueue", () => {
  it("creates two slots of n blank rows and queues them in index order", () => {
    const rows = emptyResponses(3);
    expect(rows).toHaveLength(6);
    expect(rows.filter((r) => r.slot === 2).map((r) => r.questionIndex)).toEqual([0, 1, 2]);
    expect(buildQueue(rows, 1)).toEqual([0, 1, 2]);
    expect(() => emptyResponses(0)).toThrow();
  });

  it("skipped questions come back after the fresh ones, in skip order", () => {
    let rows = emptyResponses(4);
    rows = skipQuestion(rows, 1, 1);
    rows = skipQuestion(rows, 1, 0);
    expect(buildQueue(rows, 1)).toEqual([2, 3, 1, 0]);
    rows = answerQuestion(rows, 1, 2, "x");
    rows = answerQuestion(rows, 1, 3, "y");
    expect(buildQueue(rows, 1)).toEqual([1, 0]);
    rows = answerQuestion(rows, 1, 1, "z");
    rows = answerQuestion(rows, 1, 0, "w");
    expect(buildQueue(rows, 1)).toEqual([]);
    // Player 2 is untouched.
    expect(buildQueue(rows, 2)).toEqual([0, 1, 2, 3]);
  });

  it("skipping an already-skipped question moves it to the back again", () => {
    let rows = emptyResponses(3);
    rows = skipQuestion(rows, 1, 0);
    rows = skipQuestion(rows, 1, 1);
    rows = skipQuestion(rows, 1, 0);
    expect(buildQueue(rows, 1)).toEqual([2, 1, 0]);
  });
});

describe("answerQuestion / clearAnswer", () => {
  it("stores a trimmed answer once", () => {
    let rows = emptyResponses(2);
    rows = answerQuestion(rows, 2, 1, "  Apple ");
    expect(rows.find((r) => r.slot === 2 && r.questionIndex === 1)?.answer).toBe("Apple");
    expect(() => answerQuestion(rows, 2, 1, "Pear")).toThrow(/already answered/);
    expect(() => answerQuestion(rows, 2, 0, "   ")).toThrow(/empty/);
    expect(() => answerQuestion(rows, 2, 9, "x")).toThrow(/No Fast Money question/);
    expect(() => skipQuestion(rows, 2, 1)).toThrow(/already answered/);
  });

  it("clearAnswer reopens the question at the front of the queue", () => {
    let rows = emptyResponses(3);
    rows = answerQuestion(rows, 2, 0, "Apple");
    rows = skipQuestion(rows, 2, 1);
    rows = clearAnswer(rows, 2, 0);
    expect(rows.find((r) => r.slot === 2 && r.questionIndex === 0)).toMatchObject({ answer: null, skipped: false, skippedSeq: null });
    expect(buildQueue(rows, 2)).toEqual([0, 2, 1]);
  });

  it("never mutates its input", () => {
    const rows = emptyResponses(2);
    const before = JSON.stringify(rows);
    answerQuestion(skipQuestion(rows, 1, 0), 1, 1, "x");
    expect(JSON.stringify(rows)).toBe(before);
  });
});

describe("normalizeAnswer / isDuplicate", () => {
  it("lowercases, strips accents, punctuation, articles and plurals", () => {
    expect(normalizeAnswer("  The Dogs! ")).toBe("dog");
    expect(normalizeAnswer("Café")).toBe("cafe");
    expect(normalizeAnswer("a pair of glasses")).toBe("pair of glass");
    expect(normalizeAnswer("Puppies")).toBe("puppy");
    expect(normalizeAnswer("Dishes")).toBe("dish");
    expect(normalizeAnswer("Bus")).toBe("bus");
    expect(normalizeAnswer("Chess")).toBe("chess");
    expect(normalizeAnswer("")).toBe("");
  });

  it("flags duplicates after normalisation only", () => {
    expect(isDuplicate("Dog", "the dogs")).toBe(true);
    expect(isDuplicate("Dog", "Cat")).toBe(false);
    expect(isDuplicate(null, "Dog")).toBe(false);
    expect(isDuplicate("!!!", "???")).toBe(false);
  });
});

describe("suggestMatch", () => {
  const board = [
    { text: "Dog", points: 55 },
    { text: "Cat", points: 30 },
    { text: "Gold fish", points: 10 },
  ];

  it("prefers an exact normalised match, then whole-word containment", () => {
    expect(suggestMatch("dogs", board)).toBe(0);
    expect(suggestMatch("A cat!", board)).toBe(1);
    expect(suggestMatch("fish", board)).toBe(2);
    expect(suggestMatch("goldfish", board)).toBeNull();
    expect(suggestMatch("hamster", board)).toBeNull();
    expect(suggestMatch("", board)).toBeNull();
  });
});

describe("scoring and deadline", () => {
  it("totals revealed points only and detects the win", () => {
    let rows = emptyResponses(2);
    rows = rows.map((r) => (r.slot === 1 ? { ...r, points: 50, revealed: r.questionIndex === 0 } : { ...r, points: 99 }));
    expect(totalPoints(rows)).toBe(50);
    expect(hasWon(199, 200)).toBe(false);
    expect(hasWon(200, 200)).toBe(true);
  });

  it("allows submissions until the deadline plus grace, and none without a timer", () => {
    expect(isWithinDeadline(1000, 1000)).toBe(true);
    expect(isWithinDeadline(1000 + FAST_MONEY_GRACE_MS, 1000)).toBe(true);
    expect(isWithinDeadline(1000 + FAST_MONEY_GRACE_MS + 1, 1000)).toBe(false);
    expect(isWithinDeadline(1000, null)).toBe(false);
    expect(isWithinDeadline(5000, 1000, 0)).toBe(false);
  });
});
