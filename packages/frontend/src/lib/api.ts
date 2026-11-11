// Task 2.7 — fetch-based GraphQL client plus every operation the app sends.
import { apiConfig } from "./config";
import type {
  ApiFastMoneyView,
  ApiGame,
  ApiGameUpdate,
  ApiHostGame,
  ApiLineup,
  ApiPlayerMessage,
  ApiTeamMessage,
  FastMoneyQuestion,
  GameConfigInput,
  Survey,
  SurveyAnswerInput,
} from "./types";

export type ApiErrorCode = "NOT_FOUND" | "FORBIDDEN" | "VALIDATION" | "CONFLICT" | "UNAUTHORIZED" | "NETWORK" | "UNKNOWN";

/**
 * AppSync reports a resolver failure as the *class name* the Lambda threw, so
 * the error class names in functions/lib/errors.ts are part of the API contract.
 */
const CODE_BY_ERROR_TYPE: Partial<Record<string, ApiErrorCode>> = {
  NotFoundError: "NOT_FOUND",
  ForbiddenError: "FORBIDDEN",
  ValidationError: "VALIDATION",
  ConflictError: "CONFLICT",
  UnauthorizedException: "UNAUTHORIZED",
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly errorType: string | undefined;

  constructor(message: string, code: ApiErrorCode, errorType?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.errorType = errorType;
  }
}

export function toApiError(cause: unknown): ApiError {
  if (cause instanceof ApiError) return cause;
  return new ApiError(cause instanceof Error ? cause.message : String(cause), "UNKNOWN");
}

interface GraphQLResponseError {
  message?: string;
  errorType?: string;
}

interface GraphQLResponse<T> {
  data?: T | null;
  errors?: GraphQLResponseError[] | null;
}

/** Send one operation and return its `data`, throwing an `ApiError` for anything else. */
export async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const { url, apiKey } = apiConfig();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ query, variables }),
    });
  } catch (cause) {
    throw new ApiError(cause instanceof Error ? cause.message : "The network request failed", "NETWORK");
  }
  if (!response.ok && response.status >= 500) {
    throw new ApiError(`The server returned ${response.status}`, "NETWORK");
  }
  let body: GraphQLResponse<T>;
  try {
    body = (await response.json()) as GraphQLResponse<T>;
  } catch {
    throw new ApiError(`The server returned an unreadable ${response.status} response`, "NETWORK");
  }
  const [first] = body.errors ?? [];
  if (first) {
    const code = first.errorType ? CODE_BY_ERROR_TYPE[first.errorType] : undefined;
    throw new ApiError(first.message ?? "The server rejected the request", code ?? "UNKNOWN", first.errorType);
  }
  if (body.data === null || body.data === undefined) {
    throw new ApiError("The server returned no data", "UNKNOWN");
  }
  return body.data;
}

/* ---------- selections ---------- */

const PLAYER_FIELDS = "id displayName teamId order active";

/** Everything a screen renders about a game. Shared by the query and the fan-out. */
export const GAME_FIELDS = `
  id joinCode status
  config { roundCount roundMultipliers strikesToSteal fastMoneyQuestionCount fastMoneyP1Seconds fastMoneyP2Seconds fastMoneyTarget }
  players { ${PLAYER_FIELDS} }
  teams { id name score players { ${PLAYER_FIELDS} } }
  currentRound {
    number multiplier state questionText
    board { index text points revealed }
    contestantPlayerIds buzzWinnerPlayerId faceOffWinnerTeamId playingTeamId currentGuesserPlayerId
    strikes pot awardedToTeamId
  }
  fastMoney { stage teamId playerIds timerEndsAt total rows { slot questionIndex answer points revealed skipped } }
`;

/**
 * AppSync delivers a subscriber only the fields the *mutation* selected, so
 * every fan-out mutation and the subscription select this same block.
 */
export const GAME_UPDATE_FIELDS = `gameId event serverTime game { ${GAME_FIELDS} }`;

/** As with game updates, subscribers get only what the mutation selected, and AppSync filters on gameId and teamId. */
export const TEAM_MESSAGE_FIELDS = "gameId teamId id senderId senderName text sentAt";

