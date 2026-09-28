// Task 3.3 — round host mutations. Thin persistence wrappers around core roundReducer.
import {
  createRound,
  IllegalTransitionError,
  nextContestant,
  roundReducer,
  teamRoster,
  type RoundAction,
  type RoundContext,
  type RoundData,
  type RoundEvent,
  type Team,
} from "@familyfeud/core";
import { requiredInt, requiredString, type Args } from "../lib/args.js";
import { requireHost } from "../lib/auth.js";
import { putItem, tableName, transactWrite, type TransactItems } from "../lib/db.js";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors.js";
import { currentRoundOf, type FullGame } from "../lib/gameState.js";
import { keys } from "../lib/keys.js";
import { roundItem, teamItem } from "../lib/mappers.js";
import { playerMessage, publishPlayerMessages, type PlayerMessage } from "../lib/messages.js";
import { gameUpdate, type GameEvent, type GameUpdate } from "../lib/views.js";

const EVENT_NAME: Record<RoundEvent["type"], GameEvent> = {
  CONTESTANT_CHANGED: "CONTESTANT_SKIPPED",
  BUZZERS_ARMED: "BUZZERS_ARMED",
  BUZZ: "BUZZ",
  BUZZERS_RESET: "BUZZERS_RESET",
  ANSWER_REVEALED: "ANSWER_REVEALED",
  STRIKE: "STRIKE",
  FACE_OFF_WON: "FACE_OFF_WON",
  PLAYING: "PLAYING",
  GUESSER_CHANGED: "GUESSER_CHANGED",
  STEAL_OPPORTUNITY: "STEAL_OPPORTUNITY",
  POT_AWARDED: "POT_AWARDED",
  ROUND_ENDED: "ROUND_ENDED",
};

/** The broadcast hint is the action's direct consequence; the payload carries the rest. */
export function primaryEvent(events: RoundEvent[], fallback: GameEvent): GameEvent {
  const first = events[0];
  return first ? EVENT_NAME[first.type] : fallback;
}

export function roundContext(game: FullGame): RoundContext {
  const [a, b] = game.teams;
  if (!a || !b) throw new ConflictError("Teams have not been set");
  return { config: game.config, players: game.players, teamIds: [a.id, b.id] };
}

export function requireCurrentRound(game: FullGame): RoundData {
  const round = currentRoundOf(game);
  if (!round || game.status !== "ROUND_ACTIVE") throw new ConflictError("No round is in progress");
  return round;
}

/** Run the reducer, translating its illegal-transition errors into API conflicts. */
export function reduce(round: RoundData, action: RoundAction, ctx: RoundContext) {
  try {
    return roundReducer(round, action, ctx);
  } catch (error) {
    if (error instanceof IllegalTransitionError) throw new ConflictError(error.message);
    throw error;
  }
}

function withRound(game: FullGame, round: RoundData): FullGame {
  return { ...game, rounds: game.rounds.map((r) => (r.number === round.number ? round : r)) };
}

