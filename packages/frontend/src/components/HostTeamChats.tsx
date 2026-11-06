// Host's read-only view of every team's chat. There is no way to send from here.
import { TEAM_MESSAGE_TTL_MS, unreadCount } from "@familyfeud/core";
import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTeamChat } from "../hooks/useTeamChat";
import type { ApiTeam } from "../lib/types";
import { MessageList } from "./TeamChat";

interface Props {
  gameId: string;
  teams: ApiTeam[];
  clockOffset: number;
  /** On screen, so what arrives counts as read. */
  visible: boolean;
  onUnread: (total: number) => void;
  onClose: () => void;
}

interface ColumnProps {
  gameId: string;
  team: ApiTeam;
  clockOffset: number;
  visible: boolean;
  side: "a" | "b";
  onUnread: (teamId: string, count: number) => void;
}

const TTL_MINUTES = TEAM_MESSAGE_TTL_MS / 60_000;

function TeamColumn({ gameId, team, clockOffset, visible, side, onUnread }: ColumnProps) {
  const { messages } = useTeamChat(gameId, team.id, clockOffset);
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());
  const unread = useMemo(() => unreadCount(messages, seen, ""), [messages, seen]);

  useEffect(() => {
    if (visible) setSeen(new Set(messages.map((message) => message.id)));
  }, [visible, messages]);

  useEffect(() => onUnread(team.id, unread), [onUnread, team.id, unread]);

  return (
    <div className={`hx-chats__team hx-edge--${side}`}>
      <h3>{team.name}</h3>
      <MessageList messages={messages} emptyText="No messages yet." />
    </div>
  );
}

export function HostTeamChats({ gameId, teams, clockOffset, visible, onUnread, onClose }: Props) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const report = useCallback((teamId: string, count: number) => {
    setCounts((current) => (current[teamId] === count ? current : { ...current, [teamId]: count }));
  }, []);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  useEffect(() => onUnread(total), [onUnread, total]);

  return (
    <>
      <div className="hx-chats__head">
        <h2>Team chats</h2>
        <button className="hx-tool hx-chats__close" type="button" aria-label="Close chats" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <p className="hx-chats__note">Read only. Messages disappear after {TTL_MINUTES} minutes.</p>
      {teams.map((team, index) => (
        <TeamColumn key={team.id} gameId={gameId} team={team} clockOffset={clockOffset} visible={visible} side={index === 0 ? "a" : "b"} onUnread={report} />
      ))}
    </>
  );
}