const SURVEY_FIELDS = "number text used answers { text points }";
const FM_QUESTION_FIELDS = "number text answers { text points }";
const LINEUP_FIELDS = "surveyPins fastMoneyPins surveys fastMoney";

export const ON_GAME_UPDATED = `subscription OnGameUpdated($gameId: ID!) {
  onGameUpdated(gameId: $gameId) { ${GAME_UPDATE_FIELDS} }
}`;

export const ON_PLAYER_MESSAGE = `subscription OnPlayerMessage($gameId: ID!, $playerId: ID!) {
  onPlayerMessage(gameId: $gameId, playerId: $playerId) { gameId playerId type detail serverTime }
}`;

export const ON_TEAM_MESSAGE = `subscription OnTeamMessage($gameId: ID!, $teamId: ID!) {
  onTeamMessage(gameId: $gameId, teamId: $teamId) { ${TEAM_MESSAGE_FIELDS} }
}`;

/* ---------- queries ---------- */

export async function fetchGame(gameId: string): Promise<ApiGame | null> {
  const data = await gql<{ game: ApiGame | null }>(
    `query Game($gameId: ID!) { game(gameId: $gameId) { ${GAME_FIELDS} } }`,
    { gameId },
  );
  return data.game;
}

export async function fetchHostGame(gameId: string, hostToken: string): Promise<ApiHostGame | null> {
  const data = await gql<{ hostGame: ApiHostGame | null }>(
    `query HostGame($gameId: ID!, $hostToken: String!) {
      hostGame(gameId: $gameId, hostToken: $hostToken) {
        game { ${GAME_FIELDS} }
        surveys { ${SURVEY_FIELDS} }
        fastMoneyQuestions { ${FM_QUESTION_FIELDS} }
        fastMoneyInPlay { ${FM_QUESTION_FIELDS} }
        lineup { ${LINEUP_FIELDS} }
        currentBoard { index text points revealed }
        currentQuestion
        fastMoneyAnswers { slot questionIndex answer skipped likelyDuplicate matchedIndex points revealed }
      }
    }`,
    { gameId, hostToken },
  );
  return data.hostGame;
}

/* ---------- lobby ---------- */

export async function createGame(config?: GameConfigInput): Promise<{ game: ApiGame; hostToken: string }> {
  const data = await gql<{ createGame: { game: ApiGame; hostToken: string } }>(
    `mutation CreateGame($config: GameConfigInput) { createGame(config: $config) { hostToken game { ${GAME_FIELDS} } } }`,
    { config: config ?? null },
  );
  return data.createGame;
}

export async function joinGame(joinCode: string, playerId: string, displayName: string): Promise<ApiGameUpdate> {
  const data = await gql<{ joinGame: ApiGameUpdate }>(
    `mutation JoinGame($joinCode: String!, $playerId: ID!, $displayName: String!) {
      joinGame(joinCode: $joinCode, playerId: $playerId, displayName: $displayName) { ${GAME_UPDATE_FIELDS} }
    }`,
    { joinCode, playerId, displayName },
  );
  return data.joinGame;
}

/** Host mutations all take (gameId, hostToken, ...) and return a GameUpdate. */
async function hostMutation(
  name: string,
  argDefs: string,
  argUses: string,
  variables: Record<string, unknown>,
): Promise<ApiGameUpdate> {
  const data = await gql<Record<string, ApiGameUpdate>>(
    `mutation ${name[0].toUpperCase()}${name.slice(1)}($gameId: ID!, $hostToken: String!${argDefs}) {
      ${name}(gameId: $gameId, hostToken: $hostToken${argUses}) { ${GAME_UPDATE_FIELDS} }
    }`,
    variables,
  );
  return data[name];
}

export function updateConfig(gameId: string, hostToken: string, config: GameConfigInput): Promise<ApiGameUpdate> {
  return hostMutation("updateConfig", ", $config: GameConfigInput!", ", config: $config", { gameId, hostToken, config });
}

export function randomizeTeams(gameId: string, hostToken: string): Promise<ApiGameUpdate> {
  return hostMutation("randomizeTeams", "", "", { gameId, hostToken });
}

