/** Everything before round 1: get people in, set teams, check the room is ready. */
import { Check, Circle, ExternalLink, Shuffle } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { displaySoundNote, type DisplaySound } from "../../hooks/useDisplaySound";
import type { DisplayWindow } from "../../hooks/useDisplayWindow";
import type { ApiGame } from "../../lib/types";
import { JoinQr } from "../JoinQr";
import { ActionButton } from "./ActionButton";
import { NextRoundPanel, type SurveyChoice } from "./NextRoundPanel";
import { PlayersPanel, type PlayerActions } from "./PlayersPanel";

interface Props extends PlayerActions {
  gameId: string;
  game: ApiGame;
  busy: boolean;
  surveysReady: number | undefined;
  surveys: SurveyChoice;
  display: DisplayWindow;
  displaySound: DisplaySound;
  onRandomize: () => void;
  onAddTestPlayers: (count: number) => void;
}

function Flight({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <li className="hx-flight" data-done={done ? "" : undefined}>
      {done ? <Check size={16} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}
      {children}
    </li>
  );
}

export function HostLobby({ gameId, game, busy, surveysReady, surveys, display, displaySound, onRandomize, onAddTestPlayers, ...playerActions }: Props) {
  const teamsSet = game.teams.length > 0;
  const active = game.players.filter((player) => player.active);
  const [testCount, setTestCount] = useState("4");
  const testCountNumber = Math.min(20, Math.max(1, Number.parseInt(testCount, 10) || 0));
  const roundCount = game.config.roundCount;

  return (
    <div className="hx-lobby">
      <section className="hx-card hx-join">
        <div>
          <p className="hx-eyebrow">Join code</p>
          <div className="hx-join__code">{game.joinCode}</div>
          <p className="hx-note">
            {game.players.length} joined · {active.length} active
            {surveysReady !== undefined && ` · ${surveysReady}/${roundCount} surveys written`}
          </p>
        </div>
        <JoinQr joinCode={game.joinCode} size={132} />
      </section>

      <ul className="hx-flights" aria-label="Before you start">
        <Flight done={displaySound === "on"}>
          <span title={displaySoundNote(displaySound)}>{displaySound === "on" ? "Display sound on" : displaySound === "off" ? "Click the display for sound" : "Display opened"}</span>
          <button className="hx-mini" type="button" onClick={display.open}>
            <ExternalLink size={14} aria-hidden="true" /> Open
          </button>
        </Flight>
        <Flight done={active.length >= 2}>Players in</Flight>
        <Flight done={teamsSet}>Teams set</Flight>
        <Flight done={surveysReady !== undefined && surveysReady >= roundCount}>
          <Link to={`/host/${gameId}/setup`}>
            Surveys {surveysReady ?? "…"}/{roundCount}
          </Link>
        </Flight>
      </ul>

      {game.status === "TEAMS_SET" && <NextRoundPanel gameId={gameId} game={game} surveys={surveys} loaded={surveysReady !== undefined} />}

      {teamsSet && (
        <div className="hx-redraw">
          <ActionButton
            action={{
              id: "redraw",
              label: "Re-draw teams",
              tone: "danger",
              size: "m",
              hold: true,
              icon: Shuffle,
              enabled: active.length >= 2,
              reason: "Need 2 active players",
              title: "Hold to replace these teams and turn orders",
              run: onRandomize,
            }}
          />
        </div>
      )}

      {teamsSet ? (
        <PlayersPanel game={game} mode="lobby" busy={busy} {...playerActions} />
      ) : (
        <section>
          <h2 className="hx-title">Players arriving</h2>
          {game.players.length === 0 ? (
            <p className="hx-note">Nobody has joined yet. Share the code above.</p>
          ) : (
            <div className="hx-arrivals">
              {game.players.map((player) => (
                <span key={player.id} className="hx-arrival">
                  {player.displayName}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      <details className="hx-card hx-tests">
        <summary>Test players</summary>
        <p className="hx-note">
          Add stand-in players to try teams, late joins and turn order from one device. They sit in the roster like real players but never buzz or answer; use Skip in a round to move past them.
        </p>
        <div className="field field--row">
          <input
            className="input input--small input--count"
            type="number"
            min={1}
            max={20}
            inputMode="numeric"
            aria-label="Number of test players"
            value={testCount}
            onChange={(event) => setTestCount(event.target.value)}
            disabled={busy}
          />
          <button className="button button--small" type="button" disabled={busy || testCountNumber < 1} onClick={() => onAddTestPlayers(testCountNumber)}>
            Add {testCountNumber} test {testCountNumber === 1 ? "player" : "players"}
          </button>
        </div>
      </details>
    </div>
  );
}
