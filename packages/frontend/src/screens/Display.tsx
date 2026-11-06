// The TV. /display and /watch share this, and so does the spectator on a phone.
import { useState, type ReactNode } from "react";
import { useMatch, useParams } from "react-router-dom";
import { DisplayFastMoney } from "../components/DisplayFastMoney";
import { DisplayRound } from "../components/DisplayRound";
import { JoinQr } from "../components/JoinQr";
import { Scoreboard } from "../components/Scoreboard";
import { Finale } from "../components/show/Finale";
import { Wordmark } from "../components/show/Wordmark";
import { SoundPrompt } from "../components/tv/TvControls";
import { TvStage } from "../components/tv/TvStage";
import { useFreshReveals } from "../hooks/useFreshReveals";
import { useGame } from "../hooks/useGame";
import { useJustRevealedFastMoney } from "../hooks/useJustRevealedFastMoney";
import { useNewcomers } from "../hooks/useNewcomers";
import { useSounds, withoutRoomSounds } from "../hooks/useSounds";
import { otherTeam } from "../lib/gameHelpers";
import type { ApiGame, ApiGameUpdate } from "../lib/types";

const MANY_NAMES = 18;
const TWO_COLUMN_ROSTER = 6;

function TvCodeTiles({ code }: { code: string }) {
  return (
    <div className="sx-codetiles sx-bulbs" role="img" aria-label={`Join code ${code.split("").join(" ")}`}>
      {code.split("").map((letter, index) => (
        <span key={index} className="sx-codetiles__tile" aria-hidden="true">
          {letter}
        </span>
      ))}
    </div>
  );
}

export function LobbyDisplay({ game, soundPrompt, openQr }: { game: ApiGame; soundPrompt?: ReactNode; openQr?: boolean }) {
  const [showQr, setShowQr] = useState(Boolean(openQr));
  const isNew = useNewcomers(game.players);
  return (
    <section className="sx-tvlobby">
      <div className="sx-tvlobby__main">
        <Wordmark variant="full" className="sx-tvlobby__mark" />
        <p className="sx-tvlobby__where">Join at {window.location.host} with code</p>
        <TvCodeTiles code={game.joinCode} />
        <p className="sx-tvlobby__count">{game.players.length === 0 ? "Waiting for players…" : `${game.players.length} in the lobby`}</p>
        {soundPrompt}
      </div>
      <div className="sx-tvlobby__scan" data-open={showQr ? "" : undefined}>
        <div className="sx-qrbox">
          <JoinQr joinCode={game.joinCode} size={768} />
        </div>
        <p className="sx-tvlobby__scanText">Scan to join</p>
        <div className="sx-tvlobby__pocket">
          <button className="button button--small button--ghost" type="button" aria-expanded={showQr} onClick={() => setShowQr((open) => !open)}>
            {showQr ? "Hide QR" : "Show QR"}
          </button>
          <a className="button button--small button--ghost" href={`/?code=${game.joinCode}`}>
            Join on this phone
          </a>
        </div>
      </div>
      <div className="chips sx-tvlobby__chips" data-many={game.players.length > MANY_NAMES ? "" : undefined}>
        {game.players.map((player) => (
          <span key={player.id} className="chip" data-new={isNew(player.id) ? "" : undefined}>
            {player.displayName}
          </span>
        ))}
      </div>
    </section>
  );
}

export function TeamsDisplay({ game }: { game: ApiGame }) {
  const unassigned = game.players.filter((player) => player.teamId === null && player.active);
  return (
    <section className="sx-tvteams">
      <div className="sx-tvteams__cards">
        {game.teams.map((team, index) => {
          const roster = team.players.filter((player) => player.active);
          return (
            <div className="sx-tvteam" key={team.id} data-side={index === 0 ? "a" : "b"}>
              <h2 className="sx-tvteam__name">{team.name}</h2>
              <div className="sx-tvteam__score">{team.score}</div>
              <ol className="sx-tvteam__roster" data-columns={roster.length > TWO_COLUMN_ROSTER ? "" : undefined}>
                {roster.map((player) => (
                  <li key={player.id}>{player.displayName}</li>
                ))}
              </ol>
            </div>
          );
        })}
        {game.teams.length === 2 && (
          <span className="sx-tvteams__vs" aria-hidden="true">
            VS
          </span>
        )}
      </div>
      <div className="sx-tvteams__foot">
        <div className="sx-tvteams__text">
          {unassigned.length > 0 && <p>Waiting for a team: {unassigned.map((player) => player.displayName).join(", ")}</p>}
          <p>Late? Join code {game.joinCode}</p>
        </div>
        <div className="sx-qrbox">
          <JoinQr joinCode={game.joinCode} size={384} />
        </div>
      </div>
    </section>
  );
}

interface ShowProps {
  game: ApiGame;
  lastEvent: ApiGameUpdate | undefined;
  clockOffset: number;
  embedded?: boolean;
}

/** What the set is showing. The plates render in one tree position, so last-round scores keep rolling into Fast Money. */
export function TvShow({ game, lastEvent, clockOffset, embedded }: ShowProps) {
  const fresh = useFreshReveals(game.currentRound);
  const justRevealedFm = useJustRevealedFastMoney(game.fastMoney);
  const round = game.status === "ROUND_ACTIVE" ? game.currentRound : null;
  const fastMoney = game.status === "FAST_MONEY";
  const fmSetup = fastMoney && (game.fastMoney === null || game.fastMoney.stage === "SETUP");
  const control = round?.state === "STEAL" ? otherTeam(game, round.playingTeamId)?.id : round?.playingTeamId;
  const framed = window.self !== window.top;
  const view = round ? "round" : fastMoney ? "fm" : game.status === "FINISHED" ? "finale" : game.status === "LOBBY" ? "lobby" : "teams";

  return (
    <div className="sx-tv__show" data-view={view} data-setup={fmSetup ? "" : undefined} data-state={round?.state}>
      {(round || fmSetup) && <Scoreboard teams={game.teams} pot={round?.pot ?? 0} multiplier={round?.multiplier ?? 1} activeTeamId={control} />}
      {view === "lobby" && <LobbyDisplay game={game} openQr={!embedded} soundPrompt={!embedded && !framed ? <SoundPrompt /> : undefined} />}
      {view === "teams" && <TeamsDisplay game={game} />}
      {round && <DisplayRound game={game} round={round} fresh={fresh} />}
      {fastMoney && <DisplayFastMoney game={game} clockOffset={clockOffset} justRevealed={justRevealedFm} />}
      {view === "finale" && <Finale game={game} celebrate={lastEvent?.event === "GAME_FINISHED"} />}
    </div>
  );
}

export function Display() {
  const { gameId } = useParams<{ gameId: string }>();
  const { game, realtime, loading, error, lastEvent, clockOffset } = useGame(gameId);
  // /watch is a follower's phone in the room, so it leaves these to the TV.
  const watching = useMatch("/watch/:gameId") !== null;
  const { muted, toggleMuted } = useSounds(watching ? withoutRoomSounds(lastEvent) : lastEvent);

  return (
    <TvStage game={game} lastEvent={lastEvent} realtime={realtime} muted={muted} onToggleMuted={toggleMuted}>
      {game ? (
        <TvShow game={game} lastEvent={lastEvent} clockOffset={clockOffset} />
      ) : (
        <div className="sx-tvwait">
          <Wordmark variant="full" />
          <p className="sx-waiting">{loading ? "Loading…" : (error?.message ?? "That game could not be found.")}</p>
        </div>
      )}
    </TvStage>
  );
}
