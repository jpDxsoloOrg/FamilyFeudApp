// Task 4.6 — host console Fast Money UI.
import { suggestMatch } from "@familyfeud/core";
import { useEffect, useMemo, useState } from "react";
import { useCountdown } from "../hooks/useCountdown";
import { playerName, teamName } from "../lib/gameHelpers";
import type { ApiGame, ApiHostFastMoneyRow, FastMoneyQuestion } from "../lib/types";
import { FastMoneyBoard } from "./FastMoneyBoard";

export interface HostFastMoneyActions {
  selectPlayers: (teamId: string, playerIds: string[]) => void;
  startTurn: (slot: number) => void;
  endTurn: () => void;
  buzzDuplicate: (questionIndex: number) => void;
  reveal: (slot: number, questionIndex: number, matchedIndex: number | null) => void;
  finish: () => void;
}

interface Props {
  game: ApiGame;
  questions: FastMoneyQuestion[];
  answers: ApiHostFastMoneyRow[];
  clockOffset: number;
  busy: boolean;
  actions: HostFastMoneyActions;
  /** Called while a turn runs so live answers stay fresh (they do not fan out). */
  onPoll: () => void;
}

const POLL_MS = 1500;

function SelectPlayers({ game, busy, onSelect }: { game: ApiGame; busy: boolean; onSelect: (teamId: string, ids: string[]) => void }) {
  const leading = useMemo(() => [...game.teams].sort((a, b) => b.score - a.score)[0], [game.teams]);
  const [teamId, setTeamId] = useState(game.fastMoney?.teamId ?? leading?.id ?? "");
  const [picked, setPicked] = useState<string[]>(game.fastMoney?.playerIds ?? []);
  const team = game.teams.find((t) => t.id === teamId);
  const members = team?.players.filter((p) => p.active) ?? [];

  function toggle(id: string): void {
    setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id].slice(-2)));
  }

  return (
    <section className="card form">
      <h2>Fast Money — pick the players</h2>
      <p className="muted small">The leading team is preselected. Choose two players; the first plays first.</p>
      <div className="button-row">
        {game.teams.map((t) => (
          <button key={t.id} type="button" className={`button${t.id === teamId ? " button--primary" : ""}`} disabled={busy} onClick={() => { setTeamId(t.id); setPicked([]); }}>
            {t.name} ({t.score})
          </button>
        ))}
      </div>
      <div className="chips">
        {members.map((p) => {
          const at = picked.indexOf(p.id);
          return (
            <button key={p.id} type="button" className={`chip chip--button${at !== -1 ? " chip--picked" : ""}`} disabled={busy} onClick={() => toggle(p.id)}>
              {at !== -1 && <span className="roster__order">{at + 1}</span>} {p.displayName}
            </button>
          );
        })}
      </div>
      <button className="button button--primary" type="button" disabled={busy || picked.length !== 2 || !team} onClick={() => team && onSelect(team.id, picked)}>
        Confirm players
      </button>
    </section>
  );
}

function RevealControls({ slot, name, rows, questions, busy, onReveal }: { slot: number; name: string; rows: ApiHostFastMoneyRow[]; questions: FastMoneyQuestion[]; busy: boolean; onReveal: (slot: number, q: number, m: number | null) => void }) {
  const next = rows.filter((r) => r.slot === slot && !r.revealed).sort((a, b) => a.questionIndex - b.questionIndex)[0];
  const question = next ? questions[next.questionIndex] : undefined;
  const suggested = next?.answer && question ? suggestMatch(next.answer, question.answers) : null;
  const [choice, setChoice] = useState<string>(suggested === null ? "none" : String(suggested));
  useEffect(() => setChoice(suggested === null ? "none" : String(suggested)), [suggested, next?.questionIndex]);

  if (!next || !question) return <p className="muted small">{name}: all revealed.</p>;
  return (
    <div className="card form">
      <h3>
        Reveal {name} · Q{next.questionIndex + 1}: {question.text}
      </h3>
      <p>
        Answer: <strong>{next.answer ?? "(no answer)"}</strong>
        {next.skipped && <span className="tag">skipped</span>}
      </p>
      <label className="field">
        <span className="label">Matches board answer{suggested !== null && <span className="tag tag--gold">suggested</span>}</span>
        <select className="input input--small" value={choice} onChange={(event) => setChoice(event.target.value)}>
          <option value="none">Not on the board (0)</option>
          {question.answers.map((answer, index) => (
            <option key={index} value={index}>
              {answer.text} — {answer.points}
            </option>
          ))}
        </select>
      </label>
      <button className="button button--primary" type="button" disabled={busy} onClick={() => onReveal(slot, next.questionIndex, choice === "none" ? null : Number(choice))}>
        Reveal
      </button>
    </div>
  );
}

