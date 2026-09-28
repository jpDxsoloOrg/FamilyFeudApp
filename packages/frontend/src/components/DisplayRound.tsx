// Task 3.7 — big-screen round view.
import { contestantsOf, otherTeam, playerName, ROUND_STATE_LABEL, teamName } from "../lib/gameHelpers";
import type { ApiGame, PublicRound } from "../lib/types";
import { Podium } from "./Podium";
import { Scoreboard } from "./Scoreboard";
import { Strikes } from "./Strikes";
import { SurveyBoard } from "./SurveyBoard";

interface Props {
  game: ApiGame;
  round: PublicRound;
  lastEventKey: number | null;
  lastEventName: string | undefined;
  /** Index revealed by the last event, if any. */
  justRevealed: number | null;
}

export function DisplayRound({ game, round, lastEventKey, lastEventName, justRevealed }: Props) {
  const state = round.state;
  const controlTeamId = state === "STEAL" ? otherTeam(game, round.playingTeamId)?.id : round.playingTeamId;
  const faceOff = state === "PICK_CONTESTANTS" || state === "FACE_OFF_ARMED" || state === "FACE_OFF_ANSWERING";

  return (
    <>
      <p className="state-line">
        Round {round.number}
        {round.multiplier > 1 ? ` · ×${round.multiplier} points` : ""} · {ROUND_STATE_LABEL[state]}
      </p>
      <Scoreboard teams={game.teams} pot={round.pot} multiplier={round.multiplier} activeTeamId={controlTeamId} />

      {faceOff && (
        <Podium contestants={contestantsOf(game, round)} buzzWinnerPlayerId={round.buzzWinnerPlayerId} armed={state === "FACE_OFF_ARMED"} />
      )}

      {round.questionText ? (
        <p className="question">{round.questionText}</p>
      ) : (
        <p className="question question--hidden">Contestants, to the podium…</p>
      )}

      {state === "FACE_OFF_ANSWERING" && round.buzzWinnerPlayerId && (
        <div className="banner banner--gold">{playerName(game, round.buzzWinnerPlayerId)} buzzed in!</div>
      )}
      {state === "PASS_OR_PLAY" && <div className="banner banner--gold">{teamName(game, round.faceOffWinnerTeamId)}: pass or play?</div>}
      {state === "PLAYING" && (
        <p className="guesser">
          {teamName(game, round.playingTeamId)} — <strong>{playerName(game, round.currentGuesserPlayerId)}</strong>, you're up!
        </p>
      )}
      {state === "STEAL" && <div className="banner banner--red banner--pulse">{teamName(game, controlTeamId)} — STEAL!</div>}
      {(state === "REVEAL_REMAINING" || state === "ENDED") && round.awardedToTeamId && (
        <div className="banner banner--gold">
          {round.pot} points to {teamName(game, round.awardedToTeamId)}!
        </div>
      )}

      {(state === "PLAYING" || state === "STEAL" || state === "FACE_OFF_ANSWERING") && (
        <Strikes count={round.strikes} max={game.config.strikesToSteal} flashKey={lastEventName === "STRIKE" ? lastEventKey : null} />
      )}

      <SurveyBoard board={round.board} justRevealed={justRevealed} />
    </>
  );
}
