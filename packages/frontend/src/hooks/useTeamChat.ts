/**
 * One team's chat, kept current: a read, then live `onTeamMessage` events on
 * their own socket. Nothing here polls; a phone that slept catches up on the
 * next `live`, `online` or return to the tab.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { mergeMessages, TEAM_MESSAGE_TTL_MS } from "@familyfeud/core";
import { fetchTeamMessages, ON_TEAM_MESSAGE } from "../lib/api";
import { subscribe } from "../lib/realtime";
import type { ApiTeamMessage } from "../lib/types";

export interface UseTeamChatResult {
  messages: ApiTeamMessage[];
  /** Show a message right away (e.g. a send's own response) without waiting for the fan-out. */
  addMessage: (message: ApiTeamMessage) => void;
}

export function useTeamChat(gameId: string, teamId: string, clockOffset: number): UseTeamChatResult {
  const [messages, setMessages] = useState<ApiTeamMessage[]>([]);
  const offset = useRef(clockOffset);
  offset.current = clockOffset;

  const merge = useCallback((incoming: ApiTeamMessage[]) => {
    setMessages((current) => mergeMessages(current, incoming, Date.now() + offset.current));
  }, []);

  useEffect(() => {
    setMessages([]);
    let stopped = false;
    const refresh = (): void => {
      fetchTeamMessages(gameId, teamId)
        .then((next) => {
          if (!stopped) merge(next);
        })
        .catch(() => undefined);
    };
    const onVisible = (): void => {
      if (document.visibilityState === "visible") refresh();
    };

    refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refresh);
    const unsubscribe = subscribe<{ onTeamMessage: ApiTeamMessage | null }>({
      query: ON_TEAM_MESSAGE,
      variables: { gameId, teamId },
      onData: (data) => {
        if (data.onTeamMessage) merge([data.onTeamMessage]);
      },
      onStatusChange: (status) => {
        if (status === "live") refresh();
      },
    });
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
      unsubscribe();
    };
  }, [gameId, teamId, merge]);

  // Messages expire on their own; wake once for the oldest rather than ticking.
  useEffect(() => {
    const [oldest] = messages;
    if (!oldest) return;
    const wait = oldest.sentAt + TEAM_MESSAGE_TTL_MS - (Date.now() + offset.current);
    const timer = window.setTimeout(() => merge([]), Math.max(wait, 0));
    return () => window.clearTimeout(timer);
  }, [messages, merge]);

  const addMessage = useCallback((message: ApiTeamMessage) => merge([message]), [merge]);

  return { messages, addMessage };
}
