import type { ReactNode } from "react";
import type { Contestant } from "../lib/gameHelpers";

interface Props {
  contestants: Contestant[];
  buzzWinnerPlayerId: string | null;
  armed: boolean;
  /** What stands between the plates. Without it, a VS badge. */
  center?: ReactNode;
}

/** The two face-off contestants, lit up when one wins the buzz. */
export function Podium({ contestants, buzzWinnerPlayerId, armed, center }: Props) {
  const [left, right] = contestants;
  const plate = (contestant: Contestant | undefined, side: "a" | "b") => {
    if (!contestant) return null;
    const { player, team } = contestant;
    const won = buzzWinnerPlayerId === player.id;
    const lost = buzzWinnerPlayerId !== null && !won;
    return (
      <div className="sx-podium__plate" data-side={side} data-won={won ? "" : undefined} data-lost={lost ? "" : undefined} data-armed={armed ? "" : undefined}>
        <span className="sx-podium__team">{team.name}</span>
        <span className="sx-podium__name">{player.displayName}</span>
        {won && <span className="tag tag--gold">BUZZED</span>}
      </div>
    );
  };

  return (
    <div className="sx-podium">
      {plate(left, "a")}
      <div className="sx-podium__center">{center ?? (contestants.length > 0 && <span className="sx-podium__vs">VS</span>)}</div>
      {plate(right, "b")}
    </div>
  );
}
