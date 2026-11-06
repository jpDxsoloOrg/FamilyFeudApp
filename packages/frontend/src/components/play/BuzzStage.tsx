/**
 * The face-off buzzer. Feedback happens on the press itself, before any
 * network, and a thumb that misses the dome still counts.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { BuzzVerdict } from "../../hooks/useBuzzVerdict";
import { buzzPhone } from "../../lib/haptics";
import { playerName } from "../../lib/gameHelpers";
import type { RealtimeStatus } from "../../lib/realtime";
import { play, unlock } from "../../lib/sounds";
import type { ApiGame, PublicRound } from "../../lib/types";
import { MuteToggle } from "../MuteToggle";
import { RealtimeBadge } from "../RealtimeBadge";

interface Props {
  game: ApiGame;
  round: PublicRound;
  verdict: BuzzVerdict | null;
  /** Changes when the buzzers are armed again, which allows another press. */
  armKey: number | undefined;
  problem?: string;
  onDismissProblem: () => void;
  /** Resolves false if the buzz did not land. */
  onBuzz: () => Promise<boolean>;
  realtime: RealtimeStatus;
  muted: boolean;
  onToggleMuted: () => void;
}

export function BuzzStage({ game, round, verdict, armKey, problem, onDismissProblem, onBuzz, realtime, muted, onToggleMuted }: Props) {
  const button = useRef<HTMLButtonElement>(null);
  const fired = useRef(false);
  const [pressed, setPressed] = useState(false);
  const live = verdict === null;

  useEffect(() => {
    fired.current = false;
    setPressed(false);
  }, [armKey]);

  useEffect(() => {
    if (live) button.current?.focus({ preventScroll: true });
  }, [live]);

  const fire = useCallback(() => {
    if (fired.current || !live) return;
    fired.current = true;
    unlock();
    setPressed(true);
    buzzPhone(30);
    play("press");
    void onBuzz().then((landed) => {
      if (landed) return;
      fired.current = false;
      setPressed(false);
    });
  }, [live, onBuzz]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== " " && event.key !== "Enter" && event.key.toLowerCase() !== "b") return;
      if (event.target instanceof HTMLElement && event.target.closest(".sx-buzzstage__top")) return;
      event.preventDefault();
      fire();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fire]);

  return (
    <div className="sx-buzzstage" data-verdict={verdict ? (verdict.won ? "won" : "lost") : undefined}>
      <div className="sx-buzzstage__top">
        <div className="sx-buzzstage__meta">
          <span className="sx-buzzstage__round">
            Round {round.number}
            {round.multiplier > 1 ? ` · ×${round.multiplier}` : ""}
          </span>
          <span className="sx-bar__mute">
            <MuteToggle muted={muted} onToggle={onToggleMuted} stableLabel />
          </span>
          <RealtimeBadge status={realtime} />
        </div>
        {realtime === "offline" && <p className="sx-strip sx-strip--ember">Reconnecting… your buzz may not land</p>}
        {problem && (
          <p className="sx-strip sx-strip--ember">
            <span>{problem}</span>
            <button className="sx-strip__close" type="button" aria-label="Dismiss" onClick={onDismissProblem}>
              ×
            </button>
          </p>
        )}
        <p className="sx-buzzstage__question">{round.questionText}</p>
        {live ? <p className="sx-buzzstage__hint">Tap as soon as you know it!</p> : <p className="sx-buzzstage__hint">&nbsp;</p>}
      </div>

      <button ref={button} className="sx-buzz" type="button" aria-disabled={!live} data-pressed={pressed ? "" : undefined} onPointerDown={fire} onClick={fire}>
        <span className="sx-buzz__bezel sx-bulbs">
          <span className="sx-buzz__dome">BUZZ</span>
        </span>
        <span className="sx-buzz__keys" aria-hidden="true">
          Space or B
        </span>
      </button>

      {verdict && (
        <div className="sx-verdict" role="status">
          <strong className="sx-verdict__title">{verdict.won ? "You buzzed first!" : "Too slow — the other side buzzed first."}</strong>
          {!verdict.won && <span className="sx-verdict__who">{playerName(game, verdict.winnerId)} got there first</span>}
        </div>
      )}
    </div>
  );
}