export function HostFastMoney({ game, questions, answers, clockOffset, busy, actions, onPoll }: Props) {
  const fm = game.fastMoney;
  const seconds = useCountdown(fm?.timerEndsAt, clockOffset);
  const running = fm?.timerEndsAt !== null && fm?.timerEndsAt !== undefined;

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(onPoll, POLL_MS);
    return () => window.clearInterval(timer);
  }, [running, onPoll]);

  if (!fm) return null;
  const names: [string, string] = [playerName(game, fm.playerIds[0]), playerName(game, fm.playerIds[1])];
  const answerOf = (slot: number, q: number) => answers.find((r) => r.slot === slot && r.questionIndex === q);

  return (
    <>
      <p className="state-line">Fast Money · {teamName(game, fm.teamId)} · {fm.stage.replace("_", " ")}</p>

      {fm.stage === "SETUP" && (
        <>
          <SelectPlayers game={game} busy={busy} onSelect={actions.selectPlayers} />
          {fm.playerIds.length === 2 && (
            <div className="controls">
              <button className="button button--primary" type="button" disabled={busy} onClick={() => actions.startTurn(1)}>
                Start {names[0]} ({game.config.fastMoneyP1Seconds}s)
              </button>
            </div>
          )}
        </>
      )}

      {(fm.stage === "P1_ANSWERING" || fm.stage === "P2_ANSWERING") && (
        <section className="card">
          <div className="page__header">
            <h2 style={{ margin: 0 }}>
              {fm.stage === "P1_ANSWERING" ? names[0] : names[1]} {running ? "is answering" : "is up next"}
            </h2>
            {running && <span className="fm__clock">{seconds}s</span>}
          </div>
          <div className="controls">
            {!running && fm.stage === "P2_ANSWERING" && (
              <button className="button button--primary" type="button" disabled={busy} onClick={() => actions.startTurn(2)}>
                Start {names[1]} ({game.config.fastMoneyP2Seconds}s)
              </button>
            )}
            {running && (
              <button className="button button--danger" type="button" disabled={busy} onClick={actions.endTurn}>
                End turn{seconds === 0 ? " (time's up)" : " early"}
              </button>
            )}
          </div>
          <table className="fm-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Question</th>
                <th>{names[0]}</th>
                <th>{names[1]}</th>
              </tr>
            </thead>
            <tbody>
              {questions.slice(0, game.config.fastMoneyQuestionCount).map((question, q) => {
                const p1 = answerOf(1, q);
                const p2 = answerOf(2, q);
                return (
                  <tr key={q}>
                    <td>{q + 1}</td>
                    <td className="muted small">{question.text}</td>
                    <td>{p1?.answer ?? (p1?.skipped ? "(skipped)" : "")}</td>
                    <td className={p2?.likelyDuplicate ? "fm-table__dup" : ""}>
                      {p2?.answer ?? (p2?.skipped ? "(skipped)" : "")}
                      {fm.stage === "P2_ANSWERING" && p2?.answer && (
                        <button className="button button--small button--danger" type="button" disabled={busy} onClick={() => actions.buzzDuplicate(q)} title="Duplicate of player 1 — make them answer again">
                          {p2.likelyDuplicate ? "Duplicate!" : "Buzz dup"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {(fm.stage === "REVEAL" || fm.stage === "DONE") && (
        <>
          <FastMoneyBoard fastMoney={fm} questionCount={game.config.fastMoneyQuestionCount} target={game.config.fastMoneyTarget} questions={questions} playerNames={names} />
          {fm.stage === "REVEAL" && (
            <div className="grid-2">
              <RevealControls slot={1} name={names[0]} rows={answers} questions={questions} busy={busy} onReveal={actions.reveal} />
              <RevealControls slot={2} name={names[1]} rows={answers} questions={questions} busy={busy} onReveal={actions.reveal} />
            </div>
          )}
          <div className="controls">
            {fm.stage === "REVEAL" && (
              <button className="button button--primary" type="button" disabled={busy} onClick={actions.finish}>
                Finish game
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}
