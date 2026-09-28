import type { Contestant } from "../lib/gameHelpers";

interface Props {
  contestants: Contestant[];
  buzzWinnerPlayerId: string | null;
  armed: boolean;
  /** Host console: skip a team's contestant. */
  onSkip?: (teamId: string) => void;
  disabled?: boolean;
}

/** The two face-off contestants, lit up when one wins the buzz. */
export function Podium({ contestants, buzzWinnerPlayerId, armed, onSkip, disabled }: Props) {
  return (
    <div className="podium">
      {contestants.map(({ player, team }) => {
        const won = buzzWinnerPlayerId === player.id;
        const lost = buzzWinnerPlayerId !== null && !won;
        return (
          <div key={player.id} className={`podium__slot${won ? " podium__slot--won" : ""}${lost ? " podium__slot--lost" : ""}${armed ? " podium__slot--armed" : ""}`}>
            <span className="podium__team">{team.name}</span>
            <span className="podium__name">{player.displayName}</span>
            {won && <span className="tag tag--gold">BUZZED</span>}
            {onSkip && (
              <button className="button button--small button--ghost" type="button" disabled={disabled} onClick={() => onSkip(team.id)}>
                Skip
              </button>
            )}
          </div>
        );
      })}
      {contestants.length > 0 && <div className="podium__vs">VS</div>}
    </div>
  );
}
