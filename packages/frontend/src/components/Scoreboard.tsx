import type { ApiTeam } from "../lib/types";

interface Props {
  teams: ApiTeam[];
  pot: number;
  multiplier: number;
  /** Team currently in control (playing or stealing). */
  activeTeamId?: string | null;
  compact?: boolean;
}

export function Scoreboard({ teams, pot, multiplier, activeTeamId, compact }: Props) {
  return (
    <div className={`scoreboard${compact ? " scoreboard--compact" : ""}`}>
      {teams.map((team, index) => (
        <div key={team.id} className={`scoreboard__team${team.id === activeTeamId ? " scoreboard__team--active" : ""}`}>
          <span className="scoreboard__name">{team.name}</span>
          <span className="scoreboard__score">{team.score}</span>
          {index === 0 && (
            <div className="scoreboard__pot" key="pot">
              <span className="label">Pot{multiplier > 1 ? ` ×${multiplier}` : ""}</span>
              <span className="scoreboard__potValue">{pot}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
