/**
 * The next round's survey. The whole lineup is drawn from the question bank
 * when round 1 starts (random, no repeats, plus any pins from Setup), so the
 * host no longer picks; the press lives in the dock.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { ApiGame, ApiLineup, Survey } from "../../lib/types";

export interface SurveyChoice {
  unused: Survey[];
  /** The next lineup survey; undefined before round 1 draws the lineup. */
  selected: Survey | undefined;
  /** Surveys still missing from the bank before round 1 can start (0 once drawn). */
  short: number;
}

export function useSurveyChoice(surveys: Survey[], lineup: ApiLineup | undefined, game: ApiGame): SurveyChoice {
  const nextNumber = (game.currentRound?.number ?? 0) + 1;
  const drawn = lineup?.surveys ?? null;
  const roundCount = game.config.roundCount;
  return useMemo(() => {
    const unused = surveys.filter((survey) => !survey.used);
    const selected = drawn ? surveys.find((survey) => survey.number === drawn[nextNumber - 1]) : undefined;
    const short = drawn ? 0 : Math.max(0, roundCount - unused.length);
    return { unused, selected, short };
  }, [surveys, drawn, nextNumber, roundCount]);
}

interface Props {
  gameId: string;
  game: ApiGame;
  surveys: SurveyChoice;
  loaded: boolean;
}

export function NextRoundPanel({ gameId, game, surveys, loaded }: Props) {
  const { selected, short } = surveys;
  const nextNumber = (game.currentRound?.number ?? 0) + 1;
  if (nextNumber > game.config.roundCount) return null;
  const multiplier = game.config.roundMultipliers[nextNumber - 1] ?? 1;

  return (
    <section className="hx-card">
      <h2 className="hx-title">
        Start round {nextNumber} of {game.config.roundCount}
        {multiplier > 1 && <span className="hx-tag">×{multiplier}</span>}
      </h2>
      {loaded && short > 0 ? (
        <p className="hx-note">
          The survey bank needs {short} more question{short === 1 ? "" : "s"} for {game.config.roundCount} rounds.{" "}
          <Link to={`/host/${gameId}/setup`}>Add them in Setup</Link>.
        </p>
      ) : selected ? (
        <div className="form">
          <span className="hx-eyebrow">Next survey</span>
          <p>{selected.text}</p>
          <p className="hx-note">{selected.answers.map((answer) => `${answer.text} (${answer.points})`).join(" · ")}</p>
        </div>
      ) : (
        <p className="hx-note">
          Starting round 1 draws the whole lineup from the question bank: random questions with no repeats, plus any you
          pinned in <Link to={`/host/${gameId}/setup`}>Setup</Link>.
        </p>
      )}
    </section>
  );
}
