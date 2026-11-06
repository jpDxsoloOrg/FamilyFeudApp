import type { ReactNode } from "react";
import { useRollingNumber } from "../hooks/useRollingNumber";
import type { ApiTeam } from "../lib/types";

interface Props {
  teams: ApiTeam[];
  pot: number;
  multiplier: number;
  /** Team currently in control (playing or stealing). */
  activeTeamId?: string | null;
  /** The strike tally, shown in the pot cell. */
  strikes?: ReactNode;
  /** Marks this player's own team. */
  meTeamId?: string;
  hidePot?: boolean;
}

function Plate({ team, side, active, mine }: { team: ApiTeam | undefined; side: "a" | "b"; active: boolean; mine: boolean }) {
  const score = useRollingNumber(team?.score ?? 0);
  if (!team) return <div className="sx-plate" data-side={side} data-empty="" />;
  return (
    <div className="sx-plate" data-side={side} data-active={active ? "" : undefined}>
      <span className="sx-plate__name">
        {team.name}
        {mine && <span className="sx-plate__you">YOU</span>}
      </span>
      <span className="sx-plate__score">{score}</span>
    </div>
  );
}

/** Two team plates with the round pot between them. */
export function Scoreboard({ teams, pot, multiplier, activeTeamId, strikes, meTeamId, hidePot }: Props) {
  const [left, right] = teams;
  const rolledPot = useRollingNumber(pot);
  return (
    <div className="sx-plates" data-pot={hidePot ? undefined : ""}>
      <Plate team={left} side="a" active={left !== undefined && left.id === activeTeamId} mine={left !== undefined && left.id === meTeamId} />
      {!hidePot && (
        <div className="sx-pot">
          <span className="sx-pot__label">Pot{multiplier > 1 ? ` ×${multiplier}` : ""}</span>
          <span className="sx-pot__value">{rolledPot}</span>
          {strikes}
        </div>
      )}
      <Plate team={right} side="b" active={right !== undefined && right.id === activeTeamId} mine={right !== undefined && right.id === meTeamId} />
    </div>
  );
}
