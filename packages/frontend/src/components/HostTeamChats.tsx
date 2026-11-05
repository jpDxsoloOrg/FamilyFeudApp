// Host's read-only view of every team's chat, side by side. There is no way to send from here.
import { TEAM_MESSAGE_TTL_MS } from "@familyfeud/core";
import { useTeamChat } from "../hooks/useTeamChat";
import type { ApiTeam } from "../lib/types";
import { MessageList } from "./TeamChat";

interface Props {
  gameId: string;
  teams: ApiTeam[];
  clockOffset: number;
}

const TTL_MINUTES = TEAM_MESSAGE_TTL_MS / 60_000;

function TeamColumn({ gameId, team, clockOffset }: { gameId: string; team: ApiTeam; clockOffset: number }) {
  const { messages } = useTeamChat(gameId, team.id, clockOffset);
  return (
    <div className="card host-chats__team">
      <h3>{team.name}</h3>
      <MessageList messages={messages} emptyText="No messages yet." />
    </div>
  );
}

export function HostTeamChats({ gameId, teams, clockOffset }: Props) {
  return (
    <section className="host-chats" aria-label="Team chats">
      <h2>Team chats</h2>
      <p className="muted small">Read only. Messages disappear after {TTL_MINUTES} minutes.</p>
      <div className="grid-2">
        {teams.map((team) => (
          <TeamColumn key={team.id} gameId={gameId} team={team} clockOffset={clockOffset} />
        ))}
      </div>
    </section>
  );
}
