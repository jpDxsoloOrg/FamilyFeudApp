// Task 2.9 — big-screen lobby. Round / Fast Money boards come in 3.7 / 4.8.
import { useParams } from "react-router-dom";
import { DisplayRound } from "../components/DisplayRound";
import { MuteToggle } from "../components/MuteToggle";
import { RealtimeBadge } from "../components/RealtimeBadge";
import { useGame } from "../hooks/useGame";
import { useJustRevealed } from "../hooks/useJustRevealed";
import { useSounds } from "../hooks/useSounds";
import type { ApiGame } from "../lib/types";

function LobbyDisplay({ game }: { game: ApiGame }) {
  return (
    <>
      <section className="display__code">
        <p className="label">Join at {window.location.host} with code</p>
        <div className="display__code-value">{game.joinCode}</div>
        <p className="muted">{game.players.length === 0 ? "Waiting for players…" : `${game.players.length} in the lobby`}</p>
      </section>
      <section className="chips" style={{ justifyContent: "center" }}>
        {game.players.map((player) => (
          <span key={player.id} className="chip">
            {player.displayName}
          </span>
        ))}
      </section>
    </>
  );
}

function TeamsDisplay({ game }: { game: ApiGame }) {
  const unassigned = game.players.filter((player) => player.teamId === null && player.active);
  return (
    <>
      <section className="display__teams">
        {game.teams.map((team) => (
          <div className="card" key={team.id}>
            <h2 className="display__team-name">{team.name}</h2>
            <div className="display__team-score">{team.score}</div>
            <ol className="display__roster">
              {team.players
                .filter((player) => player.active)
                .map((player) => (
                  <li key={player.id}>{player.displayName}</li>
                ))}
            </ol>
          </div>
        ))}
      </section>
      {unassigned.length > 0 && (
        <p className="muted" style={{ textAlign: "center", marginTop: 16 }}>
          Waiting for a team: {unassigned.map((player) => player.displayName).join(", ")}
        </p>
      )}
      <p className="muted small" style={{ textAlign: "center" }}>
        Join code {game.joinCode}
      </p>
    </>
  );
}

export function Display() {
  const { gameId } = useParams<{ gameId: string }>();
  const { game, realtime, loading, error, lastEvent } = useGame(gameId);
  const { muted, toggleMuted } = useSounds(lastEvent);
  const justRevealed = useJustRevealed(game?.currentRound);

  if (!game) {
    return (
      <main className="page">
        <h1>Family Feud</h1>
        <p className="muted">{loading ? "Loading…" : (error?.message ?? "That game could not be found.")}</p>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="page__header">
        <h1>Family Feud</h1>
        <nav className="page__nav">
          <MuteToggle muted={muted} onToggle={toggleMuted} />
          <RealtimeBadge status={realtime} />
        </nav>
      </header>
      {game.status === "LOBBY" && <LobbyDisplay game={game} />}
      {game.status === "TEAMS_SET" && <TeamsDisplay game={game} />}
      {game.status === "ROUND_ACTIVE" && game.currentRound && (
        <DisplayRound
          game={game}
          round={game.currentRound}
          lastEventKey={lastEvent?.serverTime ?? null}
          lastEventName={lastEvent?.event}
          justRevealed={justRevealed}
        />
      )}
      {game.status === "ROUND_ACTIVE" && !game.currentRound && <TeamsDisplay game={game} />}
      {(game.status === "FAST_MONEY" || game.status === "FINISHED") && (
        <section className="card">
          <h2>Fast Money</h2>
          <p className="muted">Arrives in Milestone 4.</p>
        </section>
      )}
    </main>
  );
}
