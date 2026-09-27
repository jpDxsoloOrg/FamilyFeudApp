// Task 2.7 — client-generated identity persisted in localStorage.
const PLAYER_KEY = "familyfeud.playerId";

export function getPlayerId(): string {
  let id = localStorage.getItem(PLAYER_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(PLAYER_KEY, id);
  }
  return id;
}

export function hostTokenKey(gameId: string): string {
  return `familyfeud.hostToken.${gameId}`;
}