export function setTeamName(gameId: string, hostToken: string, teamId: string, name: string): Promise<ApiGameUpdate> {
  return hostMutation("setTeamName", ", $teamId: ID!, $name: String!", ", teamId: $teamId, name: $name", {
    gameId,
    hostToken,
    teamId,
    name,
  });
}

/* ---------- roster ---------- */

export function assignPlayer(gameId: string, hostToken: string, playerId: string, teamId: string): Promise<ApiGameUpdate> {
  return hostMutation("assignPlayer", ", $playerId: ID!, $teamId: ID!", ", playerId: $playerId, teamId: $teamId", {
    gameId,
    hostToken,
    playerId,
    teamId,
  });
}

export function reorderPlayer(gameId: string, hostToken: string, playerId: string, newOrder: number): Promise<ApiGameUpdate> {
  return hostMutation("reorderPlayer", ", $playerId: ID!, $newOrder: Int!", ", playerId: $playerId, newOrder: $newOrder", {
    gameId,
    hostToken,
    playerId,
    newOrder,
  });
}

export function removePlayer(gameId: string, hostToken: string, playerId: string): Promise<ApiGameUpdate> {
  return hostMutation("removePlayer", ", $playerId: ID!", ", playerId: $playerId", { gameId, hostToken, playerId });
}

export function restorePlayer(gameId: string, hostToken: string, playerId: string): Promise<ApiGameUpdate> {
  return hostMutation("restorePlayer", ", $playerId: ID!", ", playerId: $playerId", { gameId, hostToken, playerId });
}

/* ---------- round ---------- */

/** Start the next round; the server picks the survey from the lineup (drawn when round 1 starts). */
export function startRound(gameId: string, hostToken: string): Promise<ApiGameUpdate> {
  return hostMutation("startRound", "", "", { gameId, hostToken });
}

/** Pin questions to round / Fast Money slots; null leaves a slot random. */
export async function setLineupPins(
  gameId: string,
  hostToken: string,
  surveys: (number | null)[],
  fastMoney: (number | null)[],
): Promise<ApiLineup> {
  const data = await gql<{ setLineupPins: ApiLineup }>(
    `mutation SetLineupPins($gameId: ID!, $hostToken: String!, $surveys: [Int]!, $fastMoney: [Int]!) {
      setLineupPins(gameId: $gameId, hostToken: $hostToken, surveys: $surveys, fastMoney: $fastMoney) { ${LINEUP_FIELDS} }
    }`,
    { gameId, hostToken, surveys, fastMoney },
  );
  return data.setLineupPins;
}

export function skipContestant(gameId: string, hostToken: string, teamId: string): Promise<ApiGameUpdate> {
  return hostMutation("skipContestant", ", $teamId: ID!", ", teamId: $teamId", { gameId, hostToken, teamId });
}

export function armBuzzers(gameId: string, hostToken: string): Promise<ApiGameUpdate> {
  return hostMutation("armBuzzers", "", "", { gameId, hostToken });
}

export function resetBuzzers(gameId: string, hostToken: string): Promise<ApiGameUpdate> {
  return hostMutation("resetBuzzers", "", "", { gameId, hostToken });
}

export function revealAnswer(gameId: string, hostToken: string, index: number): Promise<ApiGameUpdate> {
  return hostMutation("revealAnswer", ", $index: Int!", ", index: $index", { gameId, hostToken, index });
}

export function strike(gameId: string, hostToken: string): Promise<ApiGameUpdate> {
  return hostMutation("strike", "", "", { gameId, hostToken });
}

export function setFaceOffWinner(gameId: string, hostToken: string, teamId: string): Promise<ApiGameUpdate> {
  return hostMutation("setFaceOffWinner", ", $teamId: ID!", ", teamId: $teamId", { gameId, hostToken, teamId });
}

export function choosePassOrPlay(gameId: string, hostToken: string, playingTeamId: string): Promise<ApiGameUpdate> {
  return hostMutation("choosePassOrPlay", ", $playingTeamId: ID!", ", playingTeamId: $playingTeamId", { gameId, hostToken, playingTeamId });
}

