// Team chat: friendly and team-scoped, no secrets or moderation. Messages live
// in their own CHAT# partition and expire after TEAM_MESSAGE_TTL_MS.
import { randomUUID } from "node:crypto";
import { TEAM_MESSAGE_MAX_LENGTH, TEAM_MESSAGE_TTL_MS, type Player } from "@familyfeud/core";
import { requiredString, type Args } from "../lib/args.js";
import { getItem, putItem, queryPrefix, type Item } from "../lib/db.js";
import { ForbiddenError, NotFoundError } from "../lib/errors.js";
import { chatPk, keys, prefixes } from "../lib/keys.js";
import { serverTime } from "../lib/time.js";

const MAX_RETURNED = 100;

export interface TeamMessage {
  gameId: string;
  teamId: string;
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  sentAt: number;
}

function toMessage(item: Item): TeamMessage {
  const { pk: _pk, sk: _sk, expiresAt: _expiresAt, ...message } = item;
  return message as unknown as TeamMessage;
}

export async function sendTeamMessage(args: Args): Promise<TeamMessage> {
  const gameId = requiredString(args, "gameId");
  const playerId = requiredString(args, "playerId");
  const text = requiredString(args, "text", { maxLength: TEAM_MESSAGE_MAX_LENGTH });

  const sender = await getItem<Item & Player>(keys.player(gameId, playerId));
  if (!sender) throw new NotFoundError("No such player");
  if (!sender.active) throw new ForbiddenError("You have been removed from this game, so you can't chat.");
  if (!sender.teamId) throw new ForbiddenError("Join a team first, then you can chat with them.");

  const sentAt = serverTime();
  const message: TeamMessage = {
    gameId,
    teamId: sender.teamId,
    id: randomUUID(),
    senderId: playerId,
    senderName: sender.displayName,
    text,
    sentAt,
  };
  await putItem({
    ...keys.teamMessage(gameId, message.teamId, sentAt, message.id),
    ...message,
    expiresAt: Math.floor((sentAt + TEAM_MESSAGE_TTL_MS) / 1000),
  });
  return message;
}

export async function teamMessages(args: Args): Promise<TeamMessage[]> {
  const gameId = requiredString(args, "gameId");
  const teamId = requiredString(args, "teamId");
  // Dynamo's TTL sweep runs late, so drop anything past its lifetime ourselves.
  const cutoff = serverTime() - TEAM_MESSAGE_TTL_MS;
  const items = await queryPrefix(chatPk(gameId, teamId), prefixes.teamMessages);
  return items
    .filter((item) => (item.sentAt as number) >= cutoff)
    .slice(-MAX_RETURNED)
    .map(toMessage);
}
