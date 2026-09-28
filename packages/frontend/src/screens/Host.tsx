// Task 2.9 — host console: lobby & roster management. Round / Fast Money UIs come in 3.6 / 4.6.
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { HostRound } from "../components/HostRound";
import { MuteToggle } from "../components/MuteToggle";
import { RealtimeBadge } from "../components/RealtimeBadge";
import { Roster } from "../components/Roster";
import { TeamRename } from "../components/TeamRename";
import { useHostGame } from "../hooks/useHostGame";
import { useJustRevealed } from "../hooks/useJustRevealed";
import { useSounds } from "../hooks/useSounds";
import {
  armBuzzers,
  assignPlayer,
  choosePassOrPlay,
  endRound,
  randomizeTeams,
  removePlayer,
  reorderPlayer,
  resetBuzzers,
  restorePlayer,
  revealAnswer,
  setFaceOffWinner,
  setTeamName,
  skipContestant,
  skipGuesser,
  startRound,
  strike,
  toApiError,
} from "../lib/api";
import type { ApiGame, ApiGameUpdate } from "../lib/types";

const LOBBY_STATUSES = new Set(["LOBBY", "TEAMS_SET"]);

function displayUrl(gameId: string): string {
  return `${window.location.origin}/display/${gameId}`;
}

