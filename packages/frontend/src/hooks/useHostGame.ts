/**
 * The game as its host sees it: the live public game from `useGame` plus the
 * hidden host data (surveys, Fast Money questions, full board) from `hostGame`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchHostGame, toApiError, type ApiError } from "../lib/api";
import { getHostToken } from "../lib/identity";
import type { ApiHostGame } from "../lib/types";
import { useGame, type UseGameResult } from "./useGame";

export type HostData = Omit<ApiHostGame, "game">;

/** Events after which the host's hidden data (board, Fast Money answers) may have changed. */
const LOBBY_EVENTS = new Set(["PLAYER_JOINED", "CONFIG_UPDATED", "TEAMS_SET", "TEAM_RENAMED", "ROSTER_CHANGED"]);

export interface UseHostGameResult extends UseGameResult {
  hostToken: string | null;
  /** False means this browser did not create the game; screens should refuse to render. */
  isHost: boolean;
  host: HostData | undefined;
  hostError: ApiError | undefined;
  /** Merge locally-known host data (e.g. a saved survey) without a round trip. */
  patchHost: (patch: Partial<HostData> | ((current: HostData) => HostData)) => void;
  refreshHost: () => void;
}

const EMPTY_HOST: HostData = { surveys: [], fastMoneyQuestions: [], currentBoard: [], currentQuestion: null, fastMoneyAnswers: [] };

export function useHostGame(gameId: string | undefined): UseHostGameResult {
  const hostToken = useMemo(() => (gameId ? getHostToken(gameId) : null), [gameId]);
  const live = useGame(hostToken ? gameId : undefined);
  const [host, setHost] = useState<HostData | undefined>();
  const [hostError, setHostError] = useState<ApiError | undefined>();

  const refreshHost = useCallback(() => {
    if (!gameId || !hostToken) return;
    fetchHostGame(gameId, hostToken)
      .then((data) => {
        if (!data) return;
        const { game: _game, ...rest } = data;
        setHost(rest);
        setHostError(undefined);
      })
      .catch((cause: unknown) => setHostError(toApiError(cause)));
  }, [gameId, hostToken]);

  useEffect(() => {
    refreshHost();
  }, [refreshHost]);

  const lastEvent = live.lastEvent;
  useEffect(() => {
    if (lastEvent && !LOBBY_EVENTS.has(lastEvent.event)) refreshHost();
  }, [lastEvent, refreshHost]);

  const patchHost = useCallback((patch: Partial<HostData> | ((current: HostData) => HostData)) => {
    setHost((current) => {
      const base = current ?? EMPTY_HOST;
      return typeof patch === "function" ? patch(base) : { ...base, ...patch };
    });
  }, []);

  return { ...live, hostToken, isHost: hostToken !== null, host, hostError, patchHost, refreshHost };
}
