// Task 5.3 — export / import a question bank, and keep one in this browser for the next game.
import { BankParseError, parseBank, toBankCsv, toBankJson, type QuestionBank } from "@familyfeud/core";
import { useRef, useState } from "react";
import type { FastMoneyQuestion, Survey } from "../lib/types";

const SAVED_BANK_KEY = "familyfeud.savedBank";

interface Props {
  surveys: Survey[];
  fastMoneyQuestions: FastMoneyQuestion[];
  busy: boolean;
  /** Add every question in the bank to this game, numbered after the existing ones. */
  onImport: (bank: QuestionBank) => Promise<void>;
}

function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function readSaved(): QuestionBank | null {
  try {
    const raw = localStorage.getItem(SAVED_BANK_KEY);
    return raw ? parseBank(raw) : null;
  } catch {
    return null;
  }
}

export function QuestionBankTools({ surveys, fastMoneyQuestions, busy, onImport }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<QuestionBank | null>(readSaved);

  const bank: QuestionBank = {
    surveys: surveys.map(({ text, answers }) => ({ text, answers })),
    fastMoney: fastMoneyQuestions.map(({ text, answers }) => ({ text, answers })),
  };
  const count = (b: QuestionBank) => `${b.surveys.length} surveys, ${b.fastMoney.length} Fast Money`;
  const empty = bank.surveys.length === 0 && bank.fastMoney.length === 0;

  async function importBank(b: QuestionBank): Promise<void> {
    setError(undefined);
    setMessage(undefined);
    try {
      await onImport(b);
      setMessage(`Imported ${count(b)}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function onFile(file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      await importBank(parseBank(await file.text()));
    } catch (cause) {
      setError(cause instanceof BankParseError ? `${file.name}: ${cause.message}` : String(cause));
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function saveHere(): void {
    try {
      localStorage.setItem(SAVED_BANK_KEY, toBankJson(bank));
      setSaved(bank);
      setMessage("Saved in this browser for your next game.");
    } catch {
      setError("Couldn't save in this browser.");
    }
  }

  return (
    <section>
      <h2>Question bank</h2>
      <p className="muted small">
        Export this game's questions to reuse them, or import a JSON / CSV file. Imported questions are added after the ones already here. CSV format: <code>type,question,answer1,points1,answer2,points2,…</code> with type <code>survey</code> or <code>fastmoney</code>.
      </p>
      <div className="button-row">
        <button className="button button--small" type="button" disabled={busy || empty} onClick={() => download("familyfeud-bank.json", toBankJson(bank), "application/json")}>
          Export JSON
        </button>
        <button className="button button--small" type="button" disabled={busy || empty} onClick={() => download("familyfeud-bank.csv", toBankCsv(bank), "text/csv")}>
          Export CSV
        </button>
        <button className="button button--small" type="button" disabled={busy} onClick={() => fileInput.current?.click()}>
          Import file…
        </button>
        <input ref={fileInput} type="file" accept=".json,.csv,text/csv,application/json" hidden onChange={(event) => onFile(event.target.files?.[0])} />
        <button className="button button--small button--ghost" type="button" disabled={busy || empty} onClick={saveHere}>
          Save in this browser
        </button>
        {saved && (
          <button className="button button--small button--ghost" type="button" disabled={busy} onClick={() => importBank(saved)}>
            Load saved ({count(saved)})
          </button>
        )}
      </div>
      {message && <p className="muted small">{message}</p>}
      {error && <p className="field-error">{error}</p>}
    </section>
  );
}
