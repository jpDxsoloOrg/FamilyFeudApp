import { useEffect, useState } from "react";

interface Props {
  count: number;
  max: number;
  /** Changes whenever a new strike lands (e.g. an event's serverTime) to trigger the big X. */
  flashKey?: number | string | null;
}

const FLASH_MS = 1200;

/** Strike tally plus the big red X that flashes over the screen on each new strike. */
export function Strikes({ count, max, flashKey }: Props) {
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (flashKey === null || flashKey === undefined) return;
    setFlash(true);
    const timer = window.setTimeout(() => setFlash(false), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flashKey]);

  return (
    <>
      <div className="strikes" aria-label={`${count} of ${max} strikes`}>
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={`strikes__x${i < count ? " strikes__x--on" : ""}`}>
            ✕
          </span>
        ))}
      </div>
      {flash && (
        <div className="strike-flash" aria-hidden="true">
          <span>✕</span>
        </div>
      )}
    </>
  );
}
