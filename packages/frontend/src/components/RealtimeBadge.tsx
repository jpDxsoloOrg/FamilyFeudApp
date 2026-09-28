import type { RealtimeStatus } from "../lib/realtime";

const LABEL: Record<RealtimeStatus, string> = {
  connecting: "Connecting…",
  live: "Live",
  offline: "Reconnecting…",
};

/** Small connection indicator for the header of every live screen. */
export function RealtimeBadge({ status }: { status: RealtimeStatus }) {
  return (
    <span className={`badge badge--${status}`} role="status" aria-live="polite">
      {LABEL[status]}
    </span>
  );
}