/** Pull the next contestant for a team via its cursor, returning the advanced team. */
function pickContestant(game: FullGame, team: Team): { playerId: string; team: Team } {
  const roster = teamRoster(game.players, team.id);
  try {
    const { player, nextCursor } = nextContestant(roster, team.nextContestantCursor);
    return { playerId: player.id, team: { ...team, nextContestantCursor: nextCursor } };
  } catch (error) {
    throw new ConflictError(`${team.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Private nudges implied by reducer events: whoever is now up gets YOU_ARE_UP. */
export function messagesFor(gameId: string, events: readonly RoundEvent[]): PlayerMessage[] {
  const upNext = [...events].reverse().find((event) => event.type === "GUESSER_CHANGED");
  return upNext && upNext.type === "GUESSER_CHANGED" ? [playerMessage(gameId, upNext.playerId, "YOU_ARE_UP")] : [];
}

/** Load, authorise, apply one reducer action to the current round and persist it. */
async function applyAction(args: Args, action: RoundAction, fallback: GameEvent): Promise<GameUpdate> {
  const gameId = requiredString(args, "gameId");
  const hostToken = requiredString(args, "hostToken");
  const game = await requireHost(gameId, hostToken);
  const round = requireCurrentRound(game);
  const { round: next, events } = reduce(round, action, roundContext(game));
  await putItem(roundItem(gameId, next));
  await publishPlayerMessages(messagesFor(gameId, events));
  return gameUpdate(withRound(game, next), primaryEvent(events, fallback));
}

/** Begin round N with survey S; auto-picks the next contestant from each team. */
export async function startRound(args: Args): Promise<GameUpdate> {
  const gameId = requiredString(args, "gameId");
  const hostToken = requiredString(args, "hostToken");
  const surveyNumber = requiredInt(args, "surveyNumber", { min: 1 });

  const game = await requireHost(gameId, hostToken);
  if (game.status !== "TEAMS_SET" && game.status !== "ROUND_ACTIVE") {
    throw new ConflictError("Rounds can only start once teams are set");
  }
  const previous = currentRoundOf(game);
  if (previous && previous.state !== "ENDED") throw new ConflictError(`Round ${previous.number} is still in progress`);
  const number = (game.currentRound ?? 0) + 1;
  if (number > game.config.roundCount) throw new ConflictError("All rounds have been played; move on to Fast Money");

  const survey = game.surveys.find((s) => s.number === surveyNumber);
  if (!survey) throw new NotFoundError(`No survey ${surveyNumber} in this game`);
  if (survey.used) throw new ValidationError(`Survey ${surveyNumber} has already been played`);

  const teams: Team[] = [];
  const contestants: Record<string, string> = {};
  for (const team of game.teams) {
    const picked = pickContestant(game, team);
    teams.push(picked.team);
    contestants[team.id] = picked.playerId;
  }
  const round = createRound(number, survey, game.config.roundMultipliers[number - 1] ?? 1, contestants);

  const table = tableName();
  const writes: TransactItems = [
    { Put: { TableName: table, Item: roundItem(gameId, round), ConditionExpression: "attribute_not_exists(pk)" } },
    ...teams.map((team) => ({ Put: { TableName: table, Item: teamItem(gameId, team) } })),
    {
      Update: {
        TableName: table,
        Key: keys.survey(gameId, surveyNumber),
        UpdateExpression: "SET used = :true",
        ExpressionAttributeValues: { ":true": true },
      },
    },
    {
      Update: {
        TableName: table,
        Key: keys.game(gameId),
        UpdateExpression: "SET #status = :active, currentRound = :number",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":active": "ROUND_ACTIVE", ":number": number },
      },
    },
  ];
  await transactWrite(writes);

  const next: FullGame = {
    ...game,
    status: "ROUND_ACTIVE",
    currentRound: number,
    teams,
    rounds: [...game.rounds, round],
    surveys: game.surveys.map((s) => (s.number === surveyNumber ? { ...s, used: true } : s)),
  };
  return gameUpdate(next, "ROUND_STARTED");
}

/** Advance a team's contestant slot past the currently picked player. */
export async function skipContestant(args: Args): Promise<GameUpdate> {
  const gameId = requiredString(args, "gameId");
  const hostToken = requiredString(args, "hostToken");
  const teamId = requiredString(args, "teamId");

  const game = await requireHost(gameId, hostToken);
  const round = requireCurrentRound(game);
  const team = game.teams.find((t) => t.id === teamId);
  if (!team) throw new NotFoundError("No such team in this game");

  const picked = pickContestant(game, team);
  const { round: next, events } = reduce(
    round,
    { type: "SET_CONTESTANT", teamId, playerId: picked.playerId },
    roundContext(game),
  );
  const table = tableName();
  await transactWrite([
    { Put: { TableName: table, Item: roundItem(gameId, next) } },
    { Put: { TableName: table, Item: teamItem(gameId, picked.team) } },
  ]);
  const teams = game.teams.map((t) => (t.id === teamId ? picked.team : t));
  return gameUpdate(withRound({ ...game, teams }, next), primaryEvent(events, "CONTESTANT_SKIPPED"));
}

export function armBuzzers(args: Args): Promise<GameUpdate> {
  return applyAction(args, { type: "ARM_BUZZERS" }, "BUZZERS_ARMED");
}

export function resetBuzzers(args: Args): Promise<GameUpdate> {
  return applyAction(args, { type: "RESET_BUZZERS" }, "BUZZERS_RESET");
}

export function revealAnswer(args: Args): Promise<GameUpdate> {
  const index = requiredInt(args, "index", { min: 0 });
  return applyAction(args, { type: "REVEAL", index }, "ANSWER_REVEALED");
}

export function strike(args: Args): Promise<GameUpdate> {
  return applyAction(args, { type: "STRIKE" }, "STRIKE");
}

export function setFaceOffWinner(args: Args): Promise<GameUpdate> {
  const teamId = requiredString(args, "teamId");
  return applyAction(args, { type: "SET_FACE_OFF_WINNER", teamId }, "FACE_OFF_WON");
}

export function choosePassOrPlay(args: Args): Promise<GameUpdate> {
  const playingTeamId = requiredString(args, "playingTeamId");
  return applyAction(args, { type: "CHOOSE_PASS_OR_PLAY", playingTeamId }, "PLAYING");
}

export function skipGuesser(args: Args): Promise<GameUpdate> {
  return applyAction(args, { type: "SKIP_GUESSER" }, "GUESSER_CHANGED");
}

/** End the round: bank the awarded pot; after the last round move to Fast Money. */
export async function endRound(args: Args): Promise<GameUpdate> {
  const gameId = requiredString(args, "gameId");
  const hostToken = requiredString(args, "hostToken");

  const game = await requireHost(gameId, hostToken);
  const round = requireCurrentRound(game);
  const { round: next } = reduce(round, { type: "END_ROUND" }, roundContext(game));

  const winner = game.teams.find((t) => t.id === next.awardedToTeamId);
  const teams = game.teams.map((t) => (winner && t.id === winner.id ? { ...t, score: t.score + next.pot } : t));
  const isLast = next.number >= game.config.roundCount;
  const status = isLast ? "FAST_MONEY" : "ROUND_ACTIVE";

  const table = tableName();
  const writes: TransactItems = [{ Put: { TableName: table, Item: roundItem(gameId, next) } }];
  if (winner) {
    writes.push({
      Update: {
        TableName: table,
        Key: keys.team(gameId, winner.id),
        UpdateExpression: "SET score = score + :pot",
        ExpressionAttributeValues: { ":pot": next.pot },
      },
    });
  }
  if (isLast) {
    writes.push({
      Update: {
        TableName: table,
        Key: keys.game(gameId),
        UpdateExpression: "SET #status = :status",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":status": status },
      },
    });
  }
  await transactWrite(writes);

  return gameUpdate(withRound({ ...game, status, teams }, next), "ROUND_ENDED");
}
