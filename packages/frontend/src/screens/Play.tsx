// Task 2.9 — player lobby view. Round / Fast Money controls come in 3.8 / 4.7.
import { Link, useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { MuteToggle } from "../components/MuteToggle";
import { PlayFastMoney } from "../components/PlayFastMoney";
import { DisplayFastMoney } from "../components/DisplayFastMoney";
import { DisplayRound } from "../components/DisplayRound";
import { PlayRound } from "../components/PlayRound";
import { RealtimeBadge } from "../components/RealtimeBadge";
import { useGame } from "../hooks/useGame";
import { useJustRevealed } from "../hooks/useJustRevealed";
import { useJustRevealedFastMoney } from "../hooks/useJustRevealedFastMoney";
import { LobbyDisplay, TeamsDisplay } from "./Display";
import { usePlayerMessages } from "../hooks/usePlayerMessages";
import { useSounds } from "../hooks/useSounds";
import { buzz, joinGame, toApiError } from "../lib/api";
import { getDisplayName, getLastGame, getPlayerId, setLastGame } from "../lib/identity";
import type { ApiGame } from "../lib/types";

function PlayerLobby({ game, me }: { game: ApiGame; me: string }) {
  const self = game.players.find((player) => player.id === me);
  const myTeam = game.teams.find((team) => team.players.some((player) => player.id === me));
  const teamsSet = game.teams.length > 0;

  if (!self) {
    return (
      <p className="notice">
        You're not in this game on this device. <Link to={`/?code=${game.joinCode}`}>Join with the code {game.joinCode}</Link>.
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
  const { game, realtime, loading, error, lastEvent, clockOffset, applyUpdate } = useGame(gameId);
  const me = getPlayerId();
  const { last: lastMessage } = usePlayerMessages(gameId, me);
  const { muted, toggleMuted } = useSounds(lastEvent);
  const justRevealed = useJustRevealed(game?.currentRound);
  const justRevealedFm = useJustRevealedFastMoney(game?.fastMoney);
  const [buzzing, setBuzzing] = useState(false);
  const [problem, setProblem] = useState<string>();
  const rejoinTried = useRef(false);

  /**
   * Resume: if this browser joined this game before (or has a name on file),
   * re-run the idempotent join so a cleared server seat or a fresh tab lands
   * back on the same player id without a trip through the join form.
   */
  useEffect(() => {
    if (!game || !gameId || rejoinTried.current) return;
    if (game.players.some((player) => player.id === me)) return;
    if (game.status === "FINISHED") return;
    const name = getLastGame()?.gameId === gameId ? getLastGame()?.displayName : getDisplayName();
    if (!name) return;
    rejoinTried.current = true;
    joinGame(game.joinCode, me, name)
      .then((update) => {
        setLastGame({ gameId, joinCode: game.joinCode, displayName: name });
        applyUpdate(update);
      })
      .catch((cause: unknown) => setProblem(toApiError(cause).message));
  }, [game, gameId, me, applyUpdate]);

  async function onBuzz(): Promise<void> {
    if (!gameId) return;
    setBuzzing(true);
    try {
      applyUpdate(await buzz(gameId, me));
    } catch (cause) {
      setProblem(toApiError(cause).message);
    } finally {
      setBuzzing(false);
    }
  }

  if (!game) {
    return (
      <main className="page page--narrow">
        <h1>Family Feud</h1>
        <p className="muted">{loading ? "Loading…" : (error?.message ?? "That game could not be found.")}</p>
      </main>
    );
  }

  const isMember = game.players.some((player) => player.id === me);
  const canRejoin = Boolean(getLastGame()?.gameId === gameId ? getLastGame()?.displayName : getDisplayName());

  // Spectator: not on the roster and nothing to rejoin with. Show the same
  // board the display shows, read-only, with a way in.
  if (!isMember && !canRejoin) {
    return (
      <main className="page page--narrow">
        <header className="page__header">
          <h1>Family Feud</h1>
          <nav className="page__nav">
            <MuteToggle muted={muted} onToggle={toggleMuted} />
            <RealtimeBadge status={realtime} />
          </nav>
        </header>
        <p className="notice">
          You're watching. {game.status !== "FINISHED" && <Link to={`/?code=${game.joinCode}`}>Join with code {game.joinCode}</Link>}
        </p>
        {game.status === "LOBBY" && <LobbyDisplay game={game} />}
        {game.status === "TEAMS_SET" && <TeamsDisplay game={game} />}
        {game.status === "ROUND_ACTIVE" && game.currentRound && (
          <DisplayRound game={game} round={game.currentRound} lastEventKey={lastEvent?.serverTime ?? null} lastEventName={lastEvent?.event} justRevealed={justRevealed} />
        )}
        {(game.status === "FAST_MONEY" || game.status === "FINISHED") && <DisplayFastMoney game={game} clockOffset={clockOffset} justRevealed={justRevealedFm} />}
      </main>
    );
  }

  return (
    <main className="page page--narrow">
      <header className="page__header">
        <h1>Family Feud</h1>
        <nav className="page__nav">
          <MuteToggle muted={muted} onToggle={toggleMuted} />
          <RealtimeBadge status={realtime} />
        </nav>
      </header>
      {problem && <p className="field-error">{problem}</p>}
      {(game.status === "LOBBY" || game.status === "TEAMS_SET") && <PlayerLobby game={game} me={me} />}
      {game.status === "ROUND_ACTIVE" && game.currentRound && (
        <PlayRound
          game={game}
          round={game.currentRound}
          me={me}
          lastEventKey={lastEvent?.serverTime ?? null}
          lastEventName={lastEvent?.event}
          justRevealed={justRevealed}
          lastMessage={lastMessage}
          buzzing={buzzing}
          onBuzz={onBuzz}
        />
      )}
      {game.status === "ROUND_ACTIVE" && !game.currentRound && <PlayerLobby game={game} me={me} />}
      {(game.status === "FAST_MONEY" || game.status === "FINISHED") && gameId && (
        <PlayFastMoney
          gameId={gameId}
          game={game}
          me={me}
          clockOffset={clockOffset}
          lastEvent={lastEvent}
          lastMessage={lastMessage}
          justRevealed={justRevealedFm}
        />
      )}
    </main>
  );
}
