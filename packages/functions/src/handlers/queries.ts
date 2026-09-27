// Tasks 2.2, 2.4, 4.3 — see PLAN.md.
import { requiredString, type Args } from "../lib/args.js";
import { loadGame } from "../lib/gameState.js";
import { toPublicGame, type GameView } from "../lib/views.js";

/** `Query.game` — public, player-safe view. Nullable: a missing game is null, not an error. */
export async function game(args: Args): Promise<GameView | null> {
  const gameId = requiredString(args, "gameId");
  const full = await loadGame(gameId);
  return full ? toPublicGame(full) : null;
}

export async function hostGame(_args: Args): Promise<unknown> {
  throw new Error("Not implemented: hostGame (Tasks 2.2, 2.4, 4.3)");
}

export async function fastMoneyView(_args: Args): Promise<unknown> {
  throw new Error("Not implemented: fastMoneyView (Tasks 2.2, 2.4, 4.3)");
}
