/** Teams and turn order. `lobby` shows everything; `live` keeps what is safe mid-game. */
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowRight, GripVertical } from "lucide-react";
import { useState } from "react";
import type { ApiGame, ApiTeam, Player } from "../../lib/types";
import { Roster, TEAM_DROP_PREFIX } from "../Roster";
import { TeamRename } from "../TeamRename";

export interface PlayerActions {
  onRename: (teamId: string, name: string) => Promise<unknown>;
  onAssign: (playerId: string, teamId: string) => Promise<unknown>;
  onReorder: (playerId: string, newOrder: number) => Promise<unknown>;
  onRemove: (playerId: string) => void;
  onRestore: (playerId: string) => void;
}

interface Props extends PlayerActions {
  game: ApiGame;
  mode: "lobby" | "live";
  busy: boolean;
}

const isTeamDrop = (id: unknown): boolean => String(id).startsWith(TEAM_DROP_PREFIX);

/** A row under the pointer wins; otherwise the team column. The keyboard has no pointer, so rows and empty columns compete by distance. */
const collision: CollisionDetection = (args) => {
  if (args.pointerCoordinates) {
    const hits = pointerWithin(args);
    return hits.filter((hit) => !isTeamDrop(hit.id)).slice(0, 1).concat(hits.filter((hit) => isTeamDrop(hit.id))).slice(0, 1);
  }
  return closestCenter(args);
};

function UnassignedRow({ player, teams, busy, lobby, onAssign }: { player: Player; teams: ApiTeam[]; busy: boolean; lobby: boolean; onAssign: PlayerActions["onAssign"] }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({ id: player.id, disabled: !lobby || busy });
  return (
    <li ref={setNodeRef} className="hx-row" style={{ transform: CSS.Translate.toString(transform) }} data-dragging={isDragging ? "" : undefined}>
      <div className="hx-row__main">
        {lobby && (
          <button ref={setActivatorNodeRef} className="hx-row__grip" type="button" aria-label={`Drag ${player.displayName}`} {...attributes} {...listeners}>
            <GripVertical size={20} aria-hidden="true" />
          </button>
        )}
        <span className="hx-row__name" title={player.displayName}>{player.displayName}</span>
      </div>
      <div className="hx-row__strip">
        {teams.map((team) => (
          <button key={team.id} className="button button--small" type="button" onClick={() => onAssign(player.id, team.id)}>
            <ArrowRight size={16} aria-hidden="true" /> {team.name}
          </button>
        ))}
      </div>
    </li>
  );
}

export function PlayersPanel({ game, mode, busy, onRename, onAssign, onReorder, onRemove, onRestore }: Props) {
  const lobby = mode === "lobby";
  const unassigned = game.players.filter((player) => player.teamId === null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, setPending] = useState<{ teamId: string; ids: string[] } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent): void {
    if (!over || active.id === over.id) return;
    const player = game.players.find((candidate) => candidate.id === active.id);
    if (!player) return;
    const overId = String(over.id);
    const target = isTeamDrop(overId) ? undefined : game.players.find((candidate) => candidate.id === overId);
    const teamId = isTeamDrop(overId) ? overId.slice(TEAM_DROP_PREFIX.length) : target?.teamId;
    if (!teamId) return;

    if (teamId !== player.teamId) {
      void onAssign(player.id, teamId);
      return;
    }
    if (!target) return;
    const team = game.teams.find((candidate) => candidate.id === teamId);
    const ids = [...(team?.players ?? [])].sort((a, b) => a.order - b.order).map((member) => member.id);
    setPending({ teamId, ids: arrayMove(ids, ids.indexOf(player.id), ids.indexOf(target.id)) });
    void onReorder(player.id, target.order).finally(() => setPending(null));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragEnd={onDragEnd}>
      {!lobby && <p className="hx-note">Removed players stay in this round's turn order; use Skip guesser.</p>}
      {unassigned.length > 0 && game.teams.length > 0 && (
        <section className="hx-card hx-unassigned">
          <h3 className="hx-title">Unassigned ({unassigned.length})</h3>
          <p className="hx-note">Late joiners land here. Assign them to a team; they go to the bottom of that team's order.</p>
          <ul className="hx-rows">
            {unassigned.map((player) => (
              <UnassignedRow key={player.id} player={player} teams={game.teams} busy={busy} lobby={lobby} onAssign={onAssign} />
            ))}
          </ul>
        </section>
      )}
      <div className="hx-teams">
        {game.teams.map((team, index) => (
          <section className={`hx-card hx-edge--${index === 0 ? "a" : "b"}`} key={team.id}>
            <TeamRename name={team.name} busy={busy} onRename={(name) => onRename(team.id, name)} />
            {lobby && <p className="hx-note">Turn order, top to bottom. Drag or use the arrows to reorder.</p>}
            <Roster
              team={team}
              otherTeams={game.teams.filter((other) => other.id !== team.id)}
              busy={busy}
              lobby={lobby}
              pendingOrder={pending?.teamId === team.id ? pending.ids : undefined}
              expanded={expanded}
              onExpand={setExpanded}
              onReorder={onReorder}
              onMove={onAssign}
              onRemove={onRemove}
              onRestore={onRestore}
            />
          </section>
        ))}
      </div>
    </DndContext>
  );
}
