// Task 3.8 — player round view: same board, BUZZ button, "You're up!", team roster.
import { useEffect, useState } from "react";
import { otherTeam, playerName, ROUND_STATE_LABEL, teamName, teamOfPlayer } from "../lib/gameHelpers";
import type { ApiGame, ApiPlayerMessage, PublicRound } from "../lib/types";
import { Scoreboard } from "./Scoreboard";
import { Strikes } from "./Strikes";
import { SurveyBoard } from "./SurveyBoard";

interface Props {
  game: ApiGame;
  round: PublicRound;
  me: string;
  lastEventKey: number | null;
  lastEventName: string | undefined;
  justRevealed: number | null;
  lastMessage: ApiPlayerMessage | undefined;
  buzzing: boolean;
  onBuzz: () => void;
}

const TOAST_MS = 2500;

export function PlayRound({ game, round, me, lastEventKey, lastEventName, justRevealed, lastMessage, buzzing, onBuzz }: Props) {
  const state = round.state;
  const myTeam = teamOfPlayer(game, me);
  const isContestant = round.contestantPlayerIds.includes(me);
  const controlTeamId = state === "STEAL" ? otherTeam(game, round.playingTeamId)?.id : round.playingTeamId;
  const isUp = state === "PLAYING" && round.currentGuesserPlayerId === me;
  const [toast, setToast] = useState<string>();

  // Private messages become short toasts; the board itself follows the broadcast.
  useEffect(() => {
    if (!lastMessage) return;
    let text: string | undefined;
    if (lastMessage.type === "BUZZ_RESULT") text = lastMessage.detail === "WON" ? "You buzzed first!" : "Too slow — the other side buzzed first.";
    if (lastMessage.type === "REMOVED") text = "The host has removed you from the rotation.";
    if (!text) return;
    setToast(text);
    const timer = window.setTimeout(() => setToast(undefined), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [lastMessage]);

  if (isContestant && state === "FACE_OFF_ARMED") {
    return (
      <div className="buzz-wrap">
        <p className="question">{round.questionText}</p>
        <button className="buzz" type="button" disabled={buzzing} onClick={onBuzz}>
          BUZZ
        </button>
        <p className="muted">Tap as soon as you know it!</p>
      </div>
    );
  }

  return (
    <>
      {toast && <div className="toast">{toast}</div>}
      <p className="state-line">
        Round {round.number} · {ROUND_STATE_LABEL[state]}
      </p>
      <Scoreboard teams={game.teams} pot={round.pot} multiplier={round.multiplier} activeTeamId={controlTeamId} compact />

      {isUp && <div className="banner banner--gold banner--pulse">You're up! Give your answer.</div>}
      {isContestant && state === "PICK_CONTESTANTS" && <div className="banner banner--blue">You're in the face-off — head to the podium.</div>}
      {isContestant && state === "FACE_OFF_ANSWERING" && round.buzzWinnerPlayerId === me && (
        <div className="banner banner--gold">You buzzed first — answer!</div>
      )}
      {state === "STEAL" && myTeam?.id === controlTeamId && <div className="banner banner--red">Your team can steal — confer!</div>}
      {(state === "REVEAL_REMAINING" || state === "ENDED") && round.awardedToTeamId && (
        <div className="banner banner--blue">
          {round.pot} points to {teamName(game, round.awardedToTeamId)}
        </div>
      )}

      {round.questionText ? <p className="question">{round.questionText}</p> : <p className="question question--hidden">Waiting for the question…</p>}

      {(state === "PLAYING" || state === "STEAL" || state === "FACE_OFF_ANSWERING") && (
        <Strikes count={round.strikes} max={game.config.strikesToSteal} flashKey={lastEventName === "STRIKE" ? lastEventKey : null} />
      )}

      <SurveyBoard board={round.board} justRevealed={justRevealed} />

      {state === "PLAYING" && !isUp && (
        <p className="guesser muted">
          Up now: <strong>{playerName(game, round.currentGuesserPlayerId)}</strong>
        </p>
      )}

      {myTeam && (
        <section>
          <h3>{myTeam.name}</h3>
          <ol className="roster">
            {myTeam.players
              .filter((player) => player.active)
              .map((player, index) => {
                const up = state === "PLAYING" && round.currentGuesserPlayerId === player.id;
                return (
                  <li key={player.id} className={`roster__item${player.id === me ? " roster__item--me" : ""}${up ? " roster__item--up" : ""}`}>
                    <span className="roster__order">{index + 1}</span>
                    <span className="roster__name">
                      {player.displayName}
                      {player.id === me && " (you)"}
                    </span>
                  </li>
                );
              })}
          </ol>
        </section>
      )}
    </>
  );
}
