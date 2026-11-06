/** Scores, pot, strikes and who is up, in one band. First team always left, second always right. */
import { useEffect, useRef, useState } from "react";
import { contestantsOf, otherTeam, playerName } from "../../lib/gameHelpers";
import type { ApiGame, ApiTeam, PublicRound } from "../../lib/types";
import { Strikes } from "../Strikes";

const COUNT_MS = 180;

function useCountUp(value: number): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    if (from.current === value) return;
    const start = from.current;
    from.current = value;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    const began = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const progress = Math.min(1, (now - began) / COUNT_MS);
      setShown(Math.round(start + (value - start) * progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return shown;
}

interface PlateProps {
  team: ApiTeam | undefined;
  side: "a" | "b";
  control: boolean;
  armed: boolean;
  line: string | undefined;
  buzzed: boolean;
  onSkip?: () => void;
}

function Plate({ team, side, control, armed, line, buzzed, onSkip }: PlateProps) {
  const score = useCountUp(team?.score ?? 0);
  if (!team) return <div className="hx-plate" />;
  return (
    <div className={`hx-plate hx-edge--${side}`} data-control={control ? "" : undefined} data-armed={armed ? "" : undefined}>
      <div className="hx-plate__top">
        <span className="hx-plate__name" title={team.name}>{team.name}</span>
        <span className="hx-plate__score">{score}</span>
      </div>
      <div className="hx-plate__line">
        {line && <span className="hx-plate__who" title={line}>{line}</span>}
        {buzzed && <span className="hx-tag">BUZZED</span>}
        {onSkip && (
          <button className="hx-mini" type="button" aria-label={`Skip ${line ?? "contestant"}`} onClick={onSkip}>
            Skip
          </button>
        )}
      </div>
    </div>
  );
}

interface Props {
  game: ApiGame;
  round: PublicRound | null;
  flashKey: number | null;
  onSkipContestant: (teamId: string) => void;
}

export function TeamPlates({ game, round, flashKey, onSkipContestant }: Props) {
  const [left, right] = game.teams;
  const state = round?.state;
  const faceOff = state === "PICK_CONTESTANTS" || state === "FACE_OFF_ARMED" || state === "FACE_OFF_ANSWERING";
  const contestants = round && faceOff ? contestantsOf(game, round) : [];
  const controlTeamId = state === "STEAL" ? otherTeam(game, round?.playingTeamId)?.id : round?.playingTeamId;

  const plate = (team: ApiTeam | undefined, side: "a" | "b") => {
    const contestant = contestants.find((entry) => entry.team.id === team?.id);
    const upNow = state === "PLAYING" && team?.id === round?.playingTeamId;
    return (
      <Plate
        team={team}
        side={side}
        control={team !== undefined && team.id === controlTeamId}
        armed={state === "FACE_OFF_ARMED"}
        line={contestant ? contestant.player.displayName : upNow ? `Up now: ${playerName(game, round?.currentGuesserPlayerId)}` : undefined}
        buzzed={contestant !== undefined && contestant.player.id === round?.buzzWinnerPlayerId}
        onSkip={state === "PICK_CONTESTANTS" && team ? () => onSkipContestant(team.id) : undefined}
      />
    );
  };

  return (
    <div className="hx-plates">
      {plate(left, "a")}
      <div className="hx-pot">
        <span className="hx-pot__label">Pot{round && round.multiplier > 1 ? ` ×${round.multiplier}` : ""}</span>
        <span className="hx-pot__value">{round && state !== "ENDED" ? round.pot : 0}</span>
        {faceOff && contestants.length > 0 && <span className="hx-pot__vs">VS</span>}
        {round && state !== "ENDED" && <Strikes count={round.strikes} max={game.config.strikesToSteal} flashKey={flashKey} />}
      </div>
      {plate(right, "b")}
    </div>
  );
}
