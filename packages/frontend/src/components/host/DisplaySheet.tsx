/** The TV screen is its own window. This opens it, shares it and shows what it is showing. */
import { ExternalLink, Share2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DisplayWindow } from "../../hooks/useDisplayWindow";
import { CopyButton } from "../CopyButton";
import { HostSheet } from "./HostSheet";
import { QrCode } from "./QrCode";

const MONITOR_WIDTH = 1280;
const MONITOR_HEIGHT = 720;

/** Silent and hands-off: an iframe nobody can click never gets the gesture that unlocks audio. */
function LiveMonitor({ url }: { url: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.25);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setScale(element.clientWidth / MONITOR_WIDTH));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={box} className="hx-monitor">
      <iframe
        className="hx-monitor__frame"
        src={url}
        title="Live view of the display"
        tabIndex={-1}
        width={MONITOR_WIDTH}
        height={MONITOR_HEIGHT}
        style={{ transform: `scale(${scale})` }}
      />
    </div>
  );
}

interface Props {
  display: DisplayWindow;
  strip: ReactNode;
  onClose: () => void;
}

export function DisplaySheet({ display, strip, onClose }: Props) {
  const { url, opened, blocked, open } = display;
  const canShare = typeof navigator.share === "function";

  return (
    <HostSheet title="The game screen is separate: put it on the TV" wide strip={strip} onClose={onClose}>
      <div className="hx-display">
        <div className="hx-display__actions">
          <p className="hx-eyebrow">{opened ? "Open in this browser" : "Not opened here, it may be on the TV"}</p>
          <button className="button button--primary" type="button" onClick={open}>
            <ExternalLink size={18} aria-hidden="true" /> Open display
          </button>
          {blocked && (
            <p className="hx-note">
              The browser blocked the new window.{" "}
              <a href={url} target="_blank" rel="noreferrer">
                Open it here
              </a>
              .
            </p>
          )}
          <p className="hx-url">{url}</p>
          <div className="button-row">
            <CopyButton value={url} label="Copy link" />
            {canShare && (
              <button className="button button--small button--ghost" type="button" onClick={() => navigator.share({ url, title: "Family Feud display" }).catch(() => undefined)}>
                <Share2 size={16} aria-hidden="true" /> Share
              </button>
            )}
          </div>
          <QrCode value={url} label="QR code for the display link" />
        </div>
        <div className="hx-display__live">
          <p className="hx-eyebrow">What the display shows now</p>
          <LiveMonitor url={url} />
        </div>
      </div>
    </HostSheet>
  );
}
