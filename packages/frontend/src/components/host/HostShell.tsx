/** Three zones: ShowBar, Stage, Cue Dock. Only the Stage scrolls. */
import type { MouseEvent, ReactNode } from "react";

interface Props {
  bar: ReactNode;
  dock: ReactNode;
  legend: ReactNode;
  chats: ReactNode;
  hasChats: boolean;
  sheets: ReactNode;
  children: ReactNode;
}

/** A clicked button keeps focus, and Space would then press it again instead of the next step. */
function dropPointerFocus(event: MouseEvent<HTMLDivElement>): void {
  if (event.detail === 0 || (event.target as HTMLElement).closest("dialog")) return;
  const focused = document.activeElement;
  if (focused instanceof HTMLButtonElement || focused instanceof HTMLAnchorElement || focused instanceof HTMLSelectElement) focused.blur();
}

export function HostShell({ bar, dock, legend, chats, hasChats, sheets, children }: Props) {
  return (
    <div className="hx hx-shell" data-chats={hasChats ? "" : undefined} onClick={dropPointerFocus}>
      {bar}
      <main className="hx-stage">
        <div className="hx-stage__scroll">{children}</div>
        {legend}
      </main>
      {dock}
      {chats}
      {sheets}
    </div>
  );
}
