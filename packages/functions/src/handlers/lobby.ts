// Task 2.2 — createGame, joinGame, updateConfig, randomizeTeams, setTeamName.
import { DEFAULT_CONFIG, randomizeTeams as splitIntoTeams, type Player, type Team } from "@familyfeud/core";
import { optionalObject, requiredObject, requiredString, type Args } from "../lib/args.js";
import { hashHostToken, requireHost } from "../lib/auth.js";
import { mergeConfig } from "../lib/config.js";
import {
  getItem,
  isTransactionCancelled,
  MAX_TRANSACT_ITEMS,
  putItem,
  tableName,
  transactWrite,
  updateItem,
  type TransactItems,
} from "../lib/db.js";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors.js";
import { loadGame, sortPlayers, type FullGame } from "../lib/gameState.js";
import { newGameId, newHostToken, newJoinCode, newTeamId } from "../lib/ids.js";
import { keys } from "../lib/keys.js";
import { playerItem, teamItem, type GameMetaItem, type JoinCodeItem } from "../lib/mappers.js";
import { nowIso } from "../lib/time.js";
import { gameUpdate, toPublicGame, type GameUpdate, type GameView } from "../lib/views.js";

const MAX_JOIN_CODE_ATTEMPTS = 5;
const MAX_JOIN_CODE_LENGTH = 12;
const MAX_PLAYER_ID_LENGTH = 64;
export const MAX_DISPLAY_NAME_LENGTH = 24;
export const MAX_TEAM_NAME_LENGTH = 30;
const TEAM_COUNT = 2;
const IF_ABSENT = "attribute_not_exists(pk)";

/** Statuses in which the lobby is still being arranged. */
export const LOBBY_STATUSES = new Set(["LOBBY", "TEAMS_SET"]);

export interface CreateGamePayload {
  game: GameView;
  hostToken: string;
}

export async function createGame(args: Args): Promise<CreateGamePayload> {
  const config = mergeConfig(DEFAULT_CONFIG, optionalObject(args, "config"));
  const gameId = newGameId();
  const hostToken = newHostToken();
  const createdAt = nowIso();

  for (let attempt = 1; attempt <= MAX_JOIN_CODE_ATTEMPTS; attempt += 1) {
    const joinCode = newJoinCode();
    const meta: GameMetaItem = {
      ...keys.game(gameId),
      status: "LOBBY",
      hostTokenHash: hashHostToken(hostToken),
      joinCode,
      config,
      currentRound: null,
      fastMoneyStage: "SETUP",
      fastMoneyTeamId: null,
      fastMoneyPlayerIds: [],
      timerEndsAt: null,
      createdAt,
    };
    const codeItem: JoinCodeItem = { ...keys.joinCode(joinCode), gameId };
    try {
      await transactWrite([
        { Put: { TableName: tableName(), Item: codeItem, ConditionExpression: IF_ABSENT } },
        { Put: { TableName: tableName(), Item: meta, ConditionExpression: IF_ABSENT } },
      ]);
    } catch (error) {
      if (!isTransactionCancelled(error)) throw error;
      continue; // join code taken; try another
    }
    const game: FullGame = {
      id: gameId,
      joinCode,
      status: "LOBBY",
      config,
      currentRound: null,
      createdAt,
      hostTokenHash: meta.hostTokenHash,
      players: [],
      teams: [],
      surveys: [],
      rounds: [],
      fastMoneyQuestions: [],
      fastMoney: { stage: "SETUP", teamId: null, playerIds: [], timerEndsAt: null, responses: [] },
      lineupPins: { surveys: [], fastMoney: [] },
      lineup: null,
    };
    return { game: toPublicGame(game), hostToken };
  }
  throw new ConflictError(`Could not allocate a free join code after ${MAX_JOIN_CODE_ATTEMPTS} attempts`);
}

async function gameIdForCode(code: string): Promise<string> {
  const item = await getItem<JoinCodeItem>(keys.joinCode(code));
  if (!item || typeof item.gameId !== "string") {
    throw new NotFoundError("No game with that join code");
  }
  return item.gameId;
}

/**
 * Join, or come back. The client supplies `playerId`, so a repeat call is a
 * rename at most, never a second player — that is what makes a refresh mid-game
 * survivable. Newcomers land unassigned (teamId null): before the draw everyone
 * is unassigned; after it the host slots them in by hand (`assignPlayer`).
 */
export async function joinGame(args: Args): Promise<GameUpdate> {
  const code = requiredString(args, "joinCode", { uppercase: true, maxLength: MAX_JOIN_CODE_LENGTH });
  const playerId = requiredString(args, "playerId", { maxLength: MAX_PLAYER_ID_LENGTH });
  const displayName = requiredString(args, "displayName", { maxLength: MAX_DISPLAY_NAME_LENGTH });

  const gameId = await gameIdForCode(code);
  const game = await loadGame(gameId);
  if (!game) throw new NotFoundError("No game with that join code");

  const existing = game.players.find((candidate) => candidate.id === playerId);
  if (!existing && game.status === "FINISHED") {
    throw new ConflictError("This game has finished");
  }
  const nameTaken = game.players.some(
    (candidate) =>
      candidate.id !== playerId && candidate.displayName.toLowerCase() === displayName.toLowerCase(),
  );
  if (nameTaken) {
    throw new ConflictError(`"${displayName}" is already taken in this game`);
  }

  const unassigned = game.players.filter((candidate) => candidate.teamId === null);
  const player: Player = existing
    ? { ...existing, displayName }
    : {
        id: playerId,
        displayName,
        teamId: null,
        order: unassigned.reduce((max, candidate) => Math.max(max, candidate.order + 1), 0),
        active: true,
      };
  await putItem(playerItem(gameId, player));

  const players = existing
    ? game.players.map((candidate) => (candidate.id === playerId ? player : candidate))
    : [...game.players, player];
  return gameUpdate({ ...game, players: sortPlayers(players) }, "PLAYER_JOINED");
}

