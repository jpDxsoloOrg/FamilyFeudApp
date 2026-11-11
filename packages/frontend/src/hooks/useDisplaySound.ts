/**
 * The display window tells the host, over a same-browser BroadcastChannel,
 * whether its sound is on. The host shares that window on a call, so when it
 * is on the host leaves the room sounds to it instead of doubling them.
 */
import { useEffect, useState } from "react";
import { isSounding } from "../lib/sounds";

const HEARTBEAT_MS = 1500;
/** Missed heartbeats this long mean the display is gone (closed, crashed, navigated away). */
const STALE_MS = 4500;

interface DisplayStatus {
  type: "display-sound";
  soundOn: boolean;
  closed?: boolean;
}

function channelName(gameId: string): string {
  return `familyfeud.display.${gameId}`;
}

function openChannel(gameId: string): BroadcastChannel | undefined {
  return typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel(channelName(gameId));
}

/** Run on the TV display: report sound on/off now, on every change, and as a heartbeat. */
export function useReportDisplaySound(gameId: string | undefined, enabled: boolean): void {
  useEffect(() => {
    if (!gameId || !enabled) return;
    const channel = openChannel(gameId);
    if (!channel) return;
    const send = (status: Omit<DisplayStatus, "type">): void => channel.postMessage({ type: "display-sound", ...status });
    const report = (): void => send({ soundOn: isSounding() });
    report();
    const timer = window.setInterval(report, HEARTBEAT_MS);
    // A gesture may have just turned sound on; tell the host straight away.
    const soon = (): void => void window.setTimeout(report, 150);
    window.addEventListener("pointerdown", soon, { passive: true });
    window.addEventListener("keydown", soon);
    const bye = (): void => send({ soundOn: false, closed: true });
    window.addEventListener("pagehide", bye);
    return () => {
      bye();
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", soon);
      window.removeEventListener("keydown", soon);
      window.removeEventListener("pagehide", bye);
      channel.close();
    };
  }, [gameId, enabled]);
}

export type DisplaySound = "none" | "off" | "on";

/** Run on the host: "none" when no display is reporting, else whether its sound is on. */
export function useDisplaySound(gameId: string | undefined): DisplaySound {
  const [status, setStatus] = useState<{ soundOn: boolean; at: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!gameId) return;
    const channel = openChannel(gameId);
    if (!channel) return;
    channel.onmessage = (event: MessageEvent<DisplayStatus>) => {
      if (event.data?.type !== "display-sound") return;
      setStatus(event.data.closed ? null : { soundOn: event.data.soundOn, at: Date.now() });
    };
    const tick = window.setInterval(() => setNow(Date.now()), HEARTBEAT_MS);
    return () => {
      window.clearInterval(tick);
      channel.close();
    };
  }, [gameId]);

  if (!status || now - status.at > STALE_MS) return "none";
  return status.soundOn ? "on" : "off";
}

/** One line for the host about where the game's sound is coming from. */
export function displaySoundNote(sound: DisplaySound): string {
  if (sound === "on") return "Sound is playing from the display window, so the host console stays quiet.";
  if (sound === "off") return "The display has no sound yet: click once anywhere in the display window.";
  return "No display window open in this browser; sounds play here on the host.";
}
