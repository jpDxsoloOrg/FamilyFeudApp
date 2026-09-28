// Tasks 2.2, 2.4, 4.3 — see PLAN.md.
import { requiredString, type Args } from "../lib/args.js";
import { requireHost } from "../lib/auth.js";
import { loadGame } from "../lib/gameState.js";
import { toHostGame, toPublicGame, type GameView, type HostGameView } from "../lib/views.js";

/** `Query.game` — public, player-safe view. Nullable: a missing game is null, not an error. */
export async function game(args: Args): Promise<GameView | null> {
  const gameId = requiredString(args, "gameId");
  const full = await loadGame(gameId);
  return full ? toPublicGame(full) : null;
}

/** `Query.hostGame` — full surveys, full board, Fast Money answers. Host token required. */
export async function hostGame(args: Args): Promise<HostGameView> {
  const gameId = requiredString(args, "gameId");
  const hostToken = requiredString(args, "hostToken");
  return toHostGame(await requireHost(gameId, hostToken));
}
