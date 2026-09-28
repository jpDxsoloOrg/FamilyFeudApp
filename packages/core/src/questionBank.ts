// Task 5.3 — question bank import/export. Pure parsing and serialising; no I/O.
import type { SurveyAnswer } from "./types.js";

export interface BankQuestion {
  text: string;
  answers: SurveyAnswer[];
}

/** A reusable set of questions, independent of any game's numbering. */
export interface QuestionBank {
  surveys: BankQuestion[];
  fastMoney: BankQuestion[];
}

export const BANK_FORMAT = "familyfeud-bank";
export const BANK_VERSION = 1;
export const MAX_BANK_ANSWERS = 8;

export class BankParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BankParseError";
  }
}

function cleanQuestion(raw: unknown, where: string): BankQuestion {
  if (typeof raw !== "object" || raw === null) throw new BankParseError(`${where}: expected an object`);
  const { text, answers } = raw as { text?: unknown; answers?: unknown };
  if (typeof text !== "string" || !text.trim()) throw new BankParseError(`${where}: missing question text`);
  if (!Array.isArray(answers) || answers.length === 0) throw new BankParseError(`${where}: needs at least one answer`);
  if (answers.length > MAX_BANK_ANSWERS) throw new BankParseError(`${where}: at most ${MAX_BANK_ANSWERS} answers`);
  const cleaned = answers.map((answer, index): SurveyAnswer => {
    const a = answer as { text?: unknown; points?: unknown };
    const answerText = typeof a?.text === "string" ? a.text.trim() : "";
    const points = typeof a?.points === "number" ? a.points : Number(a?.points);
    if (!answerText) throw new BankParseError(`${where}: answer ${index + 1} has no text`);
    if (!Number.isInteger(points) || points < 0 || points > 100) {
      throw new BankParseError(`${where}: answer ${index + 1} needs whole-number points 0–100`);
    }
    return { text: answerText, points };
  });
  return { text: text.trim(), answers: cleaned };
}

/** Serialise a bank as pretty JSON with a format tag. */
export function toBankJson(bank: QuestionBank): string {
  return JSON.stringify({ format: BANK_FORMAT, version: BANK_VERSION, ...bank }, null, 2);
}

export function parseBankJson(json: string): QuestionBank {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new BankParseError("Not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null) throw new BankParseError("Expected a JSON object");
  const { surveys, fastMoney } = parsed as { surveys?: unknown; fastMoney?: unknown };
  const list = (value: unknown, name: string): BankQuestion[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new BankParseError(`"${name}" must be a list`);
    return value.map((entry, index) => cleanQuestion(entry, `${name}[${index + 1}]`));
  };
  const bank = { surveys: list(surveys, "surveys"), fastMoney: list(fastMoney, "fastMoney") };
  if (bank.surveys.length === 0 && bank.fastMoney.length === 0) throw new BankParseError("The file has no questions");
  return bank;
}

/* ---------- CSV ----------
 * One question per line:
 *   type,question,answer1,points1,answer2,points2,...
 * where type is "survey" or "fastmoney". A header line is optional. Fields may
 * be double-quoted (with "" for a literal quote).
 */

function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toBankCsv(bank: QuestionBank): string {
  const lines = ["type,question,answer1,points1,answer2,points2,..."];
  const row = (type: string, question: BankQuestion): string =>
    [type, csvEscape(question.text), ...question.answers.flatMap((a) => [csvEscape(a.text), String(a.points)])].join(",");
  for (const q of bank.surveys) lines.push(row("survey", q));
  for (const q of bank.fastMoney) lines.push(row("fastmoney", q));
  return `${lines.join("\n")}\n`;
}

/** Split one CSV line into fields, honouring double quotes. */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

export function parseBankCsv(csv: string): QuestionBank {
  const bank: QuestionBank = { surveys: [], fastMoney: [] };
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  lines.forEach((line, index) => {
    const fields = splitCsvLine(line);
    const type = (fields[0] ?? "").toLowerCase().replace(/[\s_-]/g, "");
    if (index === 0 && type === "type") return; // header
    const where = `line ${index + 1}`;
    if (type !== "survey" && type !== "fastmoney") {
      throw new BankParseError(`${where}: type must be "survey" or "fastmoney"`);
    }
    const [, text, ...rest] = fields;
    const answers: { text: string; points: number }[] = [];
    for (let i = 0; i + 1 < rest.length; i += 2) {
      if (!rest[i] && !rest[i + 1]) continue;
      answers.push({ text: rest[i], points: Number(rest[i + 1]) });
    }
    const question = cleanQuestion({ text, answers }, where);
    (type === "survey" ? bank.surveys : bank.fastMoney).push(question);
  });
  if (bank.surveys.length === 0 && bank.fastMoney.length === 0) throw new BankParseError("The file has no questions");
  return bank;
}

/** Sniff the format from the content. */
export function parseBank(content: string): QuestionBank {
  return content.trimStart().startsWith("{") ? parseBankJson(content) : parseBankCsv(content);
}
