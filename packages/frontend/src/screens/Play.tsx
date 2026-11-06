// The player's phone: one shell, one cue, whatever the game is doing.
import { useParams } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { PlayBar } from "../components/play/PlayBar";
import { BuzzStage } from "../components/play/BuzzStage";
import { PlayerLobby } from "../components/play/PlayerLobby";
import { PlayShell } from "../components/play/PlayShell";
import { TurnDock } from "../components/play/TurnDock";
import { PlayFastMoney } from "../components/PlayFastMoney";
import { PlayRound } from "../components/PlayRound";
import { Finale } from "../components/show/Finale";
import { MomentLayer } from "../components/show/MomentLayer";
import { TeamChat } from "../components/TeamChat";
import { TvStage } from "../components/tv/TvStage";
import { useBuzzVerdict } from "../hooks/useBuzzVerdict";
import { useFreshReveals } from "../hooks/useFreshReveals";
import { useGame } from "../hooks/useGame";
import { useJustRevealedFastMoney } from "../hooks/useJustRevealedFastMoney";
import { useMoments } from "../hooks/useMoments";
import { usePlayerCues } from "../hooks/usePlayerCues";
import { usePlayerMessages } from "../hooks/usePlayerMessages";
import { useSounds, withoutRoomSounds } from "../hooks/useSounds";
import { useVisualViewport } from "../hooks/useVisualViewport";
import { useWakeLock } from "../hooks/useWakeLock";
import { buzz, joinGame, toApiError } from "../lib/api";
import { otherTeam, teamOfPlayer } from "../lib/gameHelpers";
import { buzzPhone } from "../lib/haptics";
import { getDisplayName, getLastGame, getPlayerId, setLastGame } from "../lib/identity";
import { barState, playerCue, spectatorCue } from "../lib/playerCue";
import { TvShow } from "./Display";

const TOAST_MS = 2500;
const DUPLICATE_TOAST_MS = 3000;
/** A BUZZ_RESULT can land just before the state that proves it, so give the verdict a beat to speak first. */
const VERDICT_GRACE_MS = 400;

