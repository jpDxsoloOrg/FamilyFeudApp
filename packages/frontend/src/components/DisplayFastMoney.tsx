// Fast Money on the TV. While someone answers there are no rows on screen, only the clock. FINISHED goes to the Finale.
import type { CSSProperties } from "react";
import { useCountdown } from "../hooks/useCountdown";
import { playerName, teamName } from "../lib/gameHelpers";
import type { ApiGame } from "../lib/types";
import { FastMoneyBoard } from "./FastMoneyBoard";
import { ClockRing } from "./show/ClockRing";

interface Props {
  game: ApiGame;
  clockOffset: number;
  justRevealed: { slot: number; questionIndex: number } | null;
}

function TargetMeter({ total, target }: { total: number; target: number }) {
  const scale = Math.max(target * 1.25, total, 1);
  return (
    <div className="sx-meter" style={{ "--fill": Math.min(1, total / scale), "--flag": target / scale } as CSSProperties} aria-hidden="true">
      <span className="sx-meter__fill" />
      <span className="sx-meter__flag">{target}</span>
    </div>
  );
}

export function DisplayFastMoney({ game, clockOffset, justRevealed }: Props) {
  const fm = game.fastMoney;
  const seconds = useCountdown(fm?.timerEndsAt, clockOffset);
  if (!fm) return <p className="sx-waiting">Fast Money is being set up…</p>;
  const names: [string, string] = [playerName(game, fm.playerIds[0]), playerName(game, fm.playerIds[1])];
  const answering = fm.stage === "P1_ANSWERING" ? names[0] : fm.stage === "P2_ANSWERING" ? names[1] : null;
  const target = game.config.fastMoneyTarget;
  const board = (fm.stage === "SETUP" && fm.playerIds.length === 2) || fm.stage === "REVEAL" || fm.stage === "DONE";

  return (
    <>
      <p className="sx-fmline">Fast Money{fm.teamId ? ` · ${teamName(game, fm.teamId)}` : ""}</p>
      {answering && (
        <div className="sx-tvfm" aria-live="polite">
          {seconds !== null ? (
            <>
              <div className="sx-tvfm__clock sx-bulbs">
                <ClockRing seconds={seconds} timerKey={fm.timerEndsAt} size="l" />
              </div>
              <p className="sx-tvfm__who">{seconds === 0 ? "TIME!" : `${answering} is answering`}</p>
            </>
          ) : (
            <p className="sx-tvfm__who">{answering}, get ready…</p>
          )}
        </div>
      )}
      {board && (
        <div className="sx-tvfmboard">
          <FastMoneyBoard fastMoney={fm} questionCount={game.config.fastMoneyQuestionCount} target={target} justRevealed={justRevealed} playerNames={names} />
          {fm.stage !== "SETUP" && <TargetMeter total={fm.total} target={target} />}
        </div>
      )}
      {fm.stage === "DONE" && fm.total < target && <p className="sx-fmline" data-final="">Final total {fm.total} — thanks for playing!</p>}
    </>
  );
}
