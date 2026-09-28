import { useState, type FormEvent } from "react";

const MAX_TEAM_NAME_LENGTH = 30;

interface Props {
  name: string;
  busy: boolean;
  onRename: (name: string) => Promise<void>;
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

  if (!editing) {
    return (
      <div className="button-row">
        <h3 style={{ margin: 0 }}>{name}</h3>
        <button
          className="button button--small button--ghost"
          type="button"
          disabled={busy}
          onClick={() => {
            setDraft(name);
            setEditing(true);
          }}
        >
          Rename
        </button>
      </div>
    );
  }

  return (
    <form className="button-row" onSubmit={submit}>
      <input
        className="input input--small"
        aria-label="Team name"
        value={draft}
        maxLength={MAX_TEAM_NAME_LENGTH}
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
      />
      <button className="button button--small button--primary" type="submit" disabled={busy}>
        Save
      </button>
      <button className="button button--small button--ghost" type="button" onClick={() => setEditing(false)}>
        Cancel
      </button>
    </form>
  );
}
