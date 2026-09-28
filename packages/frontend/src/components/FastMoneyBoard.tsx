// Task 4.8 — the shared Fast Money board: one row per question, two answer columns.
import type { ApiFastMoney, FastMoneyQuestion } from "../lib/types";

interface Props {
  fastMoney: ApiFastMoney;
  questionCount: number;
  target: number;
  /** Host only: question texts to label the rows. */
  questions?: FastMoneyQuestion[];
  /** Row revealed by the latest event, for the flip animation. */
  justRevealed?: { slot: number; questionIndex: number } | null;
  playerNames: [string, string];
}

export function FastMoneyBoard({ fastMoney, questionCount, target, questions, justRevealed, playerNames }: Props) {
  const row = (slot: number, questionIndex: number) => fastMoney.rows.find((r) => r.slot === slot && r.questionIndex === questionIndex);
  const won = fastMoney.total >= target;

  return (
    <div className="fm">
      <div className="fm__head">
        <span />
        <span className="fm__player">{playerNames[0]}</span>
        <span className="fm__player">{playerNames[1]}</span>
      </div>
      {Array.from({ length: questionCount }, (_, questionIndex) => (
        <div className="fm__row" key={questionIndex}>
          <span className="fm__q">
            {questionIndex + 1}
            {questions?.[questionIndex] && <span className="fm__qtext">{questions[questionIndex].text}</span>}
          </span>
          {[1, 2].map((slot) => {
            const r = row(slot, questionIndex);
            const flip = justRevealed?.slot === slot && justRevealed.questionIndex === questionIndex;
            return (
              <span key={slot} className={`fm__cell${r?.revealed ? " fm__cell--revealed" : ""}${flip ? " slot--flip" : ""}`}>
                {r?.revealed ? (
                  <>
                    <span className="fm__answer">{r.answer ?? "—"}</span>
                    <span className="points">{r.points ?? 0}</span>
                  </>
                ) : (
                  <span className="fm__blank">{r?.answer !== undefined && r?.skipped ? "·" : ""}</span>
                )}
              </span>
            );
          })}
        </div>
      ))}
      <div className={`fm__total${won ? " fm__total--won" : ""}`}>
        <span className="label">Total</span>
        <span className="fm__totalValue">{fastMoney.total}</span>
        <span className="muted small">/ {target}</span>
      </div>
      {won && (
        <div className="banner banner--gold banner--pulse fm__win">
          <span className="fm__winStar" aria-hidden="true">★</span> {target} · YOU WIN! <span className="fm__winStar" aria-hidden="true">★</span>
        </div>
      )}
    </div>
  );
}
