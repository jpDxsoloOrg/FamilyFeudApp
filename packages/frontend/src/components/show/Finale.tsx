/** Every finished game ends here, with or without Fast Money, on the phone and on the TV. */
import { Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { finalResult, playerName, teamOfPlayer } from "../../lib/gameHelpers";
import type { ApiGame } from "../../lib/types";
import { FastMoneyBoard } from "../FastMoneyBoard";
import { Scoreboard } from "../Scoreboard";
import { Wordmark } from "./Wordmark";

interface Props {
  game: ApiGame;
  /** A player's own phone: adds a personal line and the way out. */
  me?: string;
  /** The game ended while watching. A reload stays still. */
  celebrate: boolean;
}

export function Finale({ game, me, celebrate }: Props) {
  const { tied, winner } = finalResult(game);
  const fm = game.fastMoney;
  const target = game.config.fastMoneyTarget;
  const played = fm !== null && fm.playerIds.length === 2;
  const names: [string, string] = [playerName(game, fm?.playerIds[0]), playerName(game, fm?.playerIds[1])];
  const myTeam = me ? teamOfPlayer(game, me) : undefined;
  const line = !played ? "Thanks for playing!" : fm.total >= target ? `Fast Money: ${fm.total} of ${target}` : `Final total ${fm.total} — thanks for playing!`;

  return (
    <section className="sx-finale" data-celebrate={celebrate ? "" : undefined} data-split={played ? "" : undefined}>
      <div className="sx-finale__head">
        <Wordmark className="sx-finale__mark" />
        <div className="sx-finale__plate sx-bulbs">
          <Trophy className="sx-finale__trophy" aria-hidden="true" />
          <h2 className="sx-finale__winner">{tied ? "It's a tie" : `Winner: ${winner?.name ?? "—"}`}</h2>
        </div>
        {me && <p className="sx-finale__mine">{myTeam && !tied && myTeam.id === winner?.id ? "Your team won!" : "Good game"}</p>}
        <Scoreboard teams={game.teams} pot={0} multiplier={1} activeTeamId={tied ? undefined : winner?.id} meTeamId={myTeam?.id} hidePot />
        {!tied && winner && (
          <ul className="sx-finale__roster">
            {winner.players
              .filter((player) => player.active)
              .map((player) => (
                <li key={player.id} className="chip">
                  {player.displayName}
                </li>
              ))}
          </ul>
        )}
        <p className="sx-finale__line">{line}</p>
        {me && (
          <Link className="button button--ghost" to="/">
            Back to start
          </Link>
        )}
      </div>
      {played && (
        <div className="sx-finale__board">
          <FastMoneyBoard fastMoney={fm} questionCount={game.config.fastMoneyQuestionCount} target={target} playerNames={names} />
        </div>
      )}
    </section>
  );
}