export function Host() {
  const { gameId } = useParams<{ gameId: string }>();
  const { game, host, hostToken, isHost, realtime, loading, error, lastEvent, applyUpdate, refreshHost } = useHostGame(gameId);
  const { muted, toggleMuted } = useSounds(lastEvent);
  const justRevealed = useJustRevealed(game?.currentRound);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [copied, setCopied] = useState(false);

  if (!gameId || !isHost || !hostToken) {
    return (
      <main className="page page--narrow">
        <h1>Host Console</h1>
        <p className="field-error">This browser doesn't hold the host token for this game.</p>
        <p>
          <Link to="/">Back to start</Link>
        </p>
      </main>
    );
  }

  if (!game) {
    return (
      <main className="page">
        <h1>Host Console</h1>
        <p className="muted">{loading ? "Loading…" : (error?.message ?? "That game could not be found.")}</p>
      </main>
    );
  }

  const id = gameId;
  const token = hostToken;

  /** Run a host mutation and apply its result immediately (no need to wait for the fan-out). */
  async function run(action: () => Promise<ApiGameUpdate>): Promise<void> {
    setBusy(true);
    setProblem(undefined);
    try {
      applyUpdate(await action());
    } catch (cause) {
      setProblem(toApiError(cause).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyDisplayLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(displayUrl(id));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Insecure context or no permission; the link is visible anyway.
    }
  }

  return (
    <main className="page">
      <header className="page__header">
        <h1>Host Console</h1>
        <nav className="page__nav">
          <Link className="button button--small" to={`/host/${id}/setup`}>
            Setup
          </Link>
          <a className="button button--small" href={displayUrl(id)} target="_blank" rel="noreferrer">
            Open display
          </a>
          <button className="button button--small button--ghost" type="button" onClick={copyDisplayLink}>
            {copied ? "Copied" : "Copy display link"}
          </button>
          <MuteToggle muted={muted} onToggle={toggleMuted} />
          <RealtimeBadge status={realtime} />
        </nav>
      </header>

      {problem && <p className="field-error">{problem}</p>}

      {game.status === "TEAMS_SET" && (
        <HostRound
          gameId={id}
          game={game}
          surveys={host?.surveys ?? []}
          fullBoard={[]}
          busy={busy}
          lastEventKey={null}
          lastEventName={undefined}
          justRevealed={null}
          actions={{
            startRound: (surveyNumber) => run(() => startRound(id, token, surveyNumber)).then(refreshHost),
            skipContestant: () => undefined,
            armBuzzers: () => undefined,
            resetBuzzers: () => undefined,
            revealAnswer: () => undefined,
            strike: () => undefined,
            setFaceOffWinner: () => undefined,
            choosePassOrPlay: () => undefined,
            skipGuesser: () => undefined,
            endRound: () => undefined,
          }}
        />
      )}

      {LOBBY_STATUSES.has(game.status) ? (
        <Lobby
          game={game}
          busy={busy}
          surveysReady={host ? host.surveys.length : undefined}
          onRandomize={() => run(() => randomizeTeams(id, token))}
          onRename={(teamId, name) => run(() => setTeamName(id, token, teamId, name))}
          onAssign={(playerId, teamId) => run(() => assignPlayer(id, token, playerId, teamId))}
          onReorder={(playerId, order) => run(() => reorderPlayer(id, token, playerId, order))}
          onRemove={(playerId) => run(() => removePlayer(id, token, playerId))}
          onRestore={(playerId) => run(() => restorePlayer(id, token, playerId))}
        />
      ) : game.status === "ROUND_ACTIVE" ? (
        <HostRound
          gameId={id}
          game={game}
          surveys={host?.surveys ?? []}
          fullBoard={host?.currentBoard ?? []}
          busy={busy}
          lastEventKey={lastEvent?.serverTime ?? null}
          lastEventName={lastEvent?.event}
          justRevealed={justRevealed}
          actions={{
            startRound: (surveyNumber) => run(() => startRound(id, token, surveyNumber)).then(refreshHost),
            skipContestant: (teamId) => run(() => skipContestant(id, token, teamId)),
            armBuzzers: () => run(() => armBuzzers(id, token)),
            resetBuzzers: () => run(() => resetBuzzers(id, token)),
            revealAnswer: (index) => run(() => revealAnswer(id, token, index)),
            strike: () => run(() => strike(id, token)),
            setFaceOffWinner: (teamId) => run(() => setFaceOffWinner(id, token, teamId)),
            choosePassOrPlay: (playingTeamId) => run(() => choosePassOrPlay(id, token, playingTeamId)),
            skipGuesser: () => run(() => skipGuesser(id, token)),
            endRound: () => run(() => endRound(id, token)),
          }}
        />
      ) : (
        <section className="card">
          <h2>{game.status.replace("_", " ")}</h2>
          <p className="muted">Fast Money controls arrive in Milestone 4.</p>
        </section>
      )}
    </main>
  );
}

interface LobbyProps {
  game: ApiGame;
  busy: boolean;
  surveysReady: number | undefined;
  onRandomize: () => void;
  onRename: (teamId: string, name: string) => Promise<void>;
  onAssign: (playerId: string, teamId: string) => void;
  onReorder: (playerId: string, newOrder: number) => void;
  onRemove: (playerId: string) => void;
  onRestore: (playerId: string) => void;
}

function Lobby({ game, busy, surveysReady, onRandomize, onRename, onAssign, onReorder, onRemove, onRestore }: LobbyProps) {
  const teamsSet = game.teams.length > 0;
  const unassigned = game.players.filter((player) => player.teamId === null);
  const active = game.players.filter((player) => player.active);

  return (
    <>
      <section className="card">
        <div className="page__header">
          <div>
            <span className="label">Join code</span>
            <div className="display__code-value" style={{ fontSize: "clamp(2rem, 8vw, 4rem)" }}>
              {game.joinCode}
            </div>
            <span className="muted small">
              {game.players.length} joined · {active.length} active
              {surveysReady !== undefined && ` · ${surveysReady}/${game.config.roundCount} surveys written`}
            </span>
          </div>
          <div className="button-row">
            <button className="button button--primary" type="button" disabled={busy || active.length < 2} onClick={onRandomize}>
              {teamsSet ? "Re-draw teams" : "Randomize teams"}
            </button>
          </div>
        </div>
        {teamsSet && unassigned.length === 0 && (
          <p className="muted small">Teams are set. Start round 1 below when everyone is ready.</p>
        )}
      </section>

      {!teamsSet && (
        <section>
          <h2>Players arriving</h2>
          {game.players.length === 0 ? (
            <p className="muted">Nobody has joined yet. Share the code above.</p>
          ) : (
            <div className="chips">
              {game.players.map((player) => (
                <span key={player.id} className="chip">
                  {player.displayName}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {teamsSet && unassigned.length > 0 && (
        <section>
          <h2>Unassigned ({unassigned.length})</h2>
          <p className="muted small">Late joiners land here. Assign them to a team; they go to the bottom of that team's order.</p>
          <ul className="roster">
            {unassigned.map((player) => (
              <li key={player.id} className="roster__item">
                <span className="roster__name">{player.displayName}</span>
                <div className="roster__actions">
                  {game.teams.map((team) => (
                    <button
                      key={team.id}
                      className="button button--small"
                      type="button"
                      disabled={busy}
                      onClick={() => onAssign(player.id, team.id)}
                    >
                      → {team.name}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {teamsSet && (
        <section className="grid-2">
          {game.teams.map((team) => (
            <div className="card" key={team.id}>
              <TeamRename name={team.name} busy={busy} onRename={(name) => onRename(team.id, name)} />
              <p className="muted small">Turn order, top to bottom. Drag or use the arrows to reorder.</p>
              <Roster
                team={team}
                otherTeams={game.teams.filter((other) => other.id !== team.id)}
                busy={busy}
                onReorder={onReorder}
                onMove={onAssign}
                onRemove={onRemove}
                onRestore={onRestore}
              />
            </div>
          ))}
        </section>
      )}
    </>
  );
}
