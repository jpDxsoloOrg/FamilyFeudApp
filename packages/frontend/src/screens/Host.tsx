import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CueDock } from "../components/host/CueDock";
import { DisplaySheet } from "../components/host/DisplaySheet";
import { ErrorStrip } from "../components/host/ErrorStrip";
import { HostLobby } from "../components/host/HostLobby";
import { HostSheet } from "../components/host/HostSheet";
import { HostShell } from "../components/host/HostShell";
import { KeyLegend, KeySheet } from "../components/host/KeySheet";
import { MenuSheet } from "../components/host/MenuSheet";
import { useSurveyChoice } from "../components/host/NextRoundPanel";
import { PlayersPanel, type PlayerActions } from "../components/host/PlayersPanel";
import { ShowBar } from "../components/host/ShowBar";
import { HostFastMoney, useFastMoneyPicks } from "../components/HostFastMoney";
import { HostRound } from "../components/HostRound";
import { HostTeamChats } from "../components/HostTeamChats";
import { HostTokenGate } from "../components/HostTokenGate";
import { useCountdown } from "../hooks/useCountdown";
import { useDisplayWindow } from "../hooks/useDisplayWindow";
import { useHostGame, type UseHostGameResult } from "../hooks/useHostGame";
import { useHostKeys, type HostUiKeys } from "../hooks/useHostKeys";
import { useHostRun } from "../hooks/useHostRun";
import { useJustRevealed } from "../hooks/useJustRevealed";
import { useSounds } from "../hooks/useSounds";
import {
  armBuzzers,
  assignPlayer,
  buzzDuplicate,
  choosePassOrPlay,
  endFastMoneyTurn,
  endRound,
  finishGame,
  joinGame,
  randomizeTeams,
  removePlayer,
  reorderPlayer,
  resetBuzzers,
  restorePlayer,
  revealAnswer,
  revealFastMoneyAnswer,
  selectFastMoneyPlayers,
  setFaceOffWinner,
  setTeamName,
  skipContestant,
  skipGuesser,
  startFastMoneyTurn,
  startRound,
  strike,
  undoRoundAction,
} from "../lib/api";
import { canRevealIn, cueFor, fmPickKey, fmRevealView, type CueActions, type FmPick, type FmSlot } from "../lib/hostCue";
import type { ApiGame, ApiGameUpdate } from "../lib/types";
import "../host.css";

const LOBBY_STATUSES = new Set(["LOBBY", "TEAMS_SET"]);
const CHATS_DOCKED = "(min-width: 1440px)";
const EMPTY_SURVEYS: never[] = [];

/** Ids for host-created test players. The prefix marks them in the roster. */
export const TEST_PLAYER_PREFIX = "test-";

