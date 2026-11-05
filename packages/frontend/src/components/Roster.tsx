// One team's turn order. Drag, arrows and moves in the lobby; the rest stay available mid-game.
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowRight, ArrowUp, Ellipsis, GripVertical, RotateCcw, UserMinus } from "lucide-react";
import type { ApiTeam, Player } from "../lib/types";

export const TEAM_DROP_PREFIX = "team:";

export interface RosterHandlers {
  onReorder: (playerId: string, newOrder: number) => void;
  onMove: (playerId: string, teamId: string) => void;
  onRemove: (playerId: string) => void;
  onRestore: (playerId: string) => void;
}

interface RowProps extends RosterHandlers {
  player: Player;
  index: number;
  count: number;
  otherTeams: ApiTeam[];
  busy: boolean;
  lobby: boolean;
  open: boolean;
  onToggle: () => void;
}

function Row({ player, index, count, otherTeams, busy, lobby, open, onToggle, onReorder, onMove, onRemove, onRestore }: RowProps) {
  const canDrag = lobby && player.active && !busy;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: player.id,
    disabled: { draggable: !canDrag, droppable: false },
  });
  const restore = (
    <button className="button button--small" type="button" onClick={() => onRestore(player.id)}>
      <RotateCcw size={16} aria-hidden="true" /> Restore
    </button>
  );

  return (
    <li
      ref={setNodeRef}
      className="hx-row"
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-inactive={player.active ? undefined : ""}
      data-dragging={isDragging ? "" : undefined}
    >
      <div className="hx-row__main">
        {lobby && player.active && (
          <button ref={setActivatorNodeRef} className="hx-row__grip" type="button" aria-label={`Drag ${player.displayName}`} {...attributes} {...listeners}>
            <GripVertical size={20} aria-hidden="true" />
          </button>
        )}
        <span className="hx-row__order">{index + 1}</span>
        <span className="hx-row__name" title={player.displayName}>{player.displayName}</span>
        {!player.active && !open && restore}
        <button className="hx-row__more" type="button" aria-label={`More for ${player.displayName}`} aria-expanded={open} onClick={onToggle}>
          <Ellipsis size={20} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <div className="hx-row__strip">
          {lobby && (
            <>
              <button className="button button--small button--icon" type="button" aria-label={`Move ${player.displayName} up`} disabled={index === 0} onClick={() => onReorder(player.id, index - 1)}>
                <ArrowUp size={18} aria-hidden="true" />
              </button>
              <button className="button button--small button--icon" type="button" aria-label={`Move ${player.displayName} down`} disabled={index === count - 1} onClick={() => onReorder(player.id, index + 1)}>
                <ArrowDown size={18} aria-hidden="true" />
              </button>
              {otherTeams.map((other) => (
                <button key={other.id} className="button button--small" type="button" onClick={() => onMove(player.id, other.id)}>
                  <ArrowRight size={16} aria-hidden="true" /> {other.name}
                </button>
              ))}
            </>
          )}
          {player.active ? (
            <button className="button button--small hx-ember" type="button" onClick={() => onRemove(player.id)}>
              <UserMinus size={16} aria-hidden="true" /> Remove
            </button>
          ) : (
            restore
          )}
        </div>
      )}
    </li>
  );
}

interface Props extends RosterHandlers {
  team: ApiTeam;
  otherTeams: ApiTeam[];
  busy: boolean;
  lobby: boolean;
  /** Row order held during a drag's call, so the row doesn't jump back while it lands. */
  pendingOrder: string[] | undefined;
  expanded: string | null;
  onExpand: (playerId: string | null) => void;
}

export function Roster({ team, otherTeams, busy, lobby, pendingOrder, expanded, onExpand, ...handlers }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `${TEAM_DROP_PREFIX}${team.id}` });
  const sorted = [...team.players].sort((a, b) => a.order - b.order);
  const players = pendingOrder ? pendingOrder.flatMap((id) => sorted.filter((player) => player.id === id)) : sorted;

  return (
    <div ref={setNodeRef} className="hx-roster" data-over={isOver ? "" : undefined}>
      {players.length === 0 ? (
        <p className="hx-note">Nobody yet.</p>
      ) : (
        <SortableContext id={team.id} items={players.map((player) => player.id)} strategy={verticalListSortingStrategy}>
          <ol className="hx-rows">
            {players.map((player, index) => (
              <Row
                key={player.id}
                player={player}
                index={index}
                count={players.length}
                otherTeams={otherTeams}
                busy={busy}
                lobby={lobby}
                open={expanded === player.id}
                onToggle={() => onExpand(expanded === player.id ? null : player.id)}
                {...handlers}
              />
            ))}
          </ol>
        </SortableContext>
      )}
    </div>
  );
}
