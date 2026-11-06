/**
 * Fast Money on a phone with the keyboard up: about 320px to work with.
 * The input stays read-only rather than disabled during a request, or the
 * keyboard would drop between questions.
 */
import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { buzzPhone } from "../../lib/haptics";
import { play } from "../../lib/sounds";
import type { ApiFastMoneyPrompt, ApiFastMoneyView } from "../../lib/types";
import { ClockRing } from "../show/ClockRing";

const TIME_CARD_MS = 1500;
const URGENT_AT = 5;

interface Props {
  view: ApiFastMoneyView | undefined;
  fallbackTotal: number;
  seconds: number | null;
  timerKey: number | null | undefined;
  busy: boolean;
  /** Question the host just called a duplicate. */
  duplicate: { questionIndex: number; tick: number } | null;
  problem?: string;
  onSubmit: (prompt: ApiFastMoneyPrompt, answer: string) => Promise<boolean>;
  onSkip: (prompt: ApiFastMoneyPrompt) => void;
}

export function FmTurn({ view, fallbackTotal, seconds, timerKey, busy, duplicate, problem, onSubmit, onSkip }: Props) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [sent, setSent] = useState<Record<number, string>>({});
  const [refused, setRefused] = useState<ReadonlySet<number>>(new Set());
  const [timeCardDone, setTimeCardDone] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const current = view?.queue[0];
  const ready = view?.timerEndsAt != null;
  const timeUp = seconds === 0;
  const hasQuestion = ready && current !== undefined;
  const draft = current ? (drafts[current.questionIndex] ?? "") : "";

  function setDraft(questionIndex: number, text: string): void {
    setDrafts((all) => ({ ...all, [questionIndex]: text }));
  }

  useEffect(() => {
    if (!duplicate) return;
    setDraft(duplicate.questionIndex, "");
    setRefused((all) => new Set(all).add(duplicate.questionIndex));
  }, [duplicate]);

  useEffect(() => {
    if (!hasQuestion || seconds === null || seconds === 0 || seconds > URGENT_AT) return;
    play("tick");
    buzzPhone(15);
  }, [seconds, hasQuestion]);

  useEffect(() => {
    if (!timeUp || !hasQuestion) return;
    input.current?.blur();
    play("timeUp");
    buzzPhone(200);
    const timer = window.setTimeout(() => setTimeCardDone(true), TIME_CARD_MS);
    return () => window.clearTimeout(timer);
    // Once, as the clock lands on zero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const answer = draft.trim();
    if (!current || !answer || busy || timeUp) return;
    const { questionIndex } = current;
    setSent((all) => ({ ...all, [questionIndex]: answer }));
    if (await onSubmit(current, answer)) setDraft(questionIndex, "");
  }

  if (!ready) {
    return (
      <section className="sx-fmturn" data-calm="">
        <ClockRing seconds={seconds} timerKey={timerKey} size="s" dim />
        <p className="sx-fmturn__set">Get set…</p>
      </section>
    );
  }

  if (!current) {
    return (
      <section className="sx-fmturn" data-calm="">
        <ClockRing seconds={seconds} timerKey={timerKey} size="s" dim />
        <p className="sx-fmturn__set">All answered — nice!</p>
      </section>
    );
  }

  if (timeUp) {
    return (
      <section className="sx-fmturn" data-calm="">
        <ClockRing seconds={0} timerKey={timerKey} size="s" />
        {timeCardDone ? <p className="sx-fmturn__set">Your answers are in. The host takes it from here.</p> : <p className="sx-fmturn__time">Time!</p>}
      </section>
    );
  }

  const repeat = refused.has(current.questionIndex);
  const said = sent[current.questionIndex];
  const placeholder = repeat ? (said ? `You said ${said} — give a different one` : "Give a different one") : "Your answer";

  return (
    <form className="sx-fmturn" onSubmit={(event) => void submit(event)}>
      <div className="sx-fmturn__top">
        <ClockRing seconds={seconds} timerKey={timerKey} size="s" />
        <p className="sx-fmturn__count">
          Question {view ? view.answered + 1 : ""} of {view?.total ?? fallbackTotal}
        </p>
      </div>
      <p className="sx-fmturn__question">{current.text}</p>
      <div className="sx-fmturn__entry">
        <input
          ref={input}
          className="input"
          value={draft}
          maxLength={60}
          autoFocus
          autoComplete="off"
          enterKeyHint="send"
          placeholder={placeholder}
          aria-label="Your answer"
          readOnly={busy}
          onChange={(event) => setDraft(current.questionIndex, event.target.value)}
        />
        <button className="button button--primary sx-fmturn__send" type="submit" aria-label="Submit" disabled={busy || !draft.trim()} onMouseDown={(event) => event.preventDefault()}>
          <ChevronRight size={28} aria-hidden="true" />
        </button>
      </div>
      {problem && <p className="field-error">{problem}</p>}
      <button className="button button--small button--ghost sx-fmturn__skip" type="button" disabled={busy} onMouseDown={(event) => event.preventDefault()} onClick={() => onSkip(current)}>
        Skip
      </button>
    </form>
  );
}
