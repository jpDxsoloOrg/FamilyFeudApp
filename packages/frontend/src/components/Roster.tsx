// Task 2.9 — host-editable team roster: reorder (buttons + drag), move, remove/restore.
import { useState, type DragEvent } from "react";
import type { ApiTeam, Player } from "../lib/types";

interface Props {
  team: ApiTeam;
  otherTeams: ApiTeam[];
  busy: boolean;
  onReorder: (playerId: string, newOrder: number) => void;
  onMove: (playerId: string, teamId: string) => void;
  onRemove: (playerId: string) => void;
  onRestore: (playerId: string) => void;
}

export function Roster({ team, otherTeams, busy, onReorder, onMove, onRemove, onRestore }: Props) {
  const [dragging, setDragging] = useState<string | null>(null);
  const players = [...team.players].sort((a, b) => a.order - b.order);

  function onDragStart(event: DragEvent<HTMLLIElement>, player: Player): void {
    setDragging(player.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", player.id);
  }

  function onDrop(event: DragEvent<HTMLLIElement>, target: Player): void {
    event.preventDefault();
    const playerId = event.dataTransfer.getData("text/plain") || dragging;
    setDragging(null);
    if (!playerId || playerId === target.id) return;
    if (!players.some((candidate) => candidate.id === playerId)) return; // cross-team drags use Move
    onReorder(playerId, target.order);
  }

  if (players.length === 0) return <p className="muted small">Nobody yet.</p>;

  return (
    <ol className="roster">
      {players.map((player, index) => (
        <li
          key={player.id}
          className={`roster__item${player.active ? "" : " roster__item--inactive"}${dragging === player.id ? " roster__item--dragging" : ""}`}
          draggable={!busy && player.active}
          onDragStart={(event) => onDragStart(event, player)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => onDrop(event, player)}
          onDragEnd={() => setDragging(null)}
        >
          <span className="roster__order">{index + 1}</span>
          <span className="roster__name">{player.displayName}</span>
          <div className="roster__actions">
            <button
              className="button button--small button--icon"
              type="button"
              aria-label={`Move ${player.displayName} up`}
              disabled={busy || index === 0}
              onClick={() => onReorder(player.id, index - 1)}
            >
              ↑
            </button>
            <button
              className="button button--small button--icon"
              type="button"
              aria-label={`Move ${player.displayName} down`}
              disabled={busy || index === players.length - 1}
              onClick={() => onReorder(player.id, index + 1)}
            >
              ↓
            </button>
            {otherTeams.map((other) => (
              <button
                key={other.id}
                className="button button--small"
                type="button"
                disabled={busy}
                onClick={() => onMove(player.id, other.id)}
              >
                → {other.name}
              </button>
            ))}
            {player.active ? (
              <button
                className="button button--small button--danger"
                type="button"
                disabled={busy}
                onClick={() => onRemove(player.id)}
              >
                Remove
              </button>
            ) : (
              <button
                className="button button--small"
                type="button"
                disabled={busy}
                onClick={() => onRestore(player.id)}
              >
                Restore
              </button>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
