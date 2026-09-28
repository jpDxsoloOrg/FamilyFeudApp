// Task 3.5 — `sendPlayerMessage`: the mutation whose return value AppSync fans
// out to `onPlayerMessage(gameId, playerId)` subscribers.
import { timingSafeEqual } from "node:crypto";
import type { PlayerMessageType } from "@familyfeud/core";
import { optionalString, requiredString, type Args } from "../lib/args.js";
import { verifyHostToken } from "../lib/auth.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../lib/errors.js";
import { loadGameMeta } from "../lib/gameState.js";
import { internalSecret, playerMessage, type PlayerMessage } from "../lib/messages.js";

const MESSAGE_TYPES: readonly PlayerMessageType[] = ["YOU_ARE_UP", "BUZZ_RESULT", "FAST_MONEY_DUPLICATE", "REMOVED"];
const MAX_DETAIL_LENGTH = 200;

function isInternalCall(token: string): boolean {
  const secret = internalSecret();
  if (!secret) return false;
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(secret, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Authorised by the Lambda's own INTERNAL_SECRET (the normal path) or by the
 * game's host token (so a host console could, in principle, nudge a player).
 */
export async function sendPlayerMessage(args: Args): Promise<PlayerMessage> {
  const gameId = requiredString(args, "gameId");
  const hostToken = requiredString(args, "hostToken");
  const playerId = requiredString(args, "playerId");
  const rawType = requiredString(args, "type");
  const detail = optionalString(args, "detail", { maxLength: MAX_DETAIL_LENGTH }) ?? null;

  const type = MESSAGE_TYPES.find((candidate) => candidate === rawType);
  if (!type) throw new ValidationError(`Unknown message type "${rawType}"`);

  if (!isInternalCall(hostToken)) {
    const meta = await loadGameMeta(gameId);
    if (!meta) throw new NotFoundError("No such game");
    if (!verifyHostToken(hostToken, meta.hostTokenHash)) throw new ForbiddenError("Invalid host token");
  }
  return playerMessage(gameId, playerId, type, detail);
}
