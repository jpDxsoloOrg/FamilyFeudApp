/** Out of the picture until someone reaches for it. On a touch screen there is no hover, so it stays put as a slim bar. */
import { Maximize, Minimize, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioReady } from "../../hooks/useAudioReady";
import { isMuted } from "../../lib/sounds";
import type { RealtimeStatus } from "../../lib/realtime";
import { MuteToggle } from "../MuteToggle";
import { RealtimeBadge } from "../RealtimeBadge";
import { Wordmark } from "../show/Wordmark";

const IDLE_MS = 4000;

/**
 * A browser plays nothing in this window until someone clicks in it, and the
 * host usually shares this window on a call without ever touching it. So the
 * ask is big and in the middle until it is answered.
 */
export function SoundGate() {
  const ready = useAudioReady();
  if (ready || isMuted()) return null;
  return (
    <div className="sx-soundgate" role="button" tabIndex={0} aria-label="Turn on sound">
      <div className="sx-soundgate__card">
        <Volume2 className="sx-soundgate__icon" aria-hidden="true" />
        <p className="sx-soundgate__title">Click anywhere to turn on sound</p>
        <p className="sx-soundgate__text">The game's buzzers and bells play from this screen.</p>
      </div>
    </div>
  );
}

interface Props {
  framed: boolean;
  muted: boolean;
  onToggleMuted?: () => void;
  realtime: RealtimeStatus;
}

export function TvControls({ framed, muted, onToggleMuted, realtime }: Props) {
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
          <SoundGate />
        </>
      )}
    </div>
  );
}
