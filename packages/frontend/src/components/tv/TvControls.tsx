/** Out of the picture until someone reaches for it. On a touch screen there is no hover, so it stays put as a slim bar. */
import { Maximize, Minimize } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioReady } from "../../hooks/useAudioReady";
import { isMuted } from "../../lib/sounds";
import type { RealtimeStatus } from "../../lib/realtime";
import { MuteToggle } from "../MuteToggle";
import { RealtimeBadge } from "../RealtimeBadge";
import { Wordmark } from "../show/Wordmark";

const IDLE_MS = 4000;

/** A browser plays nothing until someone in the room touches something. */
export function SoundPrompt() {
  const ready = useAudioReady();
  if (ready || isMuted()) return null;
  return <p className="sx-pill sx-pill--prompt">Tap or press any key for sound</p>;
}

interface Props {
  framed: boolean;
  muted: boolean;
  onToggleMuted?: () => void;
  realtime: RealtimeStatus;
  /** The lobby shows the sound prompt under the join code instead. */
  inLobby: boolean;
}

export function TvControls({ framed, muted, onToggleMuted, realtime, inLobby }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [awake, setAwake] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const idleTimer = useRef<number>();
  const canFullscreen = document.fullscreenEnabled;
  const toggleMuted = useRef(onToggleMuted);
  toggleMuted.current = onToggleMuted;

  const wake = useCallback(() => {
    setAwake(true);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setAwake(false), IDLE_MS);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (framed) return;
    wake();
    const onKey = (event: KeyboardEvent): void => {
      wake();
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "m") toggleMuted.current?.();
      if (key === "f" && canFullscreen) toggleFullscreen();
    };
    const onFullscreen = (): void => setFullscreen(document.fullscreenElement !== null);
    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("pointerdown", wake, { passive: true });
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      window.clearTimeout(idleTimer.current);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, [framed, wake, toggleFullscreen, canFullscreen]);

  // The cursor goes with the controls; it lives on the stage, which this does not render.
  useEffect(() => {
    root.current?.closest(".sx-tv")?.toggleAttribute("data-idle", !awake);
  }, [awake]);

  return (
    <div ref={root}>
      <div className="sx-tvbadge" data-live={realtime === "live" ? "" : undefined}>
        <RealtimeBadge status={realtime} />
      </div>
      {!framed && (
        <>
          <div className="sx-tvctl" data-awake={awake ? "" : undefined}>
            <Wordmark className="sx-tvctl__mark" />
            <span className="sx-bar__mute">
              <MuteToggle muted={muted} onToggle={() => onToggleMuted?.()} stableLabel />
            </span>
            {canFullscreen && (
              <button className="button button--small button--ghost" type="button" aria-label={fullscreen ? "Exit full screen" : "Full screen"} title={fullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen}>
                {fullscreen ? <Minimize size={18} aria-hidden="true" /> : <Maximize size={18} aria-hidden="true" />}
              </button>
            )}
          </div>
          {!inLobby && (
            <div className="sx-tvsound">
              <SoundPrompt />
            </div>
          )}
        </>
      )}
    </div>
  );
}
