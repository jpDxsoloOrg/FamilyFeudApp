// Task 2.3 — turn-order helpers. See PLAN.md.
import type { Player } from "./types.js";

/** Active members of a team in turn order. */
export function activeRoster(_players: readonly Player[], _teamId: string): Player[] {
  throw new Error("Not implemented: activeRoster (Task 2.3)");
}

/** Next contestant top-to-bottom, wrapping; skips inactive players. */
export function nextContestant(
  _roster: readonly Player[],
  _cursor: number,
): { player: Player; nextCursor: number } {
  throw new Error("Not implemented: nextContestant (Task 2.3)");
}

/** Roster rotated to start after the face-off contestant (contestant goes last). */
export function guesserOrderAfter(_roster: readonly Player[], _contestantId: string): string[] {
  throw new Error("Not implemented: guesserOrderAfter (Task 2.3)");
}

/** Assign/move a player to a team, appended to the bottom of its order. */
export function assignToTeam(_players: readonly Player[], _playerId: string, _teamId: string): Player[] {
  throw new Error("Not implemented: assignToTeam (Task 2.3)");
}

export function reorderWithinTeam(_players: readonly Player[], _playerId: string, _newOrder: number): Player[] {
  throw new Error("Not implemented: reorderWithinTeam (Task 2.3)");
}
