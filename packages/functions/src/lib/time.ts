/** Server clock in epoch ms, carried on every payload for client skew correction. */
export function serverTime(): number {
  return Date.now();
}

export function nowIso(): string {
  return new Date().toISOString();
}
