import { useAudioReady } from "../../hooks/useAudioReady";
import { PRODUCT_NAME } from "../../lib/brand";
import type { RealtimeStatus } from "../../lib/realtime";
import { unlock } from "../../lib/sounds";
import { MuteToggle } from "../MuteToggle";
import { RealtimeBadge } from "../RealtimeBadge";
import { Wordmark } from "../show/Wordmark";

interface Props {
  state?: string;
  muted: boolean;
  onToggleMuted: () => void;
  realtime: RealtimeStatus;
}

export function PlayBar({ state, muted, onToggleMuted, realtime }: Props) {
  const audioReady = useAudioReady();
  const askForSound = !audioReady && !muted;
  return (
    <header className="sx-bar" data-offline={realtime === "offline" ? "" : undefined}>
      <Wordmark className="sx-bar__mark" />
      <h1 className="sx-sr">{PRODUCT_NAME}</h1>
      <p className="sx-bar__state" data-yield={askForSound ? "" : undefined}>
        {state}
      </p>
      {askForSound && (
        <button className="sx-pill" type="button" onClick={unlock}>
          Tap for sound
        </button>
      )}
      <span className="sx-bar__mute">
        <MuteToggle muted={muted} onToggle={onToggleMuted} stableLabel />
      </span>
      <RealtimeBadge status={realtime} />
    </header>
  );
}
