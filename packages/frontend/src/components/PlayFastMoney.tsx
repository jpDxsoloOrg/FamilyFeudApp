// Task 4.7 — player Fast Money UI: one question at a time, countdown, look-away screen.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useCountdown } from "../hooks/useCountdown";
import { fetchFastMoneyView, skipFastMoneyQuestion, submitFastMoneyAnswer, toApiError } from "../lib/api";
import { playerName } from "../lib/gameHelpers";
import type { ApiFastMoneyView, ApiGame, ApiGameUpdate, ApiPlayerMessage } from "../lib/types";
import { FastMoneyBoard } from "./FastMoneyBoard";

interface Props {
  gameId: string;
  game: ApiGame;
  me: string;
  clockOffset: number;
  lastEvent: ApiGameUpdate | undefined;
  lastMessage: ApiPlayerMessage | undefined;
  justRevealed: { slot: number; questionIndex: number } | null;
}

const TOAST_MS = 3000;

export function PlayFastMoney({ gameId, game, me, clockOffset, lastEvent, lastMessage, justRevealed }: Props) {
  const fm = game.fastMoney;
  const [view, setView] = useState<ApiFastMoneyView | undefined>();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [toast, setToast] = useState<string>();
  const seconds = useCountdown(view?.timerEndsAt ?? fm?.timerEndsAt, clockOffset);

  const refresh = useCallback(() => {
    fetchFastMoneyView(gameId, me)
      .then((next) => next && setView(next))
      .catch(() => undefined);
  }, [gameId, me]);

  // Turn boundaries and a duplicate buzz are the moments the queue changes under us.
  useEffect(() => {
    refresh();
  }, [refresh, lastEvent?.serverTime]);

  useEffect(() => {
    if (lastMessage?.type !== "FAST_MONEY_DUPLICATE") return;
    setToast("Duplicate answer — give a different one!");
    setAnswer("");
    refresh();
    const timer = window.setTimeout(() => setToast(undefined), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [lastMessage, refresh]);

  if (!fm) return null;
  const mySlot = fm.playerIds.indexOf(me) + 1; // 0 = not a Fast Money player
  const names: [string, string] = [playerName(game, fm.playerIds[0]), playerName(game, fm.playerIds[1])];
  const answeringSlot = fm.timerEndsAt !== null ? (fm.stage === "P1_ANSWERING" ? 1 : fm.stage === "P2_ANSWERING" ? 2 : 0) : 0;
  const myTurn = mySlot !== 0 && mySlot === answeringSlot;
  const current = view?.queue[0];

  async function act(fn: () => Promise<ApiFastMoneyView>): Promise<void> {
    setBusy(true);
    setProblem(undefined);
    try {
      setView(await fn());
      setAnswer("");
    } catch (cause) {
      setProblem(toApiError(cause).message);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (!current || !answer.trim()) return;
    void act(() => submitFastMoneyAnswer(gameId, me, current.questionIndex, answer.trim()));
  }

  if (myTurn) {
    return (
      <div className="fm__turn">
        {toast && <div className="toast">{toast}</div>}
        <div className={`fm__bigclock${(seconds ?? 99) <= 5 ? " fm__bigclock--urgent" : ""}`}>{seconds ?? "—"}</div>
        {current ? (
          <form className="form" onSubmit={submit}>
            <p className="muted small">
              Question {view ? view.answered + 1 : ""} of {view?.total ?? fm.rows.length / 2}
            </p>
            <p className="question">{current.text}</p>
            <input
              className="input"
              value={answer}
              maxLength={60}
              autoFocus
              autoComplete="off"
              enterKeyHint="send"
              placeholder="Your answer"
              onChange={(event) => setAnswer(event.target.value)}
            />
            {problem && <p className="field-error">{problem}</p>}
            <div className="button-row">
              <button className="button button--primary" type="submit" disabled={busy || !answer.trim() || seconds === 0}>
                Submit
              </button>
              <button className="button button--ghost" type="button" disabled={busy || seconds === 0} onClick={() => act(() => skipFastMoneyQuestion(gameId, me, current.questionIndex))}>
                Skip
              </button>
            </div>
          </form>
        ) : (
          <p className="banner banner--gold">All answered — nice!</p>
        )}
      </div>
    );
  }

  if (mySlot !== 0 && answeringSlot !== 0 && !myTurn) {
    return (
      <div className="fm__lookaway">
        <div className="fm__eyes" aria-hidden="true">
          <span />
          <span />
        </div>
        <h2>Look away!</h2>
        <p className="muted">{names[answeringSlot - 1]} is answering. No peeking — you're up next.</p>
      </div>
    );
  }

  return (
    <>
      {toast && <div className="toast">{toast}</div>}
      <p className="state-line">Fast Money</p>
      {mySlot !== 0 && fm.stage === "SETUP" && <div className="banner banner--gold">You're playing Fast Money — player {mySlot}!</div>}
      {mySlot !== 0 && fm.stage === "P2_ANSWERING" && answeringSlot === 0 && mySlot === 2 && <div className="banner banner--gold">Get ready — you're up next.</div>}
      {answeringSlot !== 0 && (
        <div className="fm__stage">
          <div className="fm__bigclock">{seconds}</div>
          <p className="muted">{names[answeringSlot - 1]} is answering…</p>
        </div>
      )}
      {(fm.stage === "REVEAL" || fm.stage === "DONE" || (fm.stage === "SETUP" && fm.playerIds.length === 2)) && (
        <FastMoneyBoard fastMoney={fm} questionCount={game.config.fastMoneyQuestionCount} target={game.config.fastMoneyTarget} justRevealed={justRevealed} playerNames={names} />
      )}
    </>
  );
}
