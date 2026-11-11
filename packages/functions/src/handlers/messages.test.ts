import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, ValidationError } from "../lib/errors.js";
import { keys } from "../lib/keys.js";
import { publishPlayerMessage, setMessageTransport, type PlayerMessage } from "../lib/messages.js";
import { installFakeDynamo, type FakeTable } from "../testSupport/fakeDynamo.js";
import { GAME_ID, HOST_TOKEN, player, seedFastMoneyQuestions, seedGame, smallConfig, team } from "../testSupport/fixtures.js";
import { buzz } from "./buzz.js";
import { sendPlayerMessage } from "./messages.js";
import { removePlayer } from "./roster.js";
import { armBuzzers, choosePassOrPlay, setFaceOffWinner, skipGuesser, startRound, strike } from "./round.js";

let table: FakeTable;
let sent: PlayerMessage[];
const host = { gameId: GAME_ID, hostToken: HOST_TOKEN };

beforeEach(() => {
  table = installFakeDynamo();
  sent = [];
  setMessageTransport(async (message) => {
    sent.push(message);
  });
  process.env.INTERNAL_SECRET = "internal-secret";
});

afterEach(() => {
  setMessageTransport(undefined);
  delete process.env.INTERNAL_SECRET;
});

describe("sendPlayerMessage", () => {
  it("accepts the internal secret and echoes the message for fan-out", async () => {
    const message = await sendPlayerMessage({ gameId: GAME_ID, hostToken: "internal-secret", playerId: "p1", type: "YOU_ARE_UP" });
    expect(message).toMatchObject({ gameId: GAME_ID, playerId: "p1", type: "YOU_ARE_UP", detail: null });
    expect(message.serverTime).toBeGreaterThan(0);
  });

  it("accepts the game's host token, rejects anything else and unknown types", async () => {
    seedGame(table);
    await expect(sendPlayerMessage({ ...host, playerId: "p1", type: "REMOVED", detail: "bye" })).resolves.toMatchObject({ detail: "bye" });
    await expect(sendPlayerMessage({ gameId: GAME_ID, hostToken: "nope", playerId: "p1", type: "REMOVED" })).rejects.toThrow(ForbiddenError);
    await expect(sendPlayerMessage({ ...host, playerId: "p1", type: "HELLO" })).rejects.toThrow(ValidationError);
  });
});

describe("publishPlayerMessage", () => {
  it("never throws when the transport fails", async () => {
    setMessageTransport(async () => {
      throw new Error("boom");
    });
    await expect(
      publishPlayerMessage({ gameId: GAME_ID, playerId: "p1", type: "REMOVED", detail: null, serverTime: 1 }),
    ).resolves.toBeUndefined();
  });
});

describe("message triggers", () => {
  beforeEach(async () => {
    seedGame(table, {
      meta: { status: "TEAMS_SET", config: smallConfig() },
      players: [player("a1", { teamId: "t1" }), player("a2", { teamId: "t1", order: 1 }), player("b1", { teamId: "t2" })],
      teams: [team("t1", "Team 1"), team("t2", "Team 2")],
    });
    table.seed({ ...keys.survey(GAME_ID, 1), text: "Q", answers: [{ text: "A", points: 50 }, { text: "B", points: 20 }], used: false });
    seedFastMoneyQuestions(table, 1);
    await startRound(host);
  });

  it("buzz tells both contestants who won", async () => {
    await armBuzzers(host);
    await buzz({ gameId: GAME_ID, playerId: "b1" });
    expect(sent.map((m) => [m.playerId, m.type, m.detail])).toEqual([
      ["a1", "BUZZ_RESULT", "LOST"],
      ["b1", "BUZZ_RESULT", "WON"],
    ]);
  });

  it("the current guesser gets YOU_ARE_UP as play moves along", async () => {
    await armBuzzers(host);
    await setFaceOffWinner({ ...host, teamId: "t1" });
    await choosePassOrPlay({ ...host, playingTeamId: "t1" });
    await skipGuesser(host);
    await strike(host);
    expect(sent.filter((m) => m.type === "YOU_ARE_UP").map((m) => m.playerId)).toEqual(["a2", "a1", "a2"]);
  });

  it("removing a player sends REMOVED", async () => {
    await removePlayer({ ...host, playerId: "a2" });
    expect(sent.at(-1)).toMatchObject({ playerId: "a2", type: "REMOVED" });
  });
});
