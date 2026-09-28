// Task 2.5 — assignPlayer, reorderPlayer, removePlayer, restorePlayer.
import {
  assignToTeam,
  reorderWithinTeam,
  setPlayerActive,
  type Player,
} from "@familyfeud/core";
import { requiredInt, requiredString, type Args } from "../lib/args.js";
import { requireHost } from "../lib/auth.js";
import { batchWrite, MAX_TRANSACT_ITEMS, tableName, transactWrite } from "../lib/db.js";
import { ConflictError, NotFoundError } from "../lib/errors.js";
import { sortPlayers, type FullGame } from "../lib/gameState.js";
import { playerItem } from "../lib/mappers.js";
import { gameUpdate, type GameUpdate } from "../lib/views.js";

function samePlayer(a: Player, b: Player): boolean {
  return a.teamId === b.teamId && a.order === b.order && a.active === b.active && a.displayName === b.displayName;
}

/**
 * Write every player whose seat changed. A reorder touches a handful of items,
 * so they go in one transaction; only an implausibly large team falls back to
 * a (non-atomic) batch.
 */
export async function persistPlayers(gameId: string, before: readonly Player[], after: readonly Player[]): Promise<void> {
  const previous = new Map(before.map((player) => [player.id, player]));
  const changed = after.filter((player) => {
    const was = previous.get(player.id);
    return !was || !samePlayer(was, player);
  });
  if (changed.length === 0) return;
  const items = changed.map((player) => playerItem(gameId, player));
  if (items.length <= MAX_TRANSACT_ITEMS) {
    const table = tableName();
    await transactWrite(items.map((item) => ({ Put: { TableName: table, Item: item } })));
  } else {
    await batchWrite(items);
  }
}

function findPlayer(game: FullGame, playerId: string): Player {
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new NotFoundError("No such player in this game");
  return player;
}

async function applyRoster(game: FullGame, players: Player[]): Promise<GameUpdate> {
  await persistPlayers(game.id, game.players, players);
  return gameUpdate({ ...game, players: sortPlayers(players) }, "ROSTER_CHANGED");
}

/** Assign (or move) a player to a team; appended to the bottom of that team's order. */
export async function assignPlayer(args: Args): Promise<GameUpdate> {
  const gameId = requiredString(args, "gameId");
  const hostToken = requiredString(args, "hostToken");
  const playerId = requiredString(args, "playerId");
  const teamId = requiredString(args, "teamId");

  const game = await requireHost(gameId, hostToken);
  if (!game.teams.some((team) => team.id === teamId)) throw new NotFoundError("No such team in this game");
  findPlayer(game, playerId);
  return applyRoster(game, assignToTeam(game.players, playerId, teamId));
}

export async function reorderPlayer(args: Args): Promise<GameUpdate> {
  const gameId = requiredString(args, "gameId");
  const hostToken = requiredString(args, "hostToken");
  const playerId = requiredString(args, "playerId");
  const newOrder = requiredInt(args, "newOrder", { min: 0 });

  const game = await requireHost(gameId, hostToken);
  const player = findPlayer(game, playerId);
  if (player.teamId === null) throw new ConflictError("Assign the player to a team before reordering");
  return applyRoster(game, reorderWithinTeam(game.players, playerId, newOrder));
}

/** Deactivate a player (left early). They keep their seat and can be restored. */
export async function removePlayer(args: Args): Promise<GameUpdate> {
  const gameId = requiredString(args, "gameId");
  const hostToken = requiredString(args, "hostToken");
  const playerId = requiredString(args, "playerId");

  const game = await requireHost(gameId, hostToken);
  findPlayer(game, playerId);
  return applyRoster(game, setPlayerActive(game.players, playerId, false));
}

export async function restorePlayer(args: Args): Promise<GameUpdate> {
  const gameId = requiredString(args, "gameId");
  const hostToken = requiredString(args, "hostToken");
  const playerId = requiredString(args, "playerId");

  const game = await requireHost(gameId, hostToken);
  findPlayer(game, playerId);
  return applyRoster(game, setPlayerActive(game.players, playerId, true));
}
