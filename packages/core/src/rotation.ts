// Task 2.3 — turn-order helpers. Pure; never mutate their input.
import type { Player } from "./types.js";

function byOrder(players: readonly Player[]): Player[] {
  return [...players].sort((a, b) => a.order - b.order || a.displayName.localeCompare(b.displayName));
}

/** Every member of a team (active or not) in turn order. */
export function teamRoster(players: readonly Player[], teamId: string): Player[] {
  return byOrder(players.filter((player) => player.teamId === teamId));
}

/** Active members of a team in turn order. */
export function activeRoster(players: readonly Player[], teamId: string): Player[] {
  return teamRoster(players, teamId).filter((player) => player.active);
}

/**
 * Next contestant top-to-bottom, wrapping. `cursor` counts how many slots have
 * been consumed so far; inactive players in the roster are skipped (and their
 * slot consumed) so removing someone never stalls the rotation.
 */
export function nextContestant(
  roster: readonly Player[],
  cursor: number,
): { player: Player; nextCursor: number } {
  if (roster.length === 0) throw new Error("Cannot pick a contestant from an empty roster");
  if (!roster.some((player) => player.active)) {
    throw new Error("Cannot pick a contestant: no active players on this team");
  }
  let offset = 0;
  for (;;) {
    const index = (cursor + offset) % roster.length;
    const candidate = roster[index];
    offset += 1;
    if (candidate.active) return { player: candidate, nextCursor: cursor + offset };
  }
}

/**
 * Play order for the board: the roster rotated to start after the face-off
 * contestant, so the contestant guesses last. Inactive players are dropped. A
 * contestant not on the roster (e.g. removed mid-round) leaves the order as-is.
 */
export function guesserOrderAfter(roster: readonly Player[], contestantId: string): string[] {
  const active = roster.filter((player) => player.active);
  const at = active.findIndex((player) => player.id === contestantId);
  if (at === -1) return active.map((player) => player.id);
  return [...active.slice(at + 1), ...active.slice(0, at + 1)].map((player) => player.id);
}

/** Renumber one team's (or the unassigned bucket's) orders to 0..n-1, keeping relative order. */
export function renumberTeam(players: readonly Player[], teamId: string | null): Player[] {
  const members = byOrder(players.filter((player) => player.teamId === teamId));
  const position = new Map(members.map((player, index) => [player.id, index]));
  return players.map((player) => {
    const next = position.get(player.id);
    return next === undefined || next === player.order ? player : { ...player, order: next };
  });
}

/** Assign/move a player to a team, appended to the bottom of its order; the old bucket closes up. */
export function assignToTeam(players: readonly Player[], playerId: string, teamId: string): Player[] {
  const target = players.find((player) => player.id === playerId);
  if (!target) throw new Error(`No such player: ${playerId}`);
  const bottom = players
    .filter((player) => player.teamId === teamId && player.id !== playerId)
    .reduce((max, player) => Math.max(max, player.order + 1), 0);
  const moved = players.map((player) =>
    player.id === playerId ? { ...player, teamId, order: bottom } : player,
  );
  return target.teamId === teamId ? renumberTeam(moved, teamId) : renumberTeam(moved, target.teamId);
}

/** Move a player to `newOrder` (clamped) within their current team, renumbering the rest. */
export function reorderWithinTeam(players: readonly Player[], playerId: string, newOrder: number): Player[] {
  const target = players.find((player) => player.id === playerId);
  if (!target) throw new Error(`No such player: ${playerId}`);
  const members = byOrder(players.filter((player) => player.teamId === target.teamId));
  const from = members.findIndex((player) => player.id === playerId);
  const to = Math.max(0, Math.min(members.length - 1, Math.trunc(newOrder)));
  const reordered = [...members];
  const [moving] = reordered.splice(from, 1);
  reordered.splice(to, 0, moving);
  const position = new Map(reordered.map((player, index) => [player.id, index]));
  return players.map((player) => {
    const next = position.get(player.id);
    return next === undefined || next === player.order ? player : { ...player, order: next };
  });
}

/** Deactivate (remove) or reactivate (restore) a player; their seat and order are kept. */
export function setPlayerActive(players: readonly Player[], playerId: string, active: boolean): Player[] {
  if (!players.some((player) => player.id === playerId)) throw new Error(`No such player: ${playerId}`);
  return players.map((player) => (player.id === playerId ? { ...player, active } : player));
}
