/** Matches the `.sx-tv` stage media query in show.css. */
import { useEffect, useState } from "react";

const STAGE_QUERY = "(orientation: landscape) and (min-width: 900px) and (min-height: 560px)";

export function useStageLayout(): boolean {
  const [stage, setStage] = useState(() => window.matchMedia(STAGE_QUERY).matches);

  useEffect(() => {
    const query = window.matchMedia(STAGE_QUERY);
    const sync = (): void => setStage(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return stage;
}
