// Task 3.6 — host console round UI with keyboard shortcuts (1–8 reveal, X strike).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { contestantsOf, otherTeam, playerName, ROUND_STATE_LABEL, teamName } from "../lib/gameHelpers";
import type { ApiGame, BoardAnswer, Survey } from "../lib/types";
import { Podium } from "./Podium";
import { Scoreboard } from "./Scoreboard";
import { Strikes } from "./Strikes";
import { SurveyBoard } from "./SurveyBoard";

export interface HostRoundActions {
  startRound: (surveyNumber: number) => void;
  skipContestant: (teamId: string) => void;
  armBuzzers: () => void;
  resetBuzzers: () => void;
  revealAnswer: (index: number) => void;
  strike: () => void;
  setFaceOffWinner: (teamId: string) => void;
  choosePassOrPlay: (playingTeamId: string) => void;
  skipGuesser: () => void;
  endRound: () => void;
  undo: () => void;
}

interface Props {
  gameId: string;
  game: ApiGame;
  surveys: Survey[];
  /** Full board for the current round (host only); empty until loaded. */
  fullBoard: BoardAnswer[];
  /** The question from the host view, available before buzzers are armed. */
  fullQuestion: string | null;
  busy: boolean;
  lastEventKey: number | null;
  lastEventName: string | undefined;
  justRevealed: number | null;
  actions: HostRoundActions;
}