export function Play() {
  const { gameId } = useParams<{ gameId: string }>();
  const { game, realtime, loading, error, lastEvent, clockOffset, applyUpdate } = useGame(gameId);
  const me = getPlayerId();
  const { last: lastMessage } = usePlayerMessages(gameId, me);
  const { muted, toggleMuted } = useSounds(withoutRoomSounds(lastEvent));
  const keyboardUp = useVisualViewport(true);
  const round = game?.currentRound;
  const { verdict, shownForRound } = useBuzzVerdict(round, me);
  const fresh = useFreshReveals(round);
  const justRevealedFm = useJustRevealedFastMoney(game?.fastMoney);
  const moment = useMoments(game, lastEvent, false);
  const [problem, setProblem] = useState<string>();
  const [toast, setToast] = useState<{ text: string; ms: number }>();
  const [chatOpenTeam, setChatOpenTeam] = useState<string>();
  const rejoinTried = useRef(false);
  const armKey = useRef<number>();
  const roundNumber = useRef<number>();
  roundNumber.current = round?.number;

  const isMember = game?.players.some((player) => player.id === me) ?? false;
  const canRejoin = Boolean(getLastGame()?.gameId === gameId ? getLastGame()?.displayName : getDisplayName());
  const spectating = game !== undefined && !isMember && !canRejoin;
  const cue = game ? (spectating ? spectatorCue(game) : playerCue(game, me)) : undefined;
  const splash = usePlayerCues(spectating ? undefined : cue);

  useWakeLock(game !== undefined && game.status !== "FINISHED");

  /**
   * Resume: if this browser joined this game before (or has a name on file),
   * re-run the idempotent join so a cleared server seat or a fresh tab lands
   * back on the same player id without a trip through the join form.
   */
  useEffect(() => {
    if (!game || !gameId || rejoinTried.current) return;
    if (game.players.some((player) => player.id === me)) return;
    if (game.status === "FINISHED") return;
    const name = getLastGame()?.gameId === gameId ? getLastGame()?.displayName : getDisplayName();
    if (!name) return;
    rejoinTried.current = true;
    joinGame(game.joinCode, me, name)
      .then((update) => {
        setLastGame({ gameId, joinCode: game.joinCode, displayName: name });
        setProblem(undefined);
        applyUpdate(update);
      })
      .catch((cause: unknown) => setProblem(toApiError(cause).message));
  }, [game, gameId, me, applyUpdate]);

  const showToast = useCallback((text: string, ms = TOAST_MS) => setToast({ text, ms }), []);
  const showDuplicateToast = useCallback((text: string) => showToast(text, DUPLICATE_TOAST_MS), [showToast]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(undefined), toast.ms);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Private messages become short toasts; the board itself follows the broadcast.
  useEffect(() => {
    if (lastMessage?.type === "REMOVED") showToast("The host has removed you from the rotation.");
    if (lastMessage?.type !== "BUZZ_RESULT") return;
    const text = lastMessage.detail === "WON" ? "You buzzed first!" : "Too slow — the other side buzzed first.";
    const timer = window.setTimeout(() => {
      if (shownForRound.current !== roundNumber.current) showToast(text);
    }, VERDICT_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [lastMessage, showToast, shownForRound]);

  const verdictKey = verdict ? `${verdict.winnerId}-${round?.number}` : undefined;
  useEffect(() => {
    if (verdictKey && verdict?.won) buzzPhone(60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdictKey]);

  const strikeKey = moment?.moment.kind === "strike" ? moment.key : undefined;
  useEffect(() => {
    if (!strikeKey || !game?.currentRound) return;
    const current = game.currentRound;
    const inPlay = current.state === "STEAL" ? otherTeam(game, current.playingTeamId)?.id : current.playingTeamId;
    if (teamOfPlayer(game, me)?.id === inPlay) buzzPhone(200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strikeKey]);

  async function onBuzz(): Promise<boolean> {
    if (!gameId) return false;
    setProblem(undefined);
    try {
      applyUpdate(await buzz(gameId, me));
      return true;
    } catch (cause) {
      setProblem(toApiError(cause).message);
      return false;
    }
  }

  const bar = <PlayBar state={game ? barState(game) : undefined} muted={muted} onToggleMuted={toggleMuted} realtime={realtime} />;

  if (!game) {
    return (
      <PlayShell bar={bar} chatState="none" keyboardUp={keyboardUp}>
        <p className="sx-waiting">{loading ? "Loading…" : (error?.message ?? "That game could not be found.")}</p>
      </PlayShell>
    );
  }

  const announce = moment?.moment.kind === "strike" ? `Strike ${moment.moment.blades} of ${game.config.strikesToSteal}` : cue?.headline;
  const moments = <MomentLayer current={moment} splash={splash} />;
  const dock = cue && !cue.noDock ? cue : undefined;

  // Spectator: not on the roster and nothing to rejoin with. Show the same
  // board the display shows, read-only, with a way in.
  if (spectating) {
    return (
      <PlayShell bar={bar} dock={dock && <TurnDock cue={dock} />} chatState="none" keyboardUp={keyboardUp} toast={toast?.text} announce={announce}>
        <TvStage game={game} lastEvent={lastEvent} embedded realtime={realtime}>
          <TvShow game={game} lastEvent={lastEvent} clockOffset={clockOffset} embedded />
        </TvStage>
      </PlayShell>
    );
  }

  const self = game.players.find((player) => player.id === me);
  const chatTeamId = (self?.active && self.teamId) || undefined;
  const chatOpen = chatTeamId !== undefined && chatOpenTeam === chatTeamId;
  const armedHere = round !== null && round !== undefined && game.status === "ROUND_ACTIVE" && round.contestantPlayerIds.includes(me) && (round.state === "FACE_OFF_ARMED" || verdict !== null);
  if (lastEvent?.event === "BUZZERS_ARMED" || lastEvent?.event === "BUZZERS_RESET") armKey.current = lastEvent.serverTime;
  const openChat = chatTeamId && !chatOpen ? () => setChatOpenTeam(chatTeamId) : undefined;
  const strip = problem && !armedHere && (
    <p className="sx-strip sx-strip--ember">
      <span>{problem}</span>
      <button className="sx-strip__close" type="button" aria-label="Dismiss" onClick={() => setProblem(undefined)}>
        ×
      </button>
    </p>
  );

  return (
    <PlayShell
      bar={bar}
      dock={dock && <TurnDock cue={dock} onOpenChat={openChat} />}
      chat={
        chatTeamId && gameId ? (
          <TeamChat key={chatTeamId} gameId={gameId} teamId={chatTeamId} game={game} me={me} clockOffset={clockOffset} open={chatOpen} keyboardUp={keyboardUp} onOpenTeamChange={setChatOpenTeam} />
        ) : undefined
      }
      chatState={!chatTeamId ? "none" : chatOpen ? "open" : "closed"}
      keyboardUp={keyboardUp}
      myTurn={cue?.mine && cue.pulse && cue.mood === "gold"}
      toast={toast?.text}
      announce={announce}
      moments={moments}
      overlay={
        armedHere && round ? (
          <BuzzStage game={game} round={round} verdict={verdict} armKey={armKey.current} problem={problem} onDismissProblem={() => setProblem(undefined)} onBuzz={onBuzz} realtime={realtime} muted={muted} onToggleMuted={toggleMuted} />
        ) : undefined
      }
    >
      {strip}
      {(game.status === "LOBBY" || game.status === "TEAMS_SET") && <PlayerLobby game={game} me={me} />}
      {game.status === "ROUND_ACTIVE" && round && <PlayRound game={game} round={round} me={me} fresh={fresh} />}
      {game.status === "ROUND_ACTIVE" && !round && <PlayerLobby game={game} me={me} />}
      {game.status === "FAST_MONEY" && gameId && (
        <PlayFastMoney gameId={gameId} game={game} me={me} clockOffset={clockOffset} lastEvent={lastEvent} lastMessage={lastMessage} justRevealed={justRevealedFm} onToast={showDuplicateToast} />
      )}
      {game.status === "FINISHED" && <Finale game={game} me={me} celebrate={lastEvent?.event === "GAME_FINISHED"} />}
    </PlayShell>
  );
}
