/**
 * Who this browser is, remembered across reloads.
 *
 * - The player id is this browser's claim on a seat: `joinGame` is keyed on it,
 *   so rejoining is a return to the same seat, not a second player.
 * - The host token is a secret the server hands out once at `createGame`. It
 *   is stored per game; lose it and the game cannot be run from this browser.
 */
const PLAYER_ID_KEY = "familyfeud.playerId";
const DISPLAY_NAME_KEY = "familyfeud.displayName";
const HOST_TOKEN_PREFIX = "familyfeud.hostToken.";
const LAST_GAME_KEY = "familyfeud.lastGame";

/** Storage can throw (private mode, blocked site data); degrade to "nothing stored". */
function read(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Lives for this page only.
  }
}

function remove(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // Nothing to do.
  }
}

let sessionPlayerId: string | undefined;

/** This browser's player id, minted on first use and stable thereafter. */
export function getPlayerId(): string {
  const stored = read(PLAYER_ID_KEY);
  if (stored) return stored;
  if (!sessionPlayerId) sessionPlayerId = crypto.randomUUID();
  write(PLAYER_ID_KEY, sessionPlayerId);
  return sessionPlayerId;
}

export function getDisplayName(): string | null {
  return read(DISPLAY_NAME_KEY);
}

export function setDisplayName(name: string): void {
  write(DISPLAY_NAME_KEY, name);
}

export function hostTokenKey(gameId: string): string {
  return HOST_TOKEN_PREFIX + gameId;
}

export function getHostToken(gameId: string): string | null {
  return read(hostTokenKey(gameId));
}

export function setHostToken(gameId: string, token: string): void {
  write(hostTokenKey(gameId), token);
}

export function isHost(gameId: string): boolean {
  return getHostToken(gameId) !== null;
}

export interface LastGame {
  gameId: string;
  joinCode: string;
  displayName: string;
}

/** The game this browser last joined, so a player can be offered their way back in. */
export function getLastGame(): LastGame | null {
  const raw = read(LAST_GAME_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { gameId, joinCode, displayName } = parsed as Record<string, unknown>;
    if (typeof gameId !== "string" || typeof joinCode !== "string") return null;
    return { gameId, joinCode, displayName: typeof displayName === "string" ? displayName : "" };
  } catch {
    return null;
  }
}

export function setLastGame(game: LastGame): void {
  write(LAST_GAME_KEY, JSON.stringify(game));
}

export function clearLastGame(): void {
  remove(LAST_GAME_KEY);
}
