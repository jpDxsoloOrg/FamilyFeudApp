/** What the host presses. One component; only CSS changes per width. It never scrolls. */
import type { ReactNode } from "react";
import type { Cue } from "../../lib/hostCue";
import { ActionButton } from "./ActionButton";

interface Props {
  cue: Cue;
  busy: boolean;
  showBar: boolean;
  flashKey: number;
  strip: ReactNode;
}

export function CueDock({ cue, busy, showBar, flashKey, strip }: Props) {
  const hasRow = cue.undo !== undefined || cue.strike !== undefined || cue.support.length > 0;
  return (
    <section className="hx-dock" data-mood={cue.mood} aria-label="Next action" aria-busy={busy}>
      {showBar && <span className="hx-dock__busy" aria-hidden="true" />}
      {flashKey > 0 && <span key={flashKey} className="hx-dock__flash" aria-hidden="true" />}
      {strip}
      <div className="hx-dock__main">
        <div className="hx-dock__text" key={cue.id}>
          <div className="hx-dock__copy">
            <div className="hx-dock__eyebrow">
              <span className="hx-dock__phase">{cue.eyebrow}</span>
              {cue.detail && <span className="hx-dock__detail">{cue.detail}</span>}
            </div>
            <p className="hx-dock__headline" data-pulse={cue.pulse ? "" : undefined} title={cue.headline}>
              {cue.headline}
            </p>
          </div>
          {cue.clock && (
            <span className="hx-clock" data-urgent={cue.clock.urgent ? "" : undefined} role="timer">
              {cue.clock.seconds}s
            </span>
          )}
        </div>
        <div className="hx-dock__lead">
          {cue.lead.length > 0 ? cue.lead.map((action) => <ActionButton key={action.id} action={action} />) : <div className="hx-hint">{cue.hint}</div>}
        </div>
      </div>
      {hasRow && (
        <div className="hx-dock__row">
          {cue.undo && <ActionButton action={cue.undo} className="hx-dock__undo" />}
          <div className="hx-dock__support">
            {cue.support.map((action) => (
              <ActionButton key={action.id} action={action} />
            ))}
          </div>
          {cue.strike && <ActionButton action={cue.strike} className="hx-dock__strike" />}
        </div>
      )}
    </section>
  );
}
