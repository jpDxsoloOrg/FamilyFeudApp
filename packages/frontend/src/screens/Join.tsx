// Join a game with a code and a name, or host a new one.
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Wordmark } from "../components/show/Wordmark";
import { ApiError, createGame, joinGame, toApiError } from "../lib/api";
import { PRODUCT_NAME } from "../lib/brand";
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
  const scanned = params.get("code")?.trim().toUpperCase().slice(0, JOIN_CODE_LENGTH) ?? "";
  const [joinCode, setJoinCode] = useState(scanned || (returning?.joinCode ?? ""));
  const [name, setName] = useState(getDisplayName() ?? "");
  const [error, setError] = useState<string>();
  const [errorField, setErrorField] = useState<"joinCode" | "name">();
  const [failures, setFailures] = useState(0);
  const [busy, setBusy] = useState(false);
  const [hosting, setHosting] = useState(false);
  const [hostAsk, setHostAsk] = useState(false);
  const [ticket, setTicket] = useState(scanned.length === JOIN_CODE_LENGTH);
  const codeInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  const rejoining = returning !== null && joinCode === returning.joinCode;
  const canSubmit = joinCode.trim().length === JOIN_CODE_LENGTH && name.trim().length > 0 && !busy;

  // A scanned code is already right; the only thing left to give is a name.
  useEffect(() => {
    if (scanned) nameInput.current?.focus();
  }, [scanned]);

  useEffect(() => {
    if (failures === 0) return;
    if (errorField === "joinCode") codeInput.current?.focus();
    if (errorField === "name") nameInput.current?.focus();
  }, [failures, errorField]);

  function failWith(cause: unknown, field: boolean): void {
    const failure = toApiError(cause);
    const bad = field ? fieldFor(failure) : undefined;
    setError(messageFor(failure));
    setErrorField(bad);
    if (bad === "joinCode") setTicket(false);
    setFailures((count) => count + 1);
  }

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
      failWith(cause, true);
    } finally {
      setBusy(false);
    }
  }

  /** The host token is shown once; store it before navigating anywhere. */
  async function host(): Promise<void> {
    setHosting(true);
    setError(undefined);
    setErrorField(undefined);
    try {
      const created = await createGame();
      setHostToken(created.game.id, created.hostToken);
      navigate(`/host/${created.game.id}/setup`);
    } catch (cause) {
      failWith(cause, false);
    } finally {
      setHosting(false);
    }
  }

  function onCode(event: ChangeEvent<HTMLInputElement>): void {
    const next = event.target.value.toUpperCase();
    setJoinCode(next);
    if (next.length === JOIN_CODE_LENGTH && !name.trim()) nameInput.current?.focus();
  }

  function changeCode(): void {
    setTicket(false);
    window.setTimeout(() => codeInput.current?.focus());
  }

  const cells = Array.from({ length: JOIN_CODE_LENGTH }, (_, index) => joinCode[index]);

  return (
    <main className="sx sx-join">
      <div className="sx-join__intro">
        <h1 className="sx-sr">{PRODUCT_NAME}</h1>
        <Wordmark variant="full" className="sx-join__mark" />
        <p className="sx-join__tagline">Grab your phone. Pick a side. Beat the board.</p>
      </div>

      <form className="form sx-join__form" onSubmit={join} noValidate>
        {rejoining && !ticket && (
          <p className="sx-join__back">
            Welcome back{returning.displayName ? `, ${returning.displayName}` : ""} — your code is filled in.
          </p>
        )}

        {ticket ? (
          <div className="sx-join__ticket">
            <span>
              Game <strong>{joinCode}</strong>, from the QR
            </span>
            <button className="button button--small button--ghost" type="button" onClick={changeCode}>
              Change
            </button>
          </div>
        ) : (
          <div className="field">
            <label className="label" htmlFor="joinCode">
              Game code
            </label>
            <div className="sx-cells" data-invalid={errorField === "joinCode" ? "" : undefined}>
              {cells.map((letter, index) => (
                <span key={index} className="sx-cells__cell" data-next={index === joinCode.length ? "" : undefined} aria-hidden="true">
                  {letter ?? <span className="sx-cells__dot" />}
                </span>
              ))}
              <input
                ref={codeInput}
                id="joinCode"
                className="sx-cells__input"
                value={joinCode}
                onChange={onCode}
                maxLength={JOIN_CODE_LENGTH}
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                aria-invalid={errorField === "joinCode"}
              />
            </div>
            {errorField === "joinCode" && error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
          </div>
        )}

        <div className="field">
          <label className="label" htmlFor="displayName">
            Your name
          </label>
          <input
            ref={nameInput}
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
          {errorField === "name" && error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>

        {error && !errorField && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        <button className="button button--primary button--block sx-join__submit" type="submit" disabled={!canSubmit}>
          {busy ? "Joining…" : rejoining ? "Rejoin the game" : "Join the game"}
        </button>
        {rejoining && !ticket && (
          <button
            className="button button--ghost button--block"
            type="button"
            onClick={() => {
              setJoinCode("");
              window.setTimeout(() => codeInput.current?.focus());
            }}
          >
            Different game
          </button>
        )}
      </form>

      <div className="sx-join__host">
        {hostAsk ? (
          <>
            <p>Start a new game on this device?</p>
            <div className="button-row">
              <button className="button button--primary" type="button" onClick={host} disabled={hosting}>
                {hosting ? "Starting…" : "Start hosting"}
              </button>
              <button className="button button--ghost" type="button" onClick={() => setHostAsk(false)} disabled={hosting}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <button className="button button--ghost button--block" type="button" onClick={() => setHostAsk(true)}>
            Running the game tonight? Host a new game
          </button>
        )}
      </div>
    </main>
  );
}
