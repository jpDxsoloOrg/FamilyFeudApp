import { beforeEach, describe, expect, it } from "vitest";
import { TEAM_MESSAGE_MAX_LENGTH, TEAM_MESSAGE_TTL_MS } from "@familyfeud/core";
import { ForbiddenError, NotFoundError, ValidationError } from "../lib/errors.js";
import { keys } from "../lib/keys.js";
import { installFakeDynamo, type FakeTable } from "../testSupport/fakeDynamo.js";
import { GAME_ID, player, seedGame, team } from "../testSupport/fixtures.js";
import { sendTeamMessage, teamMessages } from "./chat.js";

let table: FakeTable;

beforeEach(() => {
  table = installFakeDynamo();
  seedGame(table, {
    meta: { status: "TEAMS_SET" },
    players: [
      player("a1", { teamId: "t1", displayName: "Ann" }),
      player("b1", { teamId: "t2", displayName: "Bob" }),
      player("gone", { teamId: "t1", active: false }),
      player("new", { teamId: null }),
    ],
    teams: [team("t1", "Team 1"), team("t2", "Team 2")],
  });
});

const send = (playerId: string, text: string) => sendTeamMessage({ gameId: GAME_ID, playerId, text });
const read = (teamId: string) => teamMessages({ gameId: GAME_ID, teamId });

function seedMessage(id: string, sentAt: number): void {
  table.seed({
    ...keys.teamMessage(GAME_ID, "t1", sentAt, id),
    gameId: GAME_ID,
    teamId: "t1",
    id,
    senderId: "a1",
    senderName: "Ann",
    text: id,
    sentAt,
    expiresAt: Math.floor((sentAt + TEAM_MESSAGE_TTL_MS) / 1000),
  });
}

describe("sendTeamMessage", () => {
  it("returns the message and reads it back, taking the team from the player row", async () => {
    const sent = await send("a1", "hello");
    expect(sent).toMatchObject({ gameId: GAME_ID, teamId: "t1", senderId: "a1", senderName: "Ann", text: "hello" });
    expect(Object.keys(sent).sort()).toEqual(["gameId", "id", "senderId", "senderName", "sentAt", "teamId", "text"]);
    expect(await read("t1")).toEqual([sent]);
  });

  it("stores an epoch-seconds expiry one TTL after sending", async () => {
    const sent = await send("a1", "hi");
    const stored = table.all().find((item) => item.id === sent.id);
    expect(stored?.expiresAt).toBe(Math.floor((sent.sentAt + TEAM_MESSAGE_TTL_MS) / 1000));
  });

  it("trims the text", async () => {
    expect((await send("a1", "  hi there \n")).text).toBe("hi there");
  });

  it("rejects empty and over-long text", async () => {
    await expect(send("a1", "   ")).rejects.toThrow(ValidationError);
    await expect(send("a1", "x".repeat(TEAM_MESSAGE_MAX_LENGTH + 1))).rejects.toThrow(ValidationError);
    await expect(send("a1", "x".repeat(TEAM_MESSAGE_MAX_LENGTH))).resolves.toBeDefined();
  });

  it("rejects an unknown player", async () => {
    await expect(send("nobody", "hi")).rejects.toThrow(NotFoundError);
  });

  it("rejects an inactive player and an unassigned one", async () => {
    await expect(send("gone", "hi")).rejects.toThrow(ForbiddenError);
    await expect(send("new", "hi")).rejects.toThrow(ForbiddenError);
  });

  it("leaves the GAME# partition untouched", async () => {
    const before = table.all().filter((item) => item.pk === `GAME#${GAME_ID}`);
    await send("a1", "hi");
    expect(table.all().filter((item) => item.pk === `GAME#${GAME_ID}`)).toEqual(before);
    expect(table.all().some((item) => item.pk === `CHAT#${GAME_ID}#t1`)).toBe(true);
  });
});

describe("teamMessages", () => {
  it("does not return another team's messages", async () => {
    await send("a1", "ours");
    await send("b1", "theirs");
    expect((await read("t1")).map((m) => m.text)).toEqual(["ours"]);
    expect((await read("t2")).map((m) => m.text)).toEqual(["theirs"]);
  });

  it("filters out expired messages", async () => {
    const now = Date.now();
    seedMessage("old", now - TEAM_MESSAGE_TTL_MS - 1000);
    seedMessage("fresh", now - 1000);
    expect((await read("t1")).map((m) => m.id)).toEqual(["fresh"]);
  });

  it("returns the newest 100, oldest first, without storage fields", async () => {
    const base = Date.now() - 100_000;
    for (let i = 0; i < 105; i++) seedMessage(`m${i}`, base + i);
    const messages = await read("t1");
    expect(messages).toHaveLength(100);
    expect(messages[0].id).toBe("m5");
    expect(messages[99].id).toBe("m104");
    expect(messages[0]).not.toHaveProperty("pk");
    expect(messages[0]).not.toHaveProperty("expiresAt");
  });
});
