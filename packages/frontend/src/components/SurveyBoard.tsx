// Task 3.7 — shared board component rendered by Display, Play and the host console.
import type { PublicBoardAnswer } from "@familyfeud/core";

interface Props {
  board: PublicBoardAnswer[];
  /** Host console: slot text known even when hidden, shown dimmed. */
  hiddenText?: (index: number) => string | undefined;
  /** Host console: make hidden slots clickable to reveal. */
  onReveal?: (index: number) => void;
  disabled?: boolean;
  /** Index revealed by the latest event, for the flip animation. */
  justRevealed?: number | null;
}

export function SurveyBoard({ board, hiddenText, onReveal, disabled, justRevealed }: Props) {
  return (
    <div className="board">
      {board.map((slot) => {
        if (slot.revealed) {
          return (
            <div key={slot.index} className={`slot slot--revealed${justRevealed === slot.index ? " slot--flip" : ""}`}>
              <span className="slot__text">{slot.text}</span>
              <span className="points">{slot.points}</span>
            </div>
          );
        }
        const peek = hiddenText?.(slot.index);
        if (onReveal) {
          return (
            <button
              key={slot.index}
              type="button"
              className="slot hidden slot--button"
              disabled={disabled}
              onClick={() => onReveal(slot.index)}
              title={`Reveal answer ${slot.index + 1}`}
            >
              <span className="slot__num">{slot.index + 1}</span>
              {peek && <span className="slot__peek">{peek}</span>}
            </button>
          );
        }
        return (
          <div key={slot.index} className="slot hidden">
            {slot.index + 1}
          </div>
        );
      })}
    </div>
  );
}
