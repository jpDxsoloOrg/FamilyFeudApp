// The player's round: plates, podium, question, board, then their team's ladder. The turn itself lives in the dock.
import { contestantsOf, otherTeam, teamOfPlayer } from "../lib/gameHelpers";
import type { ApiGame, PublicRound } from "../lib/types";
import { Podium } from "./Podium";
import { Scoreboard } from "./Scoreboard";
import { Strikes } from "./Strikes";
import { SurveyBoard } from "./SurveyBoard";

interface Props {
  game: ApiGame;
  round: PublicRound;
  me: string;
  fresh: ReadonlySet<number>;
}

function RosterLadder({ game, round, me }: Pick<Props, "game" | "round" | "me">) {
  const myTeam = teamOfPlayer(game, me);
  if (!myTeam) return null;
  return (
    <ol className="sx-ladder" aria-label={myTeam.name}>
      {myTeam.players
        .filter((player) => player.active)
        .map((player, index) => {
          const up = round.state === "PLAYING" && round.currentGuesserPlayerId === player.id;
          return (
            <li key={player.id} className="sx-ladder__rung" data-me={player.id === me ? "" : undefined} data-up={up ? "" : undefined}>
              <span className="roster__order">{index + 1}</span>
              {player.displayName}
              {player.id === me && " (you)"}
            </li>
          );
        })}
    </ol>
  );
}

export function PlayRound({ game, round, me, fresh }: Props) {
  const state = round.state;
  const controlTeamId = state === "STEAL" ? otherTeam(game, round.playingTeamId)?.id : round.playingTeamId;
  const faceOff = state === "PICK_CONTESTANTS" || state === "FACE_OFF_ARMED" || state === "FACE_OFF_ANSWERING";
  const showStrikes = state === "PLAYING" || state === "STEAL" || state === "FACE_OFF_ANSWERING";

  return (
    <div className="sx-round">
      <Scoreboard
        teams={game.teams}
        pot={round.pot}
        multiplier={round.multiplier}
        activeTeamId={controlTeamId}
        meTeamId={teamOfPlayer(game, me)?.id}
        strikes={showStrikes ? <Strikes count={round.strikes} max={game.config.strikesToSteal} /> : undefined}
      />
      {faceOff && <Podium contestants={contestantsOf(game, round)} buzzWinnerPlayerId={round.buzzWinnerPlayerId} armed={state === "FACE_OFF_ARMED"} />}
      {round.questionText ? <p className="sx-question">{round.questionText}</p> : <p className="sx-question" data-waiting="">Waiting for the question…</p>}
      <SurveyBoard board={round.board} fresh={fresh} />
      <RosterLadder game={game} round={round} me={me} />
    </div>
  );
}
