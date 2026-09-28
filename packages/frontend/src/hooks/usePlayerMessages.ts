/**
 * The private channel: messages addressed to this player only (YOU_ARE_UP,
 * BUZZ_RESULT, FAST_MONEY_DUPLICATE, REMOVED). AppSync filters delivery on the
 * payload's gameId + playerId, so nothing here needs re-checking.
 */
import { useEffect, useState } from "react";
import { ON_PLAYER_MESSAGE } from "../lib/api";
import { subscribe, type RealtimeStatus } from "../lib/realtime";
import type { ApiPlayerMessage } from "../lib/types";

export interface UsePlayerMessagesResult {
  /** The latest message; screens react to `serverTime` changing, not just `type`. */
  last: ApiPlayerMessage | undefined;
  realtime: RealtimeStatus;
  /** Forget the latest message once it has been acted on. */
  dismiss: () => void;
}

export function usePlayerMessages(gameId: string | undefined, playerId: string | undefined): UsePlayerMessagesResult {
  const [last, setLast] = useState<ApiPlayerMessage | undefined>();
  const [realtime, setRealtime] = useState<RealtimeStatus>("connecting");

  useEffect(() => {
    if (!gameId || !playerId) return;
    return subscribe<{ onPlayerMessage: ApiPlayerMessage | null }>({
      query: ON_PLAYER_MESSAGE,
      variables: { gameId, playerId },
      onData: (data) => {
        if (data.onPlayerMessage) setLast(data.onPlayerMessage);
      },
      onStatusChange: setRealtime,
    });
  }, [gameId, playerId]);

  return { last, realtime, dismiss: () => setLast(undefined) };
}
