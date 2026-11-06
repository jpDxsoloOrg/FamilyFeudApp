/** No questions or answers ever appear here: the phone may be sitting in plain sight. */
import { ClockRing } from "../show/ClockRing";

interface Props {
  name: string;
  /** The waiting player has already had their turn. */
  done: boolean;
  seconds: number | null;
  timerKey: number | null;
}

export function LookAway({ name, done, seconds, timerKey }: Props) {
  return (
    <section className="sx-lookaway">
      <div className="sx-lookaway__eyes" aria-hidden="true">
        <span />
        <span />
      </div>
      <h2>Look away!</h2>
      <ClockRing seconds={seconds} timerKey={timerKey} size="m" />
      <p className="sx-lookaway__text">
        {name} is answering. No peeking — {done ? "your answers are in." : "you're up next."}
      </p>
    </section>
  );
}
