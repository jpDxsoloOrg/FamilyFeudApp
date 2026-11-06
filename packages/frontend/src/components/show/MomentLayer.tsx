/**
 * Decoration over the real content, which has already updated underneath.
 * Timers in `useMoments` and `usePlayerCues` take everything here off screen.
 */
import { useEffect } from "react";
import type { CurrentMoment } from "../../hooks/useMoments";
import type { PlayerSplash } from "../../hooks/usePlayerCues";
import { fireConfetti } from "../../lib/confetti";
import type { Moment } from "../../lib/moments";

function Blade({ newest }: { newest: boolean }) {
  return (
    <svg className="sx-blade" data-newest={newest ? "" : undefined} viewBox="0 0 100 100" aria-hidden="true">
      {[45, -45].map((angle) => (
        <g key={angle} transform={`rotate(${angle} 50 50)`}>
          <polygon points="42,2 50,0 58,2 62,10 62,90 58,98 50,100 42,98 38,90 38,10" fill="#8f1626" />
          <polygon points="42,2 50,0 50,100 42,98 38,90 38,10" fill="#ff4d5e" />
          <polygon points="50,0 58,2 62,10 62,90 58,98 50,100" fill="#c81e35" />
        </g>
      ))}
    </svg>
  );
}

function pointsLine(multiplier: number): string | undefined {
  if (multiplier === 2) return "DOUBLE POINTS";
  return multiplier > 1 ? `×${multiplier}` : undefined;
}

function MomentView({ moment }: { moment: Moment }) {
  switch (moment.kind) {
    case "round":
      return (
        <div className="sx-moment" data-kind="round">
          <div className="sx-moment__card">
            <span className="sx-moment__title">ROUND {moment.number}</span>
            {pointsLine(moment.multiplier) && <span className="sx-moment__sub">{pointsLine(moment.multiplier)}</span>}
          </div>
        </div>
      );
    case "strike":
      return (
        <div className="sx-moment" data-kind="strike">
          <div className="sx-moment__blades" data-count={moment.blades}>
            {Array.from({ length: moment.blades }, (_, i) => (
              <Blade key={i} newest={i === moment.blades - 1} />
            ))}
          </div>
        </div>
      );
    case "steal":
      return (
        <div className="sx-moment" data-kind="steal" data-side={moment.side}>
          <span className="sx-moment__wipe" />
          <span className="sx-moment__title">STEAL!</span>
        </div>
      );
    case "stolen":
    case "heldOn":
      return (
        <div className="sx-moment" data-kind="rays">
          <span className="sx-rays" />
          <div className="sx-moment__card">
            <span className="sx-moment__title">{moment.kind === "stolen" ? "STOLEN!" : "HELD ON!"}</span>
            <span className="sx-moment__sub">{moment.team}</span>
          </div>
        </div>
      );
    case "award":
      return (
        <div className="sx-moment" data-kind="rays">
          <span className="sx-rays" />
          <div className="sx-moment__card">
            <span className="sx-moment__title">
              {moment.points} points to {moment.team}!
            </span>
          </div>
        </div>
      );
    case "fmWin":
      return (
        <div className="sx-moment" data-kind="rays">
          <span className="sx-rays" />
          <div className="sx-moment__card">
            <span className="sx-moment__title">YOU WIN!</span>
          </div>
        </div>
      );
    case "finale":
      return (
        <div className="sx-moment" data-kind="finale">
          <span className="sx-moment__curtain" data-side="left" />
          <span className="sx-moment__curtain" data-side="right" />
          <span className="sx-moment__band">That's the game!</span>
        </div>
      );
  }
}

interface Props {
  current: CurrentMoment | null;
  splash?: PlayerSplash | null;
}

export function MomentLayer({ current, splash }: Props) {
  const key = current?.key;
  const kind = current?.moment.kind;

  useEffect(() => {
    if (kind === "fmWin" || kind === "finale") fireConfetti(kind === "finale");
  }, [key, kind]);

  return (
    <div className="sx-moments" aria-hidden="true">
      {current && <MomentView key={current.key} moment={current.moment} />}
      {splash && (
        <div key={splash.id} className="sx-splash" data-mood={splash.mood}>
          <span className="sx-splash__title">{splash.headline}</span>
          {splash.detail && <span className="sx-splash__sub">{splash.detail}</span>}
        </div>
      )}
    </div>
  );
}
