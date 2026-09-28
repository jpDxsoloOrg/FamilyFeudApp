// Task 2.7 — join a game with a code + name, or host a new one.
import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, createGame, joinGame, toApiError } from "../lib/api";
import {
  getDisplayName,
  getLastGame,
  getPlayerId,
  setDisplayName,
  setHostToken,
  setLastGame,
} from "../lib/identity";

const JOIN_CODE_LENGTH = 5;
const MAX_NAME_LENGTH = 24;

function messageFor(error: ApiError): string {
  if (error.code === "NOT_FOUND") return "That code didn't match a game — check with your host.";
  if (error.code === "NETWORK") return "Couldn't reach the game. Check your signal and try again.";
  return error.message;
}

/** Mark the field a player can actually fix; a taken name is theirs to change. */
function fieldFor(error: ApiError): "joinCode" | "name" | undefined {
  if (error.code === "NOT_FOUND") return "joinCode";
  if (error.code === "CONFLICT" && error.message.includes("already taken")) return "name";
  return undefined;
}

export function Join() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returning = getLastGame();
  const scanned = params.get("code")?.trim().toUpperCase() ?? "";
  const [joinCode, setJoinCode] = useState(scanned || (returning?.joinCode ?? ""));
  const [name, setName] = useState(getDisplayName() ?? "");
  const [error, setError] = useState<string>();
  const [errorField, setErrorField] = useState<"joinCode" | "name">();
  const [busy, setBusy] = useState(false);

  const canSubmit = joinCode.trim().length > 0 && name.trim().length > 0 && !busy;

  async function join(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!canSubmit) return;
    const code = joinCode.trim().toUpperCase();
    const chosen = name.trim();
    setBusy(true);
    setError(undefined);
    setErrorField(undefined);
    try {
      const update = await joinGame(code, getPlayerId(), chosen);
      setDisplayName(chosen);
      setLastGame({ gameId: update.gameId, joinCode: code, displayName: chosen });
      navigate(`/play/${update.gameId}`);
    } catch (cause) {
      const failure = toApiError(cause);
      setError(messageFor(failure));
      setErrorField(fieldFor(failure));
    } finally {
      setBusy(false);
    }
  }

  /** The host token is shown once; store it before navigating anywhere. */
  async function host(): Promise<void> {
    setBusy(true);
    setError(undefined);
    setErrorField(undefined);
    try {
      const created = await createGame();
      setHostToken(created.game.id, created.hostToken);
      navigate(`/host/${created.game.id}/setup`);
    } catch (cause) {
      setError(messageFor(toApiError(cause)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page page--narrow join">
      <h1 className="join__title">Family Feud</h1>
      <p className="muted">Survey says… grab your phone and join the game.</p>

      {returning && (
        <p className="muted">
          Welcome back{returning.displayName ? `, ${returning.displayName}` : ""} — your code is filled in.
        </p>
      )}

      <form className="form" onSubmit={join} noValidate>
        <div className="field">
          <label className="label" htmlFor="joinCode">
            Game code
          </label>
          <input
            id="joinCode"
            className={`input input--code${errorField === "joinCode" ? " input--invalid" : ""}`}
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            maxLength={JOIN_CODE_LENGTH}
            placeholder="ABCDE"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            aria-invalid={errorField === "joinCode"}
          />
          {errorField === "joinCode" && error && <p className="field-error">{error}</p>}
        </div>

        <div className="field">
          <label className="label" htmlFor="displayName">
            Your name
          </label>
          <input
            id="displayName"
            className={`input${errorField === "name" ? " input--invalid" : ""}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={MAX_NAME_LENGTH}
            placeholder="e.g. Steve"
            autoComplete="nickname"
            enterKeyHint="go"
            aria-invalid={errorField === "name"}
          />
          {errorField === "name" && error && <p className="field-error">{error}</p>}
        </div>

        {error && !errorField && <p className="field-error">{error}</p>}

        <button className="button button--primary button--block" type="submit" disabled={!canSubmit}>
          {busy ? "Joining…" : returning ? "Rejoin the game" : "Join the game"}
        </button>
      </form>

      <p className="join__host muted">
        Running the game tonight?{" "}
        <button className="link" type="button" onClick={host} disabled={busy}>
          Host a new game
        </button>
      </p>
    </main>
  );
}