export function skipGuesser(gameId: string, hostToken: string): Promise<ApiGameUpdate> {
  return hostMutation("skipGuesser", "", "", { gameId, hostToken });
}

export function endRound(gameId: string, hostToken: string): Promise<ApiGameUpdate> {
  return hostMutation("endRound", "", "", { gameId, hostToken });
}

export function undoRoundAction(gameId: string, hostToken: string): Promise<ApiGameUpdate> {
  return hostMutation("undoRoundAction", "", "", { gameId, hostToken });
}

export async function buzz(gameId: string, playerId: string): Promise<ApiGameUpdate> {
  const data = await gql<{ buzz: ApiGameUpdate }>(
    `mutation Buzz($gameId: ID!, $playerId: ID!) { buzz(gameId: $gameId, playerId: $playerId) { ${GAME_UPDATE_FIELDS} } }`,
    { gameId, playerId },
  );
  return data.buzz;
}

/* ---------- fast money ---------- */

const FM_VIEW_FIELDS = "slot timerEndsAt serverTime answered total queue { questionIndex text }";

export async function fetchFastMoneyView(gameId: string, playerId: string): Promise<ApiFastMoneyView | null> {
  const data = await gql<{ fastMoneyView: ApiFastMoneyView | null }>(
    `query FastMoneyView($gameId: ID!, $playerId: ID!) { fastMoneyView(gameId: $gameId, playerId: $playerId) { ${FM_VIEW_FIELDS} } }`,
    { gameId, playerId },
  );
  return data.fastMoneyView;
}

export function selectFastMoneyPlayers(gameId: string, hostToken: string, teamId: string, playerIds: string[]): Promise<ApiGameUpdate> {
  return hostMutation("selectFastMoneyPlayers", ", $teamId: ID!, $playerIds: [ID!]!", ", teamId: $teamId, playerIds: $playerIds", { gameId, hostToken, teamId, playerIds });
}

export function startFastMoneyTurn(gameId: string, hostToken: string, slot: number): Promise<ApiGameUpdate> {
  return hostMutation("startFastMoneyTurn", ", $slot: Int!", ", slot: $slot", { gameId, hostToken, slot });
}

export function endFastMoneyTurn(gameId: string, hostToken: string): Promise<ApiGameUpdate> {
  return hostMutation("endFastMoneyTurn", "", "", { gameId, hostToken });
}

export function revealFastMoneyAnswer(gameId: string, hostToken: string, slot: number, questionIndex: number, matchedIndex: number | null): Promise<ApiGameUpdate> {
  return hostMutation("revealFastMoneyAnswer", ", $slot: Int!, $questionIndex: Int!, $matchedIndex: Int", ", slot: $slot, questionIndex: $questionIndex, matchedIndex: $matchedIndex", { gameId, hostToken, slot, questionIndex, matchedIndex });
}

export function finishGame(gameId: string, hostToken: string): Promise<ApiGameUpdate> {
  return hostMutation("finishGame", "", "", { gameId, hostToken });
}

export async function buzzDuplicate(gameId: string, hostToken: string, questionIndex: number): Promise<ApiPlayerMessage> {
  const data = await gql<{ buzzDuplicate: ApiPlayerMessage }>(
    `mutation BuzzDuplicate($gameId: ID!, $hostToken: String!, $questionIndex: Int!) {
      buzzDuplicate(gameId: $gameId, hostToken: $hostToken, questionIndex: $questionIndex) { gameId playerId type detail serverTime }
    }`,
    { gameId, hostToken, questionIndex },
  );
  return data.buzzDuplicate;
}

export async function submitFastMoneyAnswer(gameId: string, playerId: string, questionIndex: number, answer: string): Promise<ApiFastMoneyView> {
  const data = await gql<{ submitFastMoneyAnswer: ApiFastMoneyView }>(
    `mutation SubmitFastMoneyAnswer($gameId: ID!, $playerId: ID!, $questionIndex: Int!, $answer: String!) {
      submitFastMoneyAnswer(gameId: $gameId, playerId: $playerId, questionIndex: $questionIndex, answer: $answer) { ${FM_VIEW_FIELDS} }
    }`,
    { gameId, playerId, questionIndex, answer },
  );
  return data.submitFastMoneyAnswer;
}

