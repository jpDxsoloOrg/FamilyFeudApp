// Task 3.7 — shared board component rendered by Display and Play.
import type { PublicBoardAnswer } from "@familyfeud/core";

export function SurveyBoard({ board }: { board: PublicBoardAnswer[] }) {
  return (
    <div className="board">
      {board.map((slot) =>
        slot.revealed ? (
          <div key={slot.index} className="slot">
            <span>{slot.text}</span>
            <span className="points">{slot.points}</span>
          </div>
        ) : (
          <div key={slot.index} className="slot hidden">
            {slot.index + 1}
          </div>
        ),
      )}
    </div>
  );
}
