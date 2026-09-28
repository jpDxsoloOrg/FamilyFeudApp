/**
 * One game, kept current: an initial read, then live `onGameUpdated` events,
 * and a re-read whenever the socket comes back after a drop.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, fetchGame, ON_GAME_UPDATED, toApiError } from "../lib/api";
import { subscribe, type RealtimeStatus } from "../lib/realtime";
import type { ApiGame, ApiGameUpdate } from "../lib/types";

export interface UseGameResult {
  game: ApiGame | undefined;
  /** The most recent broadcast, for screens that react to a specific event. */
  lastEvent: ApiGameUpdate | undefined;
  realtime: RealtimeStatus;
  /** `serverTime - Date.now()` from the last payload; add to a local clock to get server time. */
  clockOffset: number;
  loading: boolean;
  error: ApiError | undefined;
  /** Replace the local snapshot (e.g. with a mutation's own response) without waiting for the fan-out. */
  applyUpdate: (update: ApiGameUpdate) => void;
  refresh: () => void;
}

export function useGame(gameId: string | undefined): UseGameResult {
  const [game, setGame] = useState<ApiGame | undefined>();
  const [lastEvent, setLastEvent] = useState<ApiGameUpdate | undefined>();
  const [realtime, setRealtime] = useState<RealtimeStatus>("connecting");
  const [clockOffset, setClockOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();

  /**
   * Bumped by every applied event. A read that started before an event landed
   * is older than what we have, however late it resolves, so it is discarded.
   */
  const revision = useRef(0);
  const cancelled = useRef(false);

  const applyUpdate = useCallback((update: ApiGameUpdate) => {
    revision.current += 1;
    setLastEvent(update);
    setClockOffset(update.serverTime - Date.now());
    setGame(update.game);
  }, []);

  const refresh = useCallback(() => {
    if (!gameId) return;
    const startedAt = revision.current;
    setLoading(true);
    fetchGame(gameId)
      .then((next) => {
        if (cancelled.current) return;
        setError(undefined);
        if (revision.current !== startedAt) return; // An event overtook us.
        setGame(next ?? undefined);
      })
      .catch((cause: unknown) => {
        if (!cancelled.current) setError(toApiError(cause));
      })
      .finally(() => {
        if (!cancelled.current) setLoading(false);
      });
  }, [gameId]);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  useEffect(() => {
    if (!gameId) {
      setLoading(false);
      return;
    }
    refresh();
  }, [gameId, refresh]);

  // A phone that slept or a laptop that lost wifi may have missed events the
  // socket never noticed; a re-read on return is cheap insurance.
  useEffect(() => {
    if (!gameId) return;
    const onVisible = (): void => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refresh);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
    };
  }, [gameId, refresh]);

  useEffect(() => {
    if (!gameId) return;
    let hasBeenLive = false;
    return subscribe<{ onGameUpdated: ApiGameUpdate | null }>({
      query: ON_GAME_UPDATED,
      variables: { gameId },
      onData: (data) => {
        if (data.onGameUpdated) applyUpdate(data.onGameUpdated);
      },
      onStatusChange: (status) => {
        setRealtime(status);
        if (status !== "live") return;
        // A second `live` means a gap of events we never saw; re-read to close it.
        if (hasBeenLive) refresh();
        hasBeenLive = true;
      },
    });
  }, [gameId, refresh, applyUpdate]);

  return { game, lastEvent, realtime, clockOffset, loading, error, applyUpdate, refresh };
}
