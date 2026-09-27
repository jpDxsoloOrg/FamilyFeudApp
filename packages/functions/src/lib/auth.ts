// Task 2.1 — host token hashing + verification.
import { createHash, timingSafeEqual } from "node:crypto";
import { ForbiddenError, NotFoundError } from "./errors.js";
import { loadGame, type FullGame } from "./gameState.js";

/** SHA-256 hex of the token; the raw token is never persisted. */
export function hashHostToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time comparison of a presented token against the stored hash. */
export function verifyHostToken(token: string, storedHash: string): boolean {
  const presented = Buffer.from(hashHostToken(token), "hex");
  let stored: Buffer;
  try {
    stored = Buffer.from(storedHash, "hex");
  } catch {
    return false;
  }
  if (presented.length !== stored.length) return false;
  return timingSafeEqual(presented, stored);
}

export function assertHost(token: string | undefined, storedHash: string | undefined): void {
  if (!token || !storedHash || !verifyHostToken(token, storedHash)) {
    throw new ForbiddenError("Invalid host token");
  }
}

/**
 * Load the game and prove the caller is its host. Every host-only handler starts
 * here; returning the loaded game saves a second read.
 */
export async function requireHost(gameId: string, hostToken: string): Promise<FullGame> {
  const game = await loadGame(gameId);
  if (!game) throw new NotFoundError("No such game");
  assertHost(hostToken, game.hostTokenHash);
  return game;
}
