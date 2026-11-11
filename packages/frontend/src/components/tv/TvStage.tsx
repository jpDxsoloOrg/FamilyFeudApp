/** The set everything on the TV stands on: backdrop, 16:9 frame, moments and stage sound. */
import { useEffect, useRef, type ReactNode } from "react";
import { useMoments } from "../../hooks/useMoments";
import { useStageLayout } from "../../hooks/useStageLayout";
import { useWakeLock } from "../../hooks/useWakeLock";
import { PRODUCT_NAME } from "../../lib/brand";
import type { Moment } from "../../lib/moments";
import type { RealtimeStatus } from "../../lib/realtime";
import { play, type SoundName } from "../../lib/sounds";
import type { ApiGame, ApiGameUpdate } from "../../lib/types";
import { MomentLayer } from "../show/MomentLayer";
import { TvControls } from "./TvControls";

const FANFARE_DELAY_MS = 1100;

const SOUND_FOR_MOMENT: Partial<Record<Moment["kind"], SoundName>> = {
  round: "sting",
  steal: "steal",
  award: "win",
  stolen: "win",
  heldOn: "win",
  fmWin: "win",
};

function moodOf(game: ApiGame | undefined): "idle" | "armed" | "steal" | "fast" | "finale" {
  if (game?.status === "FINISHED") return "finale";
  if (game?.status === "FAST_MONEY") return "fast";
  if (game?.status === "ROUND_ACTIVE" && game.currentRound?.state === "FACE_OFF_ARMED") return "armed";
  if (game?.status === "ROUND_ACTIVE" && game.currentRound?.state === "STEAL") return "steal";
  return "idle";
}

interface Props {
  game?: ApiGame;
  lastEvent: ApiGameUpdate | undefined;
  /** Inside a phone's player shell, which supplies the bar and the mute. */
  embedded?: boolean;
  realtime: RealtimeStatus;
  muted?: boolean;
  onToggleMuted?: () => void;
  children: ReactNode;
}

export function TvStage({ game, lastEvent, embedded, realtime, muted = false, onToggleMuted, children }: Props) {
  const framed = window.self !== window.top;
  const stage = useStageLayout() && !embedded;
  const moment = useMoments(game, lastEvent, stage);
  // Phones in the room are already sounding off; these belong to the one big screen.
  const sounding = stage && !framed;
  const players = game?.players.length;
  const heard = useRef(players);
  const Frame = embedded ? "div" : "main";

  useWakeLock(!framed && !embedded);

  const momentKey = moment?.key;
  const momentKind = moment?.moment.kind;
  useEffect(() => {
    const sound = momentKind && SOUND_FOR_MOMENT[momentKind];
    // An award usually rides on ANSWER_REVEALED; a POT_AWARDED event has already played `win` through useSounds.
    if (sounding && sound && !(sound === "win" && lastEvent?.event === "POT_AWARDED")) play(sound);
    // The key alone decides: a resize must not replay the sting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [momentKey]);

  useEffect(() => {
    if (!sounding || lastEvent?.event !== "GAME_FINISHED") return;
    const timer = window.setTimeout(() => play("fanfare"), FANFARE_DELAY_MS);
    return () => window.clearTimeout(timer);
    // Only a new event may fire this: a resize must not replay the fanfare.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent]);

  useEffect(() => {
    const before = heard.current;
    heard.current = players;
    if (sounding && game?.status === "LOBBY" && before !== undefined && players !== undefined && players > before) play("join");
  }, [players, sounding, game?.status]);

  return (
    <div className={`sx sx-tv${embedded ? "" : " sx-tv--room"}`} data-mood={moodOf(game)} data-embedded={embedded ? "" : undefined}>
      {!embedded && (
        <div className="sx-set" aria-hidden="true">
          <span className="sx-set__beam" data-side="left" />
          <span className="sx-set__beam" data-side="right" />
          <span className="sx-set__floor" />
        </div>
      )}
      {!embedded && <h1 className="sx-sr">{PRODUCT_NAME}</h1>}
      <Frame className="sx-tv__frame">{children}</Frame>
      <MomentLayer current={moment} />
      {!embedded && <TvControls framed={framed} muted={muted} onToggleMuted={onToggleMuted} realtime={realtime} />}
    </div>
  );
}
