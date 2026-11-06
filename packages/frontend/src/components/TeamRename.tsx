import { Check, PenLine, X } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";

const MAX_TEAM_NAME_LENGTH = 30;

interface Props {
  name: string;
  busy: boolean;
  onRename: (name: string) => Promise<unknown>;
}

/** A team heading that turns into an inline rename form. */
export function TeamRename({ name, busy, onRename }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const next = draft.trim();
    if (next && next !== name) await onRename(next);
    setEditing(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== "Escape") return;
    // Stops here, or an open sheet would close with it.
    event.preventDefault();
    event.stopPropagation();
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="hx-rename">
        <h3 className="hx-rename__name">{name}</h3>
        <button
          className="button button--small button--ghost"
          type="button"
          disabled={busy}
          onClick={() => {
            setDraft(name);
            setEditing(true);
          }}
        >
          <PenLine size={16} aria-hidden="true" /> Rename
        </button>
      </div>
    );
  }

  return (
    <form className="hx-rename" onSubmit={submit}>
      <input
        className="input input--small"
        aria-label="Team name"
        value={draft}
        maxLength={MAX_TEAM_NAME_LENGTH}
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <button className="button button--small button--primary" type="submit" disabled={busy}>
        <Check size={16} aria-hidden="true" /> Save
      </button>
      <button className="button button--small button--ghost" type="button" onClick={() => setEditing(false)}>
        <X size={16} aria-hidden="true" /> Cancel
      </button>
    </form>
  );
}