function StartRoundPanel({ gameId, game, surveys, busy, onStart }: { gameId: string; game: ApiGame; surveys: Survey[]; busy: boolean; onStart: (n: number) => void }) {
  const unused = surveys.filter((survey) => !survey.used);
  const [choice, setChoice] = useState<number | undefined>(unused[0]?.number);
  const nextNumber = (game.currentRound?.number ?? 0) + 1;
  const selected = unused.find((survey) => survey.number === choice) ?? unused[0];

  useEffect(() => {
    if (!unused.some((survey) => survey.number === choice)) setChoice(unused[0]?.number);
  }, [unused, choice]);

  if (nextNumber > game.config.roundCount) {
    return (
      <section className="card">
        <h2>All rounds played</h2>
        <p className="muted">Fast Money controls arrive in Milestone 4.</p>
      </section>
    );
  }
  return (
    <section className="card">
      <h2>
        Start round {nextNumber} of {game.config.roundCount}
        {(game.config.roundMultipliers[nextNumber - 1] ?? 1) > 1 && <span className="tag tag--gold">×{game.config.roundMultipliers[nextNumber - 1]}</span>}
      </h2>
      {unused.length === 0 ? (
        <p className="field-error">
          No unused surveys left. <Link to={`/host/${gameId}/setup`}>Write one in Setup</Link>.
        </p>
      ) : (
        <div className="form">
          <label className="field">
            <span className="label">Survey</span>
            <select className="input input--small" value={selected?.number} onChange={(event) => setChoice(Number(event.target.value))}>
              {unused.map((survey) => (
                <option key={survey.number} value={survey.number}>
                  #{survey.number} — {survey.text}
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <p className="muted small">
              {selected.answers.map((answer) => `${answer.text} (${answer.points})`).join(" · ")}
            </p>
          )}
          <button className="button button--primary" type="button" disabled={busy || !selected} onClick={() => selected && onStart(selected.number)}>
            Start round {nextNumber}
          </button>
        </div>
      )}
    </section>
  );
}

export function HostRound({ gameId, game, surveys, fullBoard, fullQuestion, busy, lastEventKey, lastEventName, justRevealed, actions }: Props) {
  const round = game.currentRound;
  const inPlay = round && round.state !== "ENDED";

  // Keyboard shortcuts: 1–8 reveal, X strike. Ignored while typing in a field.
  useEffect(() => {
    if (!inPlay) return;
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (busy || event.metaKey || event.ctrlKey || event.altKey) return;
      if (/^[1-8]$/.test(event.key)) {
        const index = Number(event.key) - 1;
        const slot = round.board[index];
        if (slot && !slot.revealed && canReveal) {
          event.preventDefault();
          actions.revealAnswer(index);
        }
      } else if (event.key.toLowerCase() === "x" && canStrike) {
        event.preventDefault();
        actions.strike();
      } else if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        actions.undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!round || round.state === "ENDED") {
    return (
      <>
        <Scoreboard teams={game.teams} pot={0} multiplier={1} compact />
        <StartRoundPanel gameId={gameId} game={game} surveys={surveys} busy={busy} onStart={actions.startRound} />
      </>
    );
  }

  const state = round.state;
  const canReveal = state === "FACE_OFF_ANSWERING" || state === "PLAYING" || state === "STEAL" || state === "REVEAL_REMAINING";
  const canStrike = state === "FACE_OFF_ANSWERING" || state === "PLAYING" || state === "STEAL";
  const contestants = contestantsOf(game, round);
  const controlTeamId = state === "STEAL" ? otherTeam(game, round.playingTeamId)?.id : round.playingTeamId;

  return (
    <>
      <p className="state-line">
        Round {round.number}{round.multiplier > 1 ? ` · ×${round.multiplier}` : ""} · {ROUND_STATE_LABEL[state]}
      </p>
      <Scoreboard teams={game.teams} pot={round.pot} multiplier={round.multiplier} activeTeamId={controlTeamId} compact />

      {(() => {
        const question = round.questionText ?? fullQuestion;
        return (
          <>
            <p className="question">{question ?? "Loading question…"}</p>
            {!round.questionText && <p className="muted small" style={{ textAlign: "center" }}>Players and the display see the question once you arm the buzzers.</p>}
          </>
        );
      })()}

      {(state === "PICK_CONTESTANTS" || state === "FACE_OFF_ARMED" || state === "FACE_OFF_ANSWERING") && (
        <Podium
          contestants={contestants}
          buzzWinnerPlayerId={round.buzzWinnerPlayerId}
          armed={state === "FACE_OFF_ARMED"}
          onSkip={state === "PICK_CONTESTANTS" ? actions.skipContestant : undefined}
          disabled={busy}
        />
      )}

      {state === "FACE_OFF_ANSWERING" && round.buzzWinnerPlayerId && (
        <div className="banner banner--gold">{playerName(game, round.buzzWinnerPlayerId)} buzzed in</div>
      )}
      {state === "PLAYING" && (
        <p className="guesser">
          {teamName(game, round.playingTeamId)} — up now: <strong>{playerName(game, round.currentGuesserPlayerId)}</strong>
        </p>
      )}
      {state === "STEAL" && <div className="banner banner--red">{teamName(game, controlTeamId)} can steal — one answer</div>}
      {state === "REVEAL_REMAINING" && (
        <div className="banner banner--blue">
          {round.pot} to {teamName(game, round.awardedToTeamId)} — reveal the rest, then end the round
        </div>
      )}

      <Strikes count={round.strikes} max={game.config.strikesToSteal} flashKey={lastEventName === "STRIKE" ? lastEventKey : null} />

      <SurveyBoard
        board={round.board}
        hiddenText={(index) => fullBoard.find((slot) => slot.index === index)?.text}
        onReveal={canReveal ? actions.revealAnswer : undefined}
        disabled={busy || !canReveal}
        justRevealed={justRevealed}
      />

      <div className="controls">
        {state === "PICK_CONTESTANTS" && (
          <button className="button button--primary" type="button" disabled={busy} onClick={actions.armBuzzers}>
            Arm buzzers &amp; show question
          </button>
        )}
        {(state === "FACE_OFF_ARMED" || state === "FACE_OFF_ANSWERING") && (
          <>
            <button className="button" type="button" disabled={busy} onClick={actions.resetBuzzers}>
              Reset buzzers
            </button>
            {game.teams.map((team) => (
              <button key={team.id} className="button button--primary" type="button" disabled={busy} onClick={() => actions.setFaceOffWinner(team.id)}>
                {team.name} wins face-off
              </button>
            ))}
          </>
        )}
        {state === "PASS_OR_PLAY" && (
          <>
            {game.teams.map((team) => (
              <button key={team.id} className="button button--primary" type="button" disabled={busy} onClick={() => actions.choosePassOrPlay(team.id)}>
                {team.id === round.faceOffWinnerTeamId ? `${team.name} plays` : `Pass to ${team.name}`}
              </button>
            ))}
          </>
        )}
        {canStrike && (
          <button className="button button--danger" type="button" disabled={busy} onClick={actions.strike}>
            Strike <span className="kbd">X</span>
          </button>
        )}
        {state === "PLAYING" && (
          <button className="button" type="button" disabled={busy} onClick={actions.skipGuesser}>
            Skip guesser
          </button>
        )}
        {state === "REVEAL_REMAINING" && (
          <button className="button button--primary" type="button" disabled={busy} onClick={actions.endRound}>
            End round
          </button>
        )}
        <button className="button button--ghost" type="button" disabled={busy} onClick={actions.undo} title="Revert the last host action in this round">
          Undo <span className="kbd">Z</span>
        </button>
      </div>
      {canReveal && <p className="muted small">Tip: press 1–8 to reveal an answer, X for a strike, Z to undo.</p>}
    </>
  );
}
