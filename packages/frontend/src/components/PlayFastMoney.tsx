// Player Fast Money: who sees the question, who looks away, who watches. FINISHED goes to the Finale in Play.
import { useCallback, useEffect, useState } from "react";
import { useCountdown } from "../hooks/useCountdown";
import { fetchFastMoneyView, skipFastMoneyQuestion, submitFastMoneyAnswer, toApiError } from "../lib/api";
import { buzzPhone } from "../lib/haptics";
import { playerName } from "../lib/gameHelpers";
import { play } from "../lib/sounds";
import type { ApiFastMoneyPrompt, ApiFastMoneyView, ApiGame, ApiGameUpdate, ApiPlayerMessage } from "../lib/types";
import { FastMoneyBoard } from "./FastMoneyBoard";
import { FmTurn } from "./play/FmTurn";
import { LookAway } from "./play/LookAway";
import { ClockRing } from "./show/ClockRing";

interface Props {
  gameId: string;
  game: ApiGame;
  me: string;
  clockOffset: number;
  lastEvent: ApiGameUpdate | undefined;
  lastMessage: ApiPlayerMessage | undefined;
  justRevealed: { slot: number; questionIndex: number } | null;
  onToast: (text: string) => void;
}

export function PlayFastMoney({ gameId, game, me, clockOffset, lastEvent, lastMessage, justRevealed, onToast }: Props) {
  const fm = game.fastMoney;
  const [view, setView] = useState<ApiFastMoneyView | undefined>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [stale, setStale] = useState(false);
  const [duplicate, setDuplicate] = useState<{ questionIndex: number; tick: number } | null>(null);
  const seconds = useCountdown(view?.timerEndsAt ?? fm?.timerEndsAt, clockOffset);

  const refresh = useCallback(() => {
    fetchFastMoneyView(gameId, me)
      .then((next) => {
        setStale(false);
        if (next) setView(next);
      })
      .catch(() => setStale(true));
  }, [gameId, me]);

  // Turn boundaries and a duplicate buzz are the moments the queue changes under us.
  useEffect(() => {
    refresh();
  }, [refresh, lastEvent?.serverTime]);

  useEffect(() => {
    if (lastMessage?.type !== "FAST_MONEY_DUPLICATE") return;
    onToast("Duplicate answer — give a different one!");
    play("nope");
    buzzPhone([30, 30, 30]);
    setDuplicate({ questionIndex: Number(lastMessage.detail), tick: lastMessage.serverTime });
    refresh();
  }, [lastMessage, refresh, onToast]);

  if (!fm) return <p className="sx-waiting">Fast Money is being set up…</p>;

  const mySlot = fm.playerIds.indexOf(me) + 1; // 0 = not a Fast Money player
  const names: [string, string] = [playerName(game, fm.playerIds[0]), playerName(game, fm.playerIds[1])];
  const answeringSlot = fm.timerEndsAt !== null ? (fm.stage === "P1_ANSWERING" ? 1 : fm.stage === "P2_ANSWERING" ? 2 : 0) : 0;
  const myTurn = mySlot !== 0 && mySlot === answeringSlot;
  const staleStrip = stale && (
    <p className="sx-strip sx-strip--ember">
      <span>Reconnecting to your questions</span>
      <button className="button button--small button--ghost" type="button" onClick={refresh}>
        Retry
      </button>
    </p>
  );

  async function act(fn: () => Promise<ApiFastMoneyView>): Promise<boolean> {
    setBusy(true);
    setProblem(undefined);
    try {
      setView(await fn());
      return true;
    } catch (cause) {
      setProblem(toApiError(cause).message);
      refresh();
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (myTurn) {
    return (
      <>
        {staleStrip}
        <FmTurn
          view={view}
          fallbackTotal={fm.rows.length / 2}
          seconds={seconds}
          timerKey={fm.timerEndsAt}
          busy={busy}
          duplicate={duplicate}
          problem={problem}
          onSubmit={(prompt: ApiFastMoneyPrompt, answer: string) => act(() => submitFastMoneyAnswer(gameId, me, prompt.questionIndex, answer))}
          onSkip={(prompt: ApiFastMoneyPrompt) => void act(() => skipFastMoneyQuestion(gameId, me, prompt.questionIndex))}
        />
      </>
    );
  }

  if (mySlot !== 0 && answeringSlot !== 0) {
    return <LookAway name={names[answeringSlot - 1]} done={mySlot < answeringSlot} seconds={seconds} timerKey={fm.timerEndsAt} />;
  }

  return (
    <div className="sx-fmdefault">
      {staleStrip}
      {answeringSlot !== 0 && (
        <div className="sx-fmwatch">
          <ClockRing seconds={seconds} timerKey={fm.timerEndsAt} size="l" />
          <p>{names[answeringSlot - 1]} is answering…</p>
        </div>
      )}
      {(fm.stage === "REVEAL" || fm.stage === "DONE" || (fm.stage === "SETUP" && fm.playerIds.length === 2)) && (
        <FastMoneyBoard fastMoney={fm} questionCount={game.config.fastMoneyQuestionCount} target={game.config.fastMoneyTarget} justRevealed={justRevealed} playerNames={names} />
      )}
    </div>
  );
}
