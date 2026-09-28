/**
 * Single-table key builders for the layout in PLAN.md. Every sort-key format has
 * exactly one builder here; handlers never construct key strings inline.
 *
 * Numeric segments are zero-padded to three digits so a `begins_with` prefix and
 * plain sort order both behave: `SURVEY#002` sorts before `SURVEY#010`.
 */

export interface TableKey {
  pk: string;
  sk: string;
}

export function pad(n: number): string {
  return String(n).padStart(3, "0");
}

export function gamePk(gameId: string): string {
  return `GAME#${gameId}`;
}

export const keys = {
  game: (gameId: string): TableKey => ({ pk: gamePk(gameId), sk: "META" }),
  player: (gameId: string, playerId: string): TableKey => ({
    pk: gamePk(gameId),
    sk: `PLAYER#${playerId}`,
  }),
  team: (gameId: string, teamId: string): TableKey => ({ pk: gamePk(gameId), sk: `TEAM#${teamId}` }),
  survey: (gameId: string, n: number): TableKey => ({ pk: gamePk(gameId), sk: `SURVEY#${pad(n)}` }),
  round: (gameId: string, n: number): TableKey => ({ pk: gamePk(gameId), sk: `ROUND#${pad(n)}` }),
  fastMoneyQuestion: (gameId: string, n: number): TableKey => ({
    pk: gamePk(gameId),
    sk: `FMQ#${pad(n)}`,
  }),
  fastMoneyResponse: (gameId: string, slot: number, n: number): TableKey => ({
    pk: gamePk(gameId),
    sk: `FMRESP#${slot}#${pad(n)}`,
  }),
  joinCode: (code: string): TableKey => ({ pk: `JOIN#${code.toUpperCase()}`, sk: "GAME" }),
};

/** `begins_with` prefixes for the per-kind queries within one game partition. */
export const prefixes = {
  players: "PLAYER#",
  teams: "TEAM#",
  surveys: "SURVEY#",
  rounds: "ROUND#",
  fastMoneyQuestions: "FMQ#",
  fastMoneyResponses: "FMRESP#",
} as const;

/** Pull the id out of a key such as `PLAYER#<id>`, failing loudly on a malformed key. */
export function suffixAfter(key: string, prefix: string): string {
  if (!key.startsWith(prefix)) {
    throw new Error(`Unexpected key "${key}" (expected prefix "${prefix}")`);
  }
  return key.slice(prefix.length);
}
