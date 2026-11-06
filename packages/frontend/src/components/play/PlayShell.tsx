/**
 * The player's screen is pinned to the visible area, so an open keyboard can
 * never scroll the page out from under it. Only the stage scrolls.
 */
import type { ReactNode } from "react";

interface Props {
  bar: ReactNode;
  /** Above the keyboard-safe zone: the dock, then chat. */
  dock?: ReactNode;
  chat?: ReactNode;
  chatState: "none" | "open" | "closed";
  keyboardUp: boolean;
  /** Gold frame round the screen: it is this player's turn. */
  myTurn?: boolean;
  toast?: string;
  /** What the assertive live region says. */
  announce?: string;
  overlay?: ReactNode;
  moments?: ReactNode;
  children: ReactNode;
}

export function PlayShell({ bar, dock, chat, chatState, keyboardUp, myTurn, toast, announce, overlay, moments, children }: Props) {
  return (
    <div className="sx sx-shell" data-chat={chatState} data-keyboard={keyboardUp ? "up" : "down"} data-turn={myTurn ? "" : undefined} data-zone={dock || chat ? "" : undefined}>
      {bar}
      <main className="sx-stage">
        <div className="sx-stage__in">{children}</div>
      </main>
      {(dock || chat) && (
        <div className="sx-zone">
          {dock}
          {chat}
        </div>
      )}
      {overlay}
      {moments}
      <div className="sx-toast" role="status">
        {toast}
      </div>
      <div className="sx-sr" aria-live="assertive">
        {announce}
      </div>
    </div>
  );
}
