// Task 5.2 — host token recovery: paste a token saved elsewhere to run the game from this browser.
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { setHostToken } from "../lib/identity";

interface Props {
  gameId: string;
  title: string;
  /** Called once a token has been stored so the screen can re-read with it. */
  onStored: () => void;
}

export function HostTokenGate({ gameId, title, onStored }: Props) {
  const [token, setToken] = useState("");

  function submit(event: FormEvent): void {
    event.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) return;
    setHostToken(gameId, trimmed);
    onStored();
  }

  return (
    <main className="page page--narrow">
      <h1>{title}</h1>
      <p className="field-error">This browser doesn't hold the host token for this game.</p>
      <p className="muted">
        The token was shown to whoever created the game. On that device, open the host console and use "Copy host token", then paste it here to take over hosting.
      </p>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label className="label" htmlFor="hostToken">
            Host token
          </label>
          <input id="hostToken" className="input" value={token} autoComplete="off" spellCheck={false} onChange={(event) => setToken(event.target.value)} />
        </div>
        <button className="button button--primary" type="submit" disabled={!token.trim()}>
          Use this token
        </button>
      </form>
      <p>
        <Link to="/">Back to start</Link>
      </p>
    </main>
  );
}
