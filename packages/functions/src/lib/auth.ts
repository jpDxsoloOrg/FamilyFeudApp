// Task 2.1 — host token hashing + verification.
export async function hashHostToken(_token: string): Promise<string> {
  throw new Error("Not implemented: hashHostToken (Task 2.1)");
}

/** Throws if the token does not match the stored hash on the game record. */
export async function requireHost(_gameId: string, _hostToken: string): Promise<void> {
  throw new Error("Not implemented: requireHost (Task 2.1)");
}
