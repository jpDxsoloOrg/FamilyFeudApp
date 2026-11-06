/** The one place a player looks: pinned above the chat bar, so it never scrolls away. */
import { Link } from "react-router-dom";
import type { PlayerCue } from "../../lib/playerCue";

interface Props {
  cue: PlayerCue;
  /** Present while the chat can be opened. */
  onOpenChat?: () => void;
}

export function TurnDock({ cue, onOpenChat }: Props) {
  const { action } = cue;
  return (
    <section key={cue.id} className="sx-dock" data-mood={cue.mood} data-pulse={cue.pulse ? "" : undefined} aria-label="Your cue">
      <div className="sx-dock__copy">
        <p className="sx-dock__eyebrow">{cue.eyebrow}</p>
        <p className="sx-dock__headline">{cue.headline}</p>
      </div>
      {cue.detail && <span className="tag tag--gold sx-dock__detail">{cue.detail}</span>}
      {action?.kind === "chat" && onOpenChat && (
        <button className="button sx-dock__action" type="button" onClick={onOpenChat}>
          Open chat
        </button>
      )}
      {action?.kind === "link" && (
        <Link className="button button--small button--ghost sx-dock__action" to={action.to}>
          {action.label}
        </Link>
      )}
    </section>
  );
}
