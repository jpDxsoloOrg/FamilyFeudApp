// Task 2.8 — shared editor for a survey / Fast Money question: text + up to 8 answers with points.
import { useState, type FormEvent } from "react";
import type { SurveyAnswerInput } from "../lib/types";

export const MAX_ANSWERS = 8;

interface AnswerDraft {
  text: string;
  points: string;
}

export interface QuestionDraft {
  number: number;
  text: string;
  answers: SurveyAnswerInput[];
}

interface Props {
  title: string;
  initial: QuestionDraft;
  /** Numbers already in use (other than `initial.number`), to refuse a collision. */
  takenNumbers: number[];
  busy: boolean;
  error?: string;
  onSave: (draft: QuestionDraft) => void;
  onCancel: () => void;
}

function toDrafts(answers: SurveyAnswerInput[]): AnswerDraft[] {
  const rows = answers.map((answer) => ({ text: answer.text, points: String(answer.points) }));
  while (rows.length < 3) rows.push({ text: "", points: "" });
  return rows;
}

/** Parse the rows the author filled in; blank rows are ignored. */
function parseRows(rows: AnswerDraft[]): { answers: SurveyAnswerInput[]; problem?: string } {
  const answers: SurveyAnswerInput[] = [];
  for (const [index, row] of rows.entries()) {
    const text = row.text.trim();
    const pointsText = row.points.trim();
    if (!text && !pointsText) continue;
    const points = Number(pointsText);
    if (!text) return { answers, problem: `Answer ${index + 1} needs text` };
    if (!Number.isInteger(points) || points < 0 || points > 100) {
      return { answers, problem: `Answer ${index + 1} needs whole-number points from 0 to 100` };
    }
    answers.push({ text, points });
  }
  if (answers.length === 0) return { answers, problem: "Add at least one answer" };
  return { answers };
}

export function QuestionEditor({ title, initial, takenNumbers, busy, error, onSave, onCancel }: Props) {
  const [number, setNumber] = useState(String(initial.number));
  const [text, setText] = useState(initial.text);
  const [rows, setRows] = useState<AnswerDraft[]>(() => toDrafts(initial.answers));
  const [problem, setProblem] = useState<string>();

  const total = rows.reduce((sum, row) => sum + (Number(row.points) || 0), 0);

  function updateRow(index: number, patch: Partial<AnswerDraft>): void {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number): void {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    const parsedNumber = Number(number);
    if (!Number.isInteger(parsedNumber) || parsedNumber < 1) {
      setProblem("Number must be a whole number from 1");
      return;
    }
    if (takenNumbers.includes(parsedNumber)) {
      setProblem(`Number ${parsedNumber} is already used — pick another or edit that one`);
      return;
    }
    if (!text.trim()) {
      setProblem("Enter the question");
      return;
    }
    const parsed = parseRows(rows);
    if (parsed.problem) {
      setProblem(parsed.problem);
      return;
    }
    setProblem(undefined);
    onSave({ number: parsedNumber, text: text.trim(), answers: parsed.answers });
  }

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <h3>{title}</h3>
      <div className="field field--row">
        <label className="label" htmlFor="q-number">
          #
        </label>
        <input
          id="q-number"
          className="input input--small input--points"
          inputMode="numeric"
          value={number}
          onChange={(event) => setNumber(event.target.value)}
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="q-text">
          Question
        </label>
        <input
          id="q-text"
          className="input"
          value={text}
          maxLength={200}
          placeholder="Name something people do when they can't sleep"
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <div className="field">
        <span className="label">Answers (highest points first is done for you)</span>
        <div className="answers">
          {rows.map((row, index) => (
            <div className="answers__row" key={index}>
              <input
                className="input input--small"
                aria-label={`Answer ${index + 1}`}
                value={row.text}
                maxLength={60}
                placeholder={`Answer ${index + 1}`}
                onChange={(event) => updateRow(index, { text: event.target.value })}
              />
              <input
                className="input input--small input--points"
                aria-label={`Points for answer ${index + 1}`}
                inputMode="numeric"
                value={row.points}
                placeholder="pts"
                onChange={(event) => updateRow(index, { points: event.target.value })}
              />
              <button
                className="button button--small button--icon"
                type="button"
                aria-label={`Remove answer ${index + 1}`}
                onClick={() => removeRow(index)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="button-row">
          <button
            className="button button--small"
            type="button"
            disabled={rows.length >= MAX_ANSWERS}
            onClick={() => setRows((current) => [...current, { text: "", points: "" }])}
          >
            + Answer
          </button>
          <span className="muted small">
            {rows.filter((row) => row.text.trim()).length}/{MAX_ANSWERS} · {total} pts total
          </span>
        </div>
      </div>
      {(problem ?? error) && <p className="field-error">{problem ?? error}</p>}
      <div className="button-row">
        <button className="button button--primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button className="button button--ghost" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
