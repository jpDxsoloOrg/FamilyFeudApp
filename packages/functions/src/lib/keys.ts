// Task 2.1 — DynamoDB key helpers for the single-table layout in PLAN.md.
export const keys = {
  game: (gameId: string) => ({ pk: `GAME#${gameId}`, sk: "META" }),
  player: (gameId: string, playerId: string) => ({ pk: `GAME#${gameId}`, sk: `PLAYER#${playerId}` }),
  team: (gameId: string, teamId: string) => ({ pk: `GAME#${gameId}`, sk: `TEAM#${teamId}` }),
  survey: (gameId: string, n: number) => ({ pk: `GAME#${gameId}`, sk: `SURVEY#${String(n).padStart(3, "0")}` }),
  round: (gameId: string, n: number) => ({ pk: `GAME#${gameId}`, sk: `ROUND#${String(n).padStart(3, "0")}` }),
  fastMoneyQuestion: (gameId: string, n: number) => ({ pk: `GAME#${gameId}`, sk: `FMQ#${String(n).padStart(3, "0")}` }),
  fastMoneyResponse: (gameId: string, slot: number, n: number) => ({
    pk: `GAME#${gameId}`,
    sk: `FMRESP#${slot}#${String(n).padStart(3, "0")}`,
  }),
  joinCode: (code: string) => ({ pk: `JOIN#${code.toUpperCase()}`, sk: "GAME" }),
};
