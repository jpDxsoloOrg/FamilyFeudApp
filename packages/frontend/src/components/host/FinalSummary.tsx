import { Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { playerName } from "../../lib/gameHelpers";
import type { ApiGame, FastMoneyQuestion } from "../../lib/types";
import { FastMoneyBoard } from "../FastMoneyBoard";

interface Props {
  gameId: string;
  game: ApiGame;
  questions: FastMoneyQuestion[];
}

export function FinalSummary({ gameId, game, questions }: Props) {
  const fm = game.fastMoney;
  if (!fm) return null;
  const [left, right] = game.teams;
  const tied = left && right && left.score === right.score;
  const winner = [...game.teams].sort((a, b) => b.score - a.score)[0];
  const target = game.config.fastMoneyTarget;
  const names: [string, string] = [playerName(game, fm.playerIds[0]), playerName(game, fm.playerIds[1])];

  return (
    <div className="hx-final">
      <section className="hx-card hx-final__head">
        <Trophy size={32} aria-hidden="true" />
        <h2 className="hx-final__winner">{tied ? "It's a tie" : `${winner?.name ?? "—"} wins`}</h2>
        <div className="hx-final__scores">
          {game.teams.map((team, index) => (
            <div key={team.id} className={`hx-final__score hx-edge--${index === 0 ? "a" : "b"}`}>
              <span>{team.name}</span>
              <strong>{team.score}</strong>
            </div>
          ))}
        </div>
        <p className="hx-note">
          Fast Money: {fm.total} of {target}
          {fm.total >= target ? ", target beaten" : ", target missed"}
        </p>
      </section>
      <FastMoneyBoard fastMoney={fm} questionCount={game.config.fastMoneyQuestionCount} target={target} questions={questions} playerNames={names} />
      <div className="button-row">
        <Link className="button" to={`/host/${gameId}/setup`}>
          Setup
        </Link>
        <Link className="button" to="/">
          Back to start
        </Link>
      </div>
    </div>
  );
}
