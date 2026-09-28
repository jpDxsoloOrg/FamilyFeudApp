import { describe, expect, it } from "vitest";
import { BankParseError, parseBank, parseBankCsv, parseBankJson, splitCsvLine, toBankCsv, toBankJson, type QuestionBank } from "./questionBank.js";

const bank: QuestionBank = {
  surveys: [{ text: "Name a pet", answers: [{ text: "Dog", points: 55 }, { text: "Cat, the fluffy", points: 30 }] }],
  fastMoney: [{ text: 'Say "hi"', answers: [{ text: "Hi", points: 60 }] }],
};

describe("JSON round trip", () => {
  it("serialises with a format tag and parses back", () => {
    const json = toBankJson(bank);
    expect(JSON.parse(json)).toMatchObject({ format: "familyfeud-bank", version: 1 });
    expect(parseBankJson(json)).toEqual(bank);
  });

  it("validates shape and answer rules", () => {
    expect(() => parseBankJson("nope")).toThrow(BankParseError);
    expect(() => parseBankJson("{}")).toThrow(/no questions/);
    expect(() => parseBankJson(JSON.stringify({ surveys: [{ text: "", answers: [] }] }))).toThrow(/missing question text/);
    expect(() => parseBankJson(JSON.stringify({ surveys: [{ text: "q", answers: [] }] }))).toThrow(/at least one answer/);
    expect(() => parseBankJson(JSON.stringify({ surveys: [{ text: "q", answers: [{ text: "a", points: 101 }] }] }))).toThrow(/0–100/);
    expect(() => parseBankJson(JSON.stringify({ surveys: "x" }))).toThrow(/must be a list/);
    expect(parseBankJson(JSON.stringify({ fastMoney: [{ text: " q ", answers: [{ text: " a ", points: "5" }] }] }))).toEqual({
      surveys: [],
      fastMoney: [{ text: "q", answers: [{ text: "a", points: 5 }] }],
    });
  });
});

describe("CSV round trip", () => {
  it("quotes commas and quotes, and parses back", () => {
    const csv = toBankCsv(bank);
    expect(csv.split("\n")[1]).toBe('survey,Name a pet,Dog,55,"Cat, the fluffy",30');
    expect(csv.split("\n")[2]).toBe('fastmoney,"Say ""hi""",Hi,60');
    expect(parseBankCsv(csv)).toEqual(bank);
  });

  it("accepts no header, odd type spellings and blank trailing cells", () => {
    const parsed = parseBankCsv("Survey,Q1,A,10,B,5,,\nfast-money,Q2,C,7\n");
    expect(parsed.surveys).toEqual([{ text: "Q1", answers: [{ text: "A", points: 10 }, { text: "B", points: 5 }] }]);
    expect(parsed.fastMoney).toEqual([{ text: "Q2", answers: [{ text: "C", points: 7 }] }]);
  });

  it("rejects bad types and points with the line number", () => {
    expect(() => parseBankCsv("type,question\nround,Q,A,1")).toThrow(/line 2: type/);
    expect(() => parseBankCsv("survey,Q,A,lots")).toThrow(/line 1: answer 1/);
    expect(() => parseBankCsv("\n\n")).toThrow(/no questions/);
  });

  it("splitCsvLine handles quotes", () => {
    expect(splitCsvLine('a,"b,c","d ""e""",f')).toEqual(["a", "b,c", 'd "e"', "f"]);
  });
});

describe("parseBank", () => {
  it("sniffs JSON vs CSV", () => {
    expect(parseBank(toBankJson(bank))).toEqual(bank);
    expect(parseBank(toBankCsv(bank))).toEqual(bank);
  });
});
