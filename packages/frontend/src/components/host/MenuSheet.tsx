import { Keyboard, Settings, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CopyButton } from "../CopyButton";
import { MuteToggle } from "../MuteToggle";
import { HostSheet } from "./HostSheet";

interface Props {
  gameId: string;
  hostToken: string;
  muted: boolean;
  unassigned: number;
  strip: ReactNode;
  onToggleMuted: () => void;
  onPlayers: () => void;
  onKeys: () => void;
  onClose: () => void;
}

export function MenuSheet({ gameId, hostToken, muted, unassigned, strip, onToggleMuted, onPlayers, onKeys, onClose }: Props) {
  const [copyFailed, setCopyFailed] = useState(false);
  return (
    <HostSheet title="Menu" strip={strip} onClose={onClose}>
      <div className="hx-menu">
        <Link className="button" to={`/host/${gameId}/setup`}>
          <Settings size={18} aria-hidden="true" /> Setup
        </Link>
        <MuteToggle muted={muted} onToggle={onToggleMuted} />
        <button className="button" type="button" onClick={onPlayers}>
          <Users size={18} aria-hidden="true" /> Players
          {unassigned > 0 && <span className="hx-count hx-count--inline">{unassigned}</span>}
        </button>
        <button className="button" type="button" onClick={onKeys}>
          <Keyboard size={18} aria-hidden="true" /> Keys
        </button>
      </div>
      <section className="hx-menu__access">
        <h3 className="hx-eyebrow">Host access</h3>
        <p className="hx-note">Anyone with this token can run the game.</p>
        <CopyButton value={hostToken} label="Copy host token" onFail={() => setCopyFailed(true)} />
        {copyFailed && <input className="input input--small" readOnly aria-label="Host token" value={hostToken} onFocus={(event) => event.target.select()} />}
      </section>
    </HostSheet>
  );
}
