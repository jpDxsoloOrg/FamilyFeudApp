import type { ApiTeam } from "../lib/types";

interface Props {
  teams: ApiTeam[];
  pot: number;
  multiplier: number;
  /** Team currently in control (playing or stealing). */
  activeTeamId?: string | null;
  compact?: boolean;
}

/** Two team scores with the round pot between them. */
export function Scoreboard({ teams, pot, multiplier, activeTeamId, compact }: Props) {
  const [left, right] = teams;
  const team = (t: ApiTeam | undefined) =>
    t ? (
      <div className={`scoreboard__team${t.id === activeTeamId ? " scoreboard__team--active" : ""}`}>
        <span className="scoreboard__name">{t.name}</span>
        <span className="scoreboard__score">{t.score}</span>
      </div>
    ) : (
      <div className="scoreboard__team scoreboard__team--empty" />
    );
  return (
    <div className={`scoreboard${compact ? " scoreboard--compact" : ""}`}>
      {team(left)}
      <div className="scoreboard__pot">
        <span className="scoreboard__potLabel">Pot{multiplier > 1 ? ` ×${multiplier}` : ""}</span>
        <span className="scoreboard__potValue">{pot}</span>
      </div>
      {team(right)}
    </div>
  );
}
