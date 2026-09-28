// Task 4.8 — big-screen Fast Money: board, server-synced countdown, WIN.
import { useCountdown } from "../hooks/useCountdown";
import { playerName, teamName } from "../lib/gameHelpers";
import type { ApiGame } from "../lib/types";
import { FastMoneyBoard } from "./FastMoneyBoard";
import { Scoreboard } from "./Scoreboard";

interface Props {
  game: ApiGame;
  clockOffset: number;
  justRevealed: { slot: number; questionIndex: number } | null;
}

export function DisplayFastMoney({ game, clockOffset, justRevealed }: Props) {
  const fm = game.fastMoney;
  const seconds = useCountdown(fm?.timerEndsAt, clockOffset);
  if (!fm) return null;
  const names: [string, string] = [playerName(game, fm.playerIds[0]), playerName(game, fm.playerIds[1])];
  const answering = fm.stage === "P1_ANSWERING" ? names[0] : fm.stage === "P2_ANSWERING" ? names[1] : null;

  return (
    <>
      <p className="state-line">Fast Money{fm.teamId ? ` · ${teamName(game, fm.teamId)}` : ""}</p>
      {fm.stage === "SETUP" && <Scoreboard teams={game.teams} pot={0} multiplier={1} />}
      {answering && (
        <div className="fm__stage">
          {seconds !== null ? (
            <>
              <div className={`fm__bigclock${seconds <= 5 ? " fm__bigclock--urgent" : ""}`}>{seconds}</div>
              <div className="banner banner--gold">{answering} is answering</div>
            </>
          ) : (
            <div className="banner banner--blue">{answering}, get ready…</div>
          )}
        </div>
      )}
      {(fm.stage === "SETUP" && fm.playerIds.length === 2) || fm.stage === "REVEAL" || fm.stage === "DONE" ? (
        <FastMoneyBoard fastMoney={fm} questionCount={game.config.fastMoneyQuestionCount} target={game.config.fastMoneyTarget} justRevealed={justRevealed} playerNames={names} />
      ) : null}
      {fm.stage === "DONE" && fm.total < game.config.fastMoneyTarget && <div className="banner banner--blue">Final total {fm.total} — thanks for playing!</div>}
    </>
  );
}