function testPlayerId(): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${TEST_PLAYER_PREFIX}${random}`;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = (): void => setMatches(list.matches);
    onChange();
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export function Host() {
  const { gameId } = useParams<{ gameId: string }>();
  const live = useHostGame(gameId);
  const { game, hostToken, isHost, loading, error, lastEvent } = live;
  const { muted, toggleMuted } = useSounds(lastEvent);
  const justRevealed = useJustRevealed(game?.currentRound);

  if (!gameId) {
    return (
      <main className="hx hx-center">
        <div className="hx-panel">
          <h1>Host Console</h1>
          <Link to="/">Back to start</Link>
        </div>
      </main>
    );
  }
  if (!isHost || !hostToken) {
    return <HostTokenGate gameId={gameId} title="Host Console" onStored={() => window.location.reload()} />;
  }

  if (!game) {
    return (
      <main className="hx hx-center">
        <div className="hx-panel">
          <h1>Host Console</h1>
          <p className="muted">{loading ? "Loading…" : (error?.message ?? "That game could not be found.")}</p>
        </div>
      </main>
    );
  }

  return <HostConsole gameId={gameId} token={hostToken} game={game} live={live} muted={muted} toggleMuted={toggleMuted} justRevealed={justRevealed} />;
}

interface ConsoleProps {
  gameId: string;
  token: string;
  game: ApiGame;
  live: UseHostGameResult;
  muted: boolean;
  toggleMuted: () => void;
  justRevealed: number | null;
}

type Sheet = "display" | "menu" | "players" | "keys";

function HostConsole({ gameId: id, token, game, live, muted, toggleMuted, justRevealed }: ConsoleProps) {
  const { host, realtime, lastEvent, clockOffset, applyUpdate, refreshHost } = live;

  const runner = useHostRun({
    applyUpdate,
    reveal: (index) => revealAnswer(id, token, index),
    canReveal: (index) => {
      const round = game.currentRound;
      const slot = round?.board[index];
      return game.status === "ROUND_ACTIVE" && round !== null && canRevealIn(round.state) && slot !== undefined && !slot.revealed;
    },
  });
  const { run, guarded, setNote } = runner;

  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const chatsDocked = useMediaQuery(CHATS_DOCKED);
  const display = useDisplayWindow(id);
  const surveys = useSurveyChoice(host?.surveys ?? EMPTY_SURVEYS);
  const picks = useFastMoneyPicks(game, (name) => setNote(`Swapped out ${name}`));
  const fm = game.fastMoney;
  const seconds = useCountdown(fm?.timerEndsAt, clockOffset);

  const [fmSlot, setFmSlot] = useState<FmSlot>(1);
  const [fmPick, setFmPick] = useState<FmPick | null>(null);
  const reveal = useMemo(
    () => (fm?.stage === "REVEAL" ? fmRevealView(game, host?.fastMoneyAnswers ?? [], host?.fastMoneyQuestions ?? [], fmSlot, fmPick) : undefined),
    [fm?.stage, game, host, fmSlot, fmPick],
  );

  // Stay on a player until they finish, then move to the other.
  const activeLeft = reveal?.active.next !== undefined;
  const otherLeft = reveal?.slots[fmSlot === 1 ? 1 : 0].next !== undefined;
  const revealLoaded = reveal !== undefined && reveal.active.total > 0;
  const lastSeen = useRef({ slot: fmSlot, left: true });
  useEffect(() => {
    if (!revealLoaded) return;
    const { slot, left } = lastSeen.current;
    lastSeen.current = { slot: fmSlot, left: activeLeft };
    if (slot === fmSlot && left && !activeLeft && otherLeft) setFmSlot(fmSlot === 1 ? 2 : 1);
  }, [revealLoaded, activeLeft, otherLeft, fmSlot]);

  const refreshed = (ran: Promise<boolean>): void => {
    void ran.then((done) => {
      if (done) refreshHost();
    });
  };

  async function addTestPlayers(count: number): Promise<void> {
    await guarded(async () => {
      const taken = new Set(game.players.map((player) => player.displayName.toLowerCase()));
      let next = 1;
      let last: ApiGameUpdate | undefined;
      for (let added = 0; added < count; added += 1) {
        while (taken.has(`test ${next}`)) next += 1;
        const name = `Test ${next}`;
        taken.add(name.toLowerCase());
        last = await joinGame(game.joinCode, testPlayerId(), name);
      }
      if (last) applyUpdate(last);
      setNote(`Added ${count} test ${count === 1 ? "player" : "players"}`);
    });
  }

  const actions: CueActions = {
    start: (surveyNumber) => refreshed(run(() => startRound(id, token, surveyNumber))),
    arm: () => void run(() => armBuzzers(id, token)),
    reset: () => void run(() => resetBuzzers(id, token)),
    faceOff: (teamId) => void run(() => setFaceOffWinner(id, token, teamId)),
    passOrPlay: (playingTeamId) => void run(() => choosePassOrPlay(id, token, playingTeamId)),
    reveal: runner.queueReveal,
    revealNext: (index) => void run(() => revealAnswer(id, token, index)),
    strike: () => void run(() => strike(id, token)),
    skipGuesser: () => void run(() => skipGuesser(id, token)),
    endRound: () => void run(() => endRound(id, token)),
    undo: () => void run(() => undoRoundAction(id, token)),
    randomize: () => void run(() => randomizeTeams(id, token)),
    selectPlayers: (teamId, playerIds) => void run(() => selectFastMoneyPlayers(id, token, teamId, playerIds)),
    startTurn: (slot) => void run(() => startFastMoneyTurn(id, token, slot)),
    endTurn: () => refreshed(run(() => endFastMoneyTurn(id, token))),
    fmReveal: (slot, questionIndex, matchedIndex) => refreshed(run(() => revealFastMoneyAnswer(id, token, slot, questionIndex, matchedIndex))),
    finish: () => void run(() => finishGame(id, token)),
    fmSlot: setFmSlot,
    fmPick: (match) => {
      const next = reveal?.active.next;
      if (reveal && next) setFmPick({ key: fmPickKey(reveal.active.slot, next.questionIndex), match });
    },
  };

  const playerActions: PlayerActions = {
    onRename: (teamId, name) => run(() => setTeamName(id, token, teamId, name)),
    onAssign: (playerId, teamId) => run(() => assignPlayer(id, token, playerId, teamId)),
    onReorder: (playerId, order) => run(() => reorderPlayer(id, token, playerId, order)),
    onRemove: (playerId) => void run(() => removePlayer(id, token, playerId)),
    onRestore: (playerId) => void run(() => restorePlayer(id, token, playerId)),
  };

  const cue = cueFor({ game, host, gameId: id, unused: surveys.unused, survey: surveys.selected, picks, reveal, seconds, actions });

  const hasTeams = game.teams.length > 0;
  const toggleChats = useCallback(() => setChatOpen((open) => !open), []);
  const closeChats = useCallback(() => setChatOpen(false), []);
  const ui: HostUiKeys = {
    mute: toggleMuted,
    display: () => setSheet("display"),
    chats: () => {
      if (hasTeams) toggleChats();
    },
    players: () => setSheet("players"),
    keys: () => setSheet("keys"),
    escape: closeChats,
  };
  useHostKeys(cue, ui, sheet !== null);

  const unassigned = game.players.filter((player) => player.teamId === null).length;
  const lobby = LOBBY_STATUSES.has(game.status);
  const strip = <ErrorStrip problem={runner.problem} note={runner.note} onDismiss={runner.clearProblem} onDismissNote={runner.clearNote} />;
  const closeSheet = (): void => setSheet(null);
  const chatsVisible = chatsDocked || chatOpen;

  return (
    <HostShell
      bar={
        <ShowBar
          game={game}
          gameId={id}
          realtime={realtime}
          muted={muted}
          unread={unread}
          unassigned={hasTeams ? unassigned : 0}
          onToggleMuted={toggleMuted}
          onDisplay={ui.display}
          onChats={toggleChats}
          onPlayers={ui.players}
          onMenu={() => setSheet("menu")}
        />
      }
      dock={<CueDock cue={cue} busy={runner.busy} showBar={runner.showBar} flashKey={runner.flashKey} strip={strip} />}
      legend={<KeyLegend cue={cue} hasTeams={hasTeams} />}
      hasChats={hasTeams}
      chats={
        hasTeams && (
          // Never unmounted: each team's socket lives in here.
          <aside className="hx-chats" aria-label="Team chats" data-open={chatOpen ? "" : undefined} {...(chatsVisible ? {} : { inert: "" })}>
            <HostTeamChats gameId={id} teams={game.teams} clockOffset={clockOffset} visible={chatsVisible} onUnread={setUnread} onClose={closeChats} />
          </aside>
        )
      }
      sheets={
        <>
          {sheet === "display" && <DisplaySheet display={display} strip={strip} onClose={closeSheet} />}
          {sheet === "menu" && (
            <MenuSheet
              gameId={id}
              hostToken={token}
              muted={muted}
              unassigned={hasTeams ? unassigned : 0}
              strip={strip}
              onToggleMuted={toggleMuted}
              onPlayers={ui.players}
              onKeys={ui.keys}
              onClose={closeSheet}
            />
          )}
          {sheet === "keys" && <KeySheet onClose={closeSheet} />}
          {sheet === "players" && (
            <HostSheet title="Players" wide strip={strip} onClose={closeSheet}>
              {hasTeams ? <PlayersPanel game={game} mode={lobby ? "lobby" : "live"} busy={runner.busy} {...playerActions} /> : <p className="hx-note">Teams appear here once they are drawn.</p>}
            </HostSheet>
          )}
        </>
      }
    >
      {lobby ? (
        <HostLobby
          gameId={id}
          game={game}
          busy={runner.busy}
          surveysReady={host ? host.surveys.length : undefined}
          surveys={surveys}
          display={display}
          onRandomize={actions.randomize}
          onAddTestPlayers={addTestPlayers}
          {...playerActions}
        />
      ) : game.status === "ROUND_ACTIVE" ? (
        <HostRound
          gameId={id}
          game={game}
          host={host}
          surveys={surveys}
          pendingReveals={runner.pendingReveals}
          justRevealed={justRevealed}
          strikeFlashKey={lastEvent?.event === "STRIKE" ? lastEvent.serverTime : null}
          onReveal={actions.reveal}
          onSkipContestant={(teamId) => void run(() => skipContestant(id, token, teamId))}
        />
      ) : (
        <HostFastMoney
          gameId={id}
          game={game}
          questions={host?.fastMoneyQuestions ?? []}
          answers={host?.fastMoneyAnswers ?? []}
          picks={picks}
          reveal={reveal}
          onPoll={refreshHost}
          onBuzzDuplicate={(questionIndex) =>
            void guarded(async () => {
              await buzzDuplicate(id, token, questionIndex);
              refreshHost();
            })
          }
          onRevealSlot={actions.fmSlot}
          onRevealPick={actions.fmPick}
        />
      )}
    </HostShell>
  );
}
