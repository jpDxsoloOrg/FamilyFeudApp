import { CircleAlert, X } from "lucide-react";

interface Props {
  problem: string | undefined;
  note: string | undefined;
  onDismiss: () => void;
  onDismissNote: () => void;
}

/** The last failure, and short confirmations. Rendered inside an open sheet too, since a modal hides the dock. */
export function ErrorStrip({ problem, note, onDismiss, onDismissNote }: Props) {
  if (!problem && !note) return null;
  return (
    <div className="hx-strip-wrap">
      {problem && (
        <div className="hx-strip hx-strip--problem" role="alert">
          <CircleAlert size={18} aria-hidden="true" />
          <span className="hx-strip__text">{problem}</span>
          <button className="hx-strip__close" type="button" aria-label="Dismiss" onClick={onDismiss}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      )}
      {note && (
        <div className="hx-strip" role="status">
          <span className="hx-strip__text">{note}</span>
          <button className="hx-strip__close" type="button" aria-label="Dismiss" onClick={onDismissNote}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
