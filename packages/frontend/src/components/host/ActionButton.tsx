/** Every action press in the console. With `hold`, work that would be lost needs a 600ms hold. */
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import type { CueAction } from "../../lib/hostCue";

const HOLD_MS = 600;
const ARMED_MS = 3000;
const POINTER_CLICK_WINDOW_MS = 300;

interface Props {
  action: CueAction;
  className?: string;
}

const isPressKey = (key: string): boolean => key === "Enter" || key === " ";

export function ActionButton({ action, className = "" }: Props) {
  const { label, tone, outline, size = "m", key: keycap, enabled, hold, reason, title, icon: Icon, to } = action;
  const [holding, setHolding] = useState(false);
  const [armed, setArmed] = useState(false);
  const holdTimer = useRef<number>();
  const armTimer = useRef<number>();
  const fromPointer = useRef(false);
  const fromKey = useRef(false);
  const run = useRef(action.run);
  run.current = action.run;

  useEffect(
    () => () => {
      window.clearTimeout(holdTimer.current);
      window.clearTimeout(armTimer.current);
    },
    [],
  );

  function startHold(): void {
    setHolding(true);
    holdTimer.current = window.setTimeout(() => {
      setHolding(false);
      run.current();
    }, HOLD_MS);
  }

  function cancelHold(): void {
    window.clearTimeout(holdTimer.current);
    setHolding(false);
  }

  function onClick(event: MouseEvent<HTMLButtonElement>): void {
    if (hold) {
      if (fromPointer.current || fromKey.current) return;
      // Assistive tech clicks without a pointer: a second press stands in for the hold.
      if (armed) {
        window.clearTimeout(armTimer.current);
        setArmed(false);
        run.current();
      } else {
        setArmed(true);
        armTimer.current = window.setTimeout(() => setArmed(false), ARMED_MS);
      }
      return;
    }
    if (event.detail > 0) event.currentTarget.blur();
    run.current();
  }

  const holdProps =
    hold && enabled
      ? {
          onPointerDown(event: PointerEvent<HTMLButtonElement>) {
            if (event.button !== 0) return;
            fromPointer.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            startHold();
          },
          onPointerUp(event: PointerEvent<HTMLButtonElement>) {
            cancelHold();
            event.currentTarget.blur();
            window.setTimeout(() => {
              fromPointer.current = false;
            }, POINTER_CLICK_WINDOW_MS);
          },
          onPointerCancel: cancelHold,
          onContextMenu: (event: MouseEvent) => event.preventDefault(),
          onKeyDown(event: KeyboardEvent) {
            if (!isPressKey(event.key)) return;
            event.preventDefault();
            if (event.repeat) return;
            fromKey.current = true;
            startHold();
          },
          onKeyUp(event: KeyboardEvent) {
            if (!isPressKey(event.key)) return;
            event.preventDefault();
            cancelHold();
            window.setTimeout(() => {
              fromKey.current = false;
            }, 0);
          },
          onBlur: cancelHold,
        }
      : {};

  const classes = `hx-btn ${className}`.trim();
  const data = {
    "data-tone": tone,
    "data-size": size,
    "data-outline": outline ? "" : undefined,
    "data-hold": hold ? "" : undefined,
    "data-holding": holding ? "" : undefined,
  };
  const content = (
    <>
      {hold && <span className="hx-btn__fill" aria-hidden="true" />}
      {Icon && <Icon className="hx-btn__icon" size={size === "xl" ? 24 : 20} aria-hidden="true" />}
      <span className="hx-btn__label">{armed ? "Press again" : label}</span>
      {hold && !armed && <span className="hx-btn__tag">Hold</span>}
      {keycap && <kbd className="hx-key">{keycap}</kbd>}
    </>
  );

  if (to) {
    return (
      <Link className={classes} to={to} {...data}>
        {content}
      </Link>
    );
  }
  return (
    <button className={classes} type="button" disabled={!enabled} title={enabled ? title : (reason ?? title)} onClick={onClick} {...data} {...holdProps}>
      {content}
    </button>
  );
}
