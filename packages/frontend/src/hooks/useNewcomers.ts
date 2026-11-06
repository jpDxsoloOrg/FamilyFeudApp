/** Who arrived after this screen first drew, so only they get an entrance. */
import { useRef } from "react";
import type { Player } from "../lib/types";

export function useNewcomers(players: Player[]): (playerId: string) => boolean {
  const original = useRef<ReadonlySet<string>>(new Set(players.map((player) => player.id)));
  return (playerId) => !original.current.has(playerId);
}
