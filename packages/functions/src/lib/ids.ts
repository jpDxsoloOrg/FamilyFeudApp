import { randomBytes, randomUUID } from "node:crypto";

/** Ambiguous characters (0/O, 1/I) are excluded so codes survive being read aloud. */
const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const JOIN_CODE_LENGTH = 5;

export function newGameId(): string {
  return randomUUID();
}

export function newTeamId(): string {
  return randomUUID();
}

/** Short, human-readable code the host shares with players. */
export function newJoinCode(length: number = JOIN_CODE_LENGTH): string {
  const bytes = randomBytes(length);
  let code = "";
  for (const byte of bytes) {
    code += JOIN_CODE_ALPHABET[byte % JOIN_CODE_ALPHABET.length];
  }
  return code;
}

/** Secret returned once to the host; only its hash is stored. */
export function newHostToken(): string {
  return randomBytes(32).toString("base64url");
}
