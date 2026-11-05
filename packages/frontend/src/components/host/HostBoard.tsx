/** The host's board: 1-4 left, 5-8 right, like the TV, with the hidden answers readable. */
import type { MouseEvent } from "react";
import type { BoardAnswer, PublicRound } from "../../lib/types";

interface Props {
  board: PublicRound["board"];
  /** Host-only answers; empty until loaded. */
  fullBoard: BoardAnswer[];
  live: boolean;
  pending: number[];
  justRevealed: number | null;
  onReveal: (index: number) => void;
}

export function HostBoard({ board, fullBoard, live, pending, justRevealed, onReveal }: Props) {
  function press(event: MouseEvent<HTMLButtonElement>, index: number): void {
    if (event.detail > 0) event.currentTarget.blur();
    onReveal(index);
  }

  return (
    <div className="hx-board">
      {board.map((slot) => {
        if (slot.revealed) {
          return (
            <div key={slot.index} className={`hx-tile hx-tile--revealed${justRevealed === slot.index ? " slot--flip" : ""}`}>
              <span className="hx-tile__text">{slot.text}</span>
              <span className="hx-tile__points">{slot.points}</span>
            </div>
          );
        }
        const peek = fullBoard.find((entry) => entry.index === slot.index);
        return (
          <button
            key={slot.index}
            type="button"
            className="hx-tile hx-tile--hidden"
            data-live={live ? "" : undefined}
            data-pending={pending.includes(slot.index) ? "" : undefined}
            disabled={!live}
            title={`Reveal answer ${slot.index + 1}`}
            onClick={(event) => press(event, slot.index)}
          >
            <span className="hx-tile__num">{slot.index + 1}</span>
            {peek && <span className="hx-tile__peek">{peek.text}</span>}
            {peek && <span className="hx-tile__worth">{peek.points}</span>}
          </button>
        );
      })}
    </div>
  );
}
