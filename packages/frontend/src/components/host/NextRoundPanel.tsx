/** Choosing the next survey. The press lives in the dock, so the choice is lifted to the console. */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ApiGame, Survey } from "../../lib/types";

export interface SurveyChoice {
  unused: Survey[];
  selected: Survey | undefined;
  choose: (surveyNumber: number) => void;
}

export function useSurveyChoice(surveys: Survey[]): SurveyChoice {
  const unused = useMemo(() => surveys.filter((survey) => !survey.used), [surveys]);
  const [choice, setChoice] = useState<number | undefined>(unused[0]?.number);

  useEffect(() => {
    if (!unused.some((survey) => survey.number === choice)) setChoice(unused[0]?.number);
  }, [unused, choice]);

  return { unused, selected: unused.find((survey) => survey.number === choice) ?? unused[0], choose: setChoice };
}

interface Props {
  gameId: string;
  game: ApiGame;
  surveys: SurveyChoice;
  loaded: boolean;
}

export function NextRoundPanel({ gameId, game, surveys, loaded }: Props) {
  const { unused, selected, choose } = surveys;
  const nextNumber = (game.currentRound?.number ?? 0) + 1;
  if (nextNumber > game.config.roundCount) return null;
  const multiplier = game.config.roundMultipliers[nextNumber - 1] ?? 1;

  return (
    <section className="hx-card">
      <h2 className="hx-title">
        Start round {nextNumber} of {game.config.roundCount}
        {multiplier > 1 && <span className="hx-tag">×{multiplier}</span>}
      </h2>
      {loaded && unused.length === 0 ? (
        <p className="hx-note">
          No unused surveys left. <Link to={`/host/${gameId}/setup`}>Write one in Setup</Link>.
        </p>
      ) : (
        <div className="form">
          <label className="field">
            <span className="hx-eyebrow">Survey</span>
            <select className="input input--small" value={selected?.number} onChange={(event) => choose(Number(event.target.value))}>
              {unused.map((survey) => (
                <option key={survey.number} value={survey.number}>
                  #{survey.number} — {survey.text}
                </option>
              ))}
            </select>
          </label>
          {selected && <p className="hx-note">{selected.answers.map((answer) => `${answer.text} (${answer.points})`).join(" · ")}</p>}
        </div>
      )}
    </section>
  );
}
