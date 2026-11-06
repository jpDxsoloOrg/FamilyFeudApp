// The stage-door board, for phones and the TV alike. `text` and `points` are only ever read inside `slot.revealed`.
import type { CSSProperties } from "react";
import type { PublicBoardAnswer } from "@familyfeud/core";

interface Props {
  board: PublicBoardAnswer[];
  /** Indexes opened by the latest update. */
  fresh: ReadonlySet<number>;
}

const LONG_ANSWER = 26;

function Doors({ number }: { number?: number }) {
  return (
    <span className="sx-doors" aria-hidden="true">
      <span className="sx-doors__leaf" data-side="left" />
      <span className="sx-doors__leaf" data-side="right" />
      {number !== undefined && <span className="sx-doors__num">{number}</span>}
    </span>
  );
}

export function SurveyBoard({ board, fresh }: Props) {
  const rows = Math.ceil(board.length / 2);
  const opening = [...fresh];
  return (
    <div className="sx-board" style={{ "--rows": rows } as CSSProperties}>
      {board.map((slot) => {
        if (!slot.revealed) {
          return (
            <div key={slot.index} className="sx-tile" data-state="hidden" role="img" aria-label={`Answer ${slot.index + 1}, hidden`}>
              <Doors number={slot.index + 1} />
            </div>
          );
        }
        const order = opening.indexOf(slot.index);
        return (
          <div
            key={slot.index}
            className="sx-tile"
            data-state="open"
            data-fresh={order === -1 ? undefined : ""}
            data-long={(slot.text?.length ?? 0) > LONG_ANSWER ? "" : undefined}
            style={order === -1 ? undefined : ({ "--i": order } as CSSProperties)}
          >
            <span className="sx-tile__text">
              {slot.text}
            </span>
            <span className="sx-tile__points">{slot.points}</span>
            {order !== -1 && <Doors />}
          </div>
        );
      })}
      {board.length % 2 === 1 && <div className="sx-tile" data-state="blank" aria-hidden="true" />}
    </div>
  );
}