export async function updateConfig(args: Args): Promise<GameUpdate> {
  const gameId = requiredString(args, "gameId");
  const hostToken = requiredString(args, "hostToken");
  const input = requiredObject(args, "config");

  const game = await requireHost(gameId, hostToken);
  if (!LOBBY_STATUSES.has(game.status)) {
    throw new ConflictError("Settings can only be changed before the first round starts");
  }
  const config = mergeConfig(game.config, input);
  await updateItem(keys.game(gameId), {
    updateExpression: "SET config = :config",
    values: { ":config": config },
    conditionExpression: "attribute_exists(pk)",
  });
  return gameUpdate({ ...game, config }, "CONFIG_UPDATED");
}

function defaultTeamName(index: number): string {
  return `Team ${index + 1}`;
}

/**
 * Deal every active player onto two teams. Existing team ids and names survive
 * a re-draw so a rename is not lost; scores are reset (only allowed before the
 * first round anyway).
 */
export async function randomizeTeams(args: Args): Promise<GameUpdate> {
  const gameId = requiredString(args, "gameId");
  const hostToken = requiredString(args, "hostToken");

  const game = await requireHost(gameId, hostToken);
  if (!LOBBY_STATUSES.has(game.status) || game.rounds.length > 0) {
    throw new ConflictError("Teams can only be randomized before the first round starts");
  }
  const active = game.players.filter((player) => player.active);
  if (active.length < TEAM_COUNT) {
    throw new ValidationError(`At least ${TEAM_COUNT} players are needed to make teams`);
  }
  const required = game.teams.length + TEAM_COUNT + game.players.length + 1;
  if (required > MAX_TRANSACT_ITEMS) {
    throw new ConflictError(`This game is too large to draw teams atomically (${required} writes)`);
  }

  const dealt = splitIntoTeams(
    active.map((player) => player.id),
    TEAM_COUNT,
  );
  const table = tableName();
  const writes: TransactItems = [];
  const reuse = game.teams.length === TEAM_COUNT ? game.teams : [];
  for (const stale of game.teams.filter((team) => !reuse.includes(team))) {
    writes.push({ Delete: { TableName: table, Key: keys.team(gameId, stale.id) } });
  }

  const teams: Team[] = dealt.map((_, index) => ({
    id: reuse[index]?.id ?? newTeamId(),
    name: reuse[index]?.name ?? defaultTeamName(index),
    order: index,
    score: 0,
    nextContestantCursor: 0,
  }));
  for (const team of teams) {
    writes.push({ Put: { TableName: table, Item: teamItem(gameId, team) } });
  }

  const seat = new Map<string, { teamId: string; order: number }>();
  dealt.forEach((playerIds, teamIndex) => {
    playerIds.forEach((playerId, order) => seat.set(playerId, { teamId: teams[teamIndex].id, order }));
  });
  const players: Player[] = game.players.map((player) => {
    const placed = seat.get(player.id);
    const next: Player = placed ? { ...player, ...placed } : { ...player, teamId: null, order: 0 };
    writes.push({ Put: { TableName: table, Item: playerItem(gameId, next) } });
    return next;
  });

  writes.push({
    Update: {
      TableName: table,
      Key: keys.game(gameId),
      UpdateExpression: "SET #status = :teamsSet",
      ConditionExpression: "#status IN (:lobby, :teamsSet)",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":lobby": "LOBBY", ":teamsSet": "TEAMS_SET" },
    },
  });
  await transactWrite(writes);

  return gameUpdate({ ...game, status: "TEAMS_SET", teams, players: sortPlayers(players) }, "TEAMS_SET");
}

export async function setTeamName(args: Args): Promise<GameUpdate> {
  const gameId = requiredString(args, "gameId");
  const hostToken = requiredString(args, "hostToken");
  const teamId = requiredString(args, "teamId");
  const name = requiredString(args, "name", { maxLength: MAX_TEAM_NAME_LENGTH });

  const game = await requireHost(gameId, hostToken);
  const team = game.teams.find((candidate) => candidate.id === teamId);
  if (!team) throw new NotFoundError("No such team in this game");

  await updateItem(keys.team(gameId, teamId), {
    updateExpression: "SET #name = :name",
    names: { "#name": "name" },
    values: { ":name": name },
    conditionExpression: "attribute_exists(pk)",
  });
  const teams = game.teams.map((candidate) => (candidate.id === teamId ? { ...candidate, name } : candidate));
  return gameUpdate({ ...game, teams }, "TEAM_RENAMED");
}
