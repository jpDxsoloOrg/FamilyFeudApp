// Task 2.9 — player lobby view. Round / Fast Money controls come in 3.8 / 4.7.
import { Link, useParams } from "react-router-dom";
import { RealtimeBadge } from "../components/RealtimeBadge";
import { useGame } from "../hooks/useGame";
import { getPlayerId } from "../lib/identity";
import type { ApiGame } from "../lib/types";

function PlayerLobby({ game, me }: { game: ApiGame; me: string }) {
  const self = game.players.find((player) => player.id === me);
  const myTeam = game.teams.find((team) => team.players.some((player) => player.id === me));
  const teamsSet = game.teams.length > 0;

  if (!self) {
    return (
      <p className="notice">
        You're not in this game on this device. <Link to="/">Join with the code {game.joinCode}</Link>.
      </p>
    );
  }

  return (
    <>
      <section className="card">
        <p>
          You're in as <strong>{self.displayName}</strong>
          {!self.active && <span className="tag">removed by host</span>}
        </p>
        {!teamsSet && <p className="muted">Waiting for the host to make teams… {game.players.length} here so far.</p>}
        {teamsSet && !myTeam && <p className="muted">Teams are set — the host will slot you in.</p>}
        {myTeam && (
          <p>
            You're on <strong>{myTeam.name}</strong>
            <span className="tag tag--gold">#{myTeam.players.filter((p) => p.active).findIndex((p) => p.id === me) + 1} in the order</span>
          </p>
        )}
      </section>

      {!teamsSet && (
        <section className="chips">
          {game.players.map((player) => (
            <span key={player.id} className="chip">
              {player.displayName}
            </span>
          ))}
        </section>
      )}

      {teamsSet && (
        <section className="grid-2">
          {game.teams.map((team) => (
            <div className="card" key={team.id}>
              <h3>{team.name}</h3>
              <ol className="roster">
                {team.players
                  .filter((player) => player.active)
                  .map((player, index) => (
                    <li key={player.id} className={`roster__item${player.id === me ? " roster__item--me" : ""}`}>
                      <span className="roster__order">{index + 1}</span>
                      <span className="roster__name">{player.displayName}</span>
                    </li>
                  ))}
              </ol>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

export function Play() {
  const { gameId } = useParams<{ gameId: string }>();
  const { game, realtime, loading, error } = useGame(gameId);
  const me = getPlayerId();

  if (!game) {
    return (
      <main className="page page--narrow">
        <h1>Family Feud</h1>
        <p className="muted">{loading ? "Loading…" : (error?.message ?? "That game could not be found.")}</p>
      </main>
    );
  }

  return (
    <main className="page page--narrow">
      <header className="page__header">
        <h1>Family Feud</h1>
        <RealtimeBadge status={realtime} />
      </header>
      {game.status === "LOBBY" || game.status === "TEAMS_SET" ? (
        <PlayerLobby game={game} me={me} />
      ) : (
        <section className="card">
          <h2>{game.status.replace("_", " ")}</h2>
          <p className="muted">The board and buzzer arrive in Milestone 3.</p>
        </section>
      )}
    </main>
  );
}