export async function skipFastMoneyQuestion(gameId: string, playerId: string, questionIndex: number): Promise<ApiFastMoneyView> {
  const data = await gql<{ skipFastMoneyQuestion: ApiFastMoneyView }>(
    `mutation SkipFastMoneyQuestion($gameId: ID!, $playerId: ID!, $questionIndex: Int!) {
      skipFastMoneyQuestion(gameId: $gameId, playerId: $playerId, questionIndex: $questionIndex) { ${FM_VIEW_FIELDS} }
    }`,
    { gameId, playerId, questionIndex },
  );
  return data.skipFastMoneyQuestion;
}

/* ---------- team chat ---------- */

export async function fetchTeamMessages(gameId: string, teamId: string): Promise<ApiTeamMessage[]> {
  const data = await gql<{ teamMessages: ApiTeamMessage[] }>(
    `query TeamMessages($gameId: ID!, $teamId: ID!) { teamMessages(gameId: $gameId, teamId: $teamId) { ${TEAM_MESSAGE_FIELDS} } }`,
    { gameId, teamId },
  );
  return data.teamMessages;
}

export async function sendTeamMessage(gameId: string, playerId: string, text: string): Promise<ApiTeamMessage> {
  const data = await gql<{ sendTeamMessage: ApiTeamMessage }>(
    `mutation SendTeamMessage($gameId: ID!, $playerId: ID!, $text: String!) {
      sendTeamMessage(gameId: $gameId, playerId: $playerId, text: $text) { ${TEAM_MESSAGE_FIELDS} }
    }`,
    { gameId, playerId, text },
  );
  return data.sendTeamMessage;
}

/* ---------- authoring ---------- */

export async function upsertSurvey(
  gameId: string,
  hostToken: string,
  number: number,
  text: string,
  answers: SurveyAnswerInput[],
): Promise<Survey> {
  const data = await gql<{ upsertSurvey: Survey }>(
    `mutation UpsertSurvey($gameId: ID!, $hostToken: String!, $number: Int!, $text: String!, $answers: [SurveyAnswerInput!]!) {
      upsertSurvey(gameId: $gameId, hostToken: $hostToken, number: $number, text: $text, answers: $answers) { ${SURVEY_FIELDS} }
    }`,
    { gameId, hostToken, number, text, answers },
  );
  return data.upsertSurvey;
}

export async function deleteSurvey(gameId: string, hostToken: string, number: number): Promise<boolean> {
  const data = await gql<{ deleteSurvey: boolean }>(
    `mutation DeleteSurvey($gameId: ID!, $hostToken: String!, $number: Int!) {
      deleteSurvey(gameId: $gameId, hostToken: $hostToken, number: $number)
    }`,
    { gameId, hostToken, number },
  );
  return data.deleteSurvey;
}

export async function upsertFastMoneyQuestion(
  gameId: string,
  hostToken: string,
  number: number,
  text: string,
  answers: SurveyAnswerInput[],
): Promise<FastMoneyQuestion> {
  const data = await gql<{ upsertFastMoneyQuestion: FastMoneyQuestion }>(
    `mutation UpsertFastMoneyQuestion($gameId: ID!, $hostToken: String!, $number: Int!, $text: String!, $answers: [SurveyAnswerInput!]!) {
      upsertFastMoneyQuestion(gameId: $gameId, hostToken: $hostToken, number: $number, text: $text, answers: $answers) { ${FM_QUESTION_FIELDS} }
    }`,
    { gameId, hostToken, number, text, answers },
  );
  return data.upsertFastMoneyQuestion;
}

export async function deleteFastMoneyQuestion(gameId: string, hostToken: string, number: number): Promise<boolean> {
  const data = await gql<{ deleteFastMoneyQuestion: boolean }>(
    `mutation DeleteFastMoneyQuestion($gameId: ID!, $hostToken: String!, $number: Int!) {
      deleteFastMoneyQuestion(gameId: $gameId, hostToken: $hostToken, number: $number)
    }`,
    { gameId, hostToken, number },
  );
  return data.deleteFastMoneyQuestion;
}
