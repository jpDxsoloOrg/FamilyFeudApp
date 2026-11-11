/** Always-present utilities. On a phone only Display, Chats and Menu stay; the rest live in Menu. */
import { Menu, MessagesSquare, Settings, Tv, Users, type LucideIcon } from "lucide-react";
import { displaySoundNote, type DisplaySound } from "../../hooks/useDisplaySound";
import { Link } from "react-router-dom";
import { phaseChip } from "../../lib/hostCue";
import type { RealtimeStatus } from "../../lib/realtime";
import type { ApiGame } from "../../lib/types";
import { MuteToggle } from "../MuteToggle";
import { RealtimeBadge } from "../RealtimeBadge";

interface Props {
  game: ApiGame;
  gameId: string;
  realtime: RealtimeStatus;
  muted: boolean;
  unread: number;
  unassigned: number;
  onToggleMuted: () => void;
  onDisplay: () => void;
  displaySound: DisplaySound;
  onChats: () => void;
  onPlayers: () => void;
  onMenu: () => void;
}

interface ToolProps {
  icon: LucideIcon;
  label: string;
  className?: string;
  /** Hover text, when it says more than the label. */
  title?: string;
  dot?: boolean;
  count?: number;
  onClick: () => void;
}

function Tool({ icon: Icon, label, className = "", title, dot, count, onClick }: ToolProps) {
  return (
    <button className={`hx-tool ${className}`} type="button" aria-label={count ? `${label}, ${count} waiting` : title ?? label} title={title ?? label} onClick={onClick}>
      <Icon size={20} aria-hidden="true" />
      <span className="hx-tool__label">{label}</span>
      {dot && <span className="hx-dot" aria-hidden="true" />}
      {count ? <span className="hx-count" aria-hidden="true">{count}</span> : null}
    </button>
  );
}

export function ShowBar({ game, gameId, realtime, muted, unread, unassigned, onToggleMuted, onDisplay, displaySound, onChats, onPlayers, onMenu }: Props) {
  const chip = phaseChip(game);
  return (
    <header className="hx-bar" data-live={realtime === "live"}>
      <h1 className="hx-sr">Host Console</h1>
      <div className="hx-bar__phase" title={chip.full}>
        <span className="hx-bar__full">{chip.full}</span>
        <span className="hx-bar__short">
          {chip.short && <strong>{chip.short}</strong>} {chip.label}
        </span>
      </div>
      <div className="hx-bar__code" aria-label={`Join code ${game.joinCode}`}>
        <span className="hx-bar__codeLabel">Code</span>
        {game.joinCode}
      </div>
      <div className="hx-bar__tools">
        <Tool icon={Tv} label="Display" title={`Display · ${displaySoundNote(displaySound)}`} dot={displaySound === "off"} onClick={onDisplay} />
        {game.teams.length > 0 && <Tool icon={MessagesSquare} label="Chats" className="hx-bar__chats" dot={unread > 0} onClick={onChats} />}
        <Tool icon={Users} label="Players" className="hx-wide" count={unassigned} onClick={onPlayers} />
        <span className="hx-wide hx-bar__mute">
          <MuteToggle muted={muted} onToggle={onToggleMuted} />
        </span>
        <RealtimeBadge status={realtime} />
        <Link className="hx-tool hx-wide" to={`/host/${gameId}/setup`} aria-label="Setup" title="Setup">
          <Settings size={20} aria-hidden="true" />
          <span className="hx-tool__label">Setup</span>
        </Link>
        <Tool icon={Menu} label="Menu" className="hx-bar__menu" dot={unassigned > 0} onClick={onMenu} />
      </div>
    </header>
  );
}
