/**
 * The host's one question, "what do I press now?", answered in one place.
 * A Cue drives the dock, the keys and the legend, so the three cannot disagree.
 */
import { nextClosingReveal, suggestMatch } from "@familyfeud/core";
import { Check, Eye, Flag, PenLine, Play, RotateCcw, Shuffle, SkipForward, Timer, Undo2, X, Zap, type LucideIcon } from "lucide-react";
import type { HostData } from "../hooks/useHostGame";
import { contestantsOf, otherTeam, playerName, ROUND_STATE_LABEL, teamName, teamOfPlayer } from "./gameHelpers";
import type { ApiGame, ApiHostFastMoneyRow, ApiTeam, FastMoneyQuestion, PublicRound, Survey } from "./types";

export type Tone = "advance" | "reveal" | "strike" | "danger" | "neutral";

export interface CueAction {
  id: string;
  label: string;
  tone: Tone;
  outline?: boolean;
  size?: "xl" | "l" | "m" | "s";
  key?: string;
  enabled: boolean;
  reason?: string;
  hold?: boolean;
  title?: string;
  icon?: LucideIcon;
  /** Router link instead of a press. */
  to?: string;
  run: () => void;
}

export interface Cue {
  id: string;
  mood: "gold" | "red" | "blue" | "plain";
  eyebrow: string;
  headline: string;
  detail?: string;
  hint?: string;
  pulse?: boolean;
  clock?: { seconds: number; urgent: boolean };
  lead: CueAction[];
  support: CueAction[];
  undo?: CueAction;
  strike?: CueAction;
  go?: CueAction;
  left?: CueAction;
  right?: CueAction;
  keys?: Record<string, CueAction>;
}

export interface CueActions {
  /** The server takes the next survey from the lineup. */
  start: () => void;
  arm: () => void;
  reset: () => void;
  faceOff: (teamId: string) => void;
  passOrPlay: (playingTeamId: string) => void;
  /** Queued: 1-8 and board tiles. */
  reveal: (index: number) => void;
  /** Not queued: the dock's Reveal next. */
  revealNext: (index: number) => void;
  strike: () => void;
  skipGuesser: () => void;
  endRound: () => void;
  undo: () => void;
  randomize: () => void;
  selectPlayers: (teamId: string, playerIds: string[]) => void;
  startTurn: (slot: number) => void;
  endTurn: () => void;
  fmReveal: (slot: number, questionIndex: number, matchedIndex: number | null) => void;
  finish: () => void;
  fmSlot: (slot: FmSlot) => void;
  fmPick: (match: number | null) => void;
}

export interface CueContext {
  game: ApiGame;
  host: HostData | undefined;
  gameId: string;
  unused: Survey[];
  survey: Survey | undefined;
  /** Surveys missing from the bank before round 1 can start. */
  short: number;
  picks: { teamId: string; picked: string[] };
  reveal: FmRevealView | undefined;
  seconds: number | null;
  actions: CueActions;
}

const URGENT_SECONDS = 5;

export function canRevealIn(state: PublicRound["state"]): boolean {
  return state === "FACE_OFF_ANSWERING" || state === "PLAYING" || state === "STEAL" || state === "REVEAL_REMAINING";
}

export function canStrikeIn(state: PublicRound["state"]): boolean {
  return state === "FACE_OFF_ANSWERING" || state === "PLAYING" || state === "STEAL";
}

/* ---------- Fast Money reveal ---------- */

export type FmSlot = 1 | 2;

export interface FmPick {
  key: string;
  match: number | null;
}

export interface FmSlotProgress {
  slot: FmSlot;
  name: string;
  revealed: number;
  total: number;
  next: ApiHostFastMoneyRow | undefined;
}

export interface FmRevealView {
  slots: [FmSlotProgress, FmSlotProgress];
  active: FmSlotProgress;
  question: FastMoneyQuestion | undefined;
  suggested: number | null;
  choice: number | null;
  allRevealed: boolean;
}

export function fmPickKey(slot: number, questionIndex: number): string {
  return `${slot}-${questionIndex}`;
}

/** The public game lands first, so it says what is revealed; a stale host read must not offer a row twice. */
export function fmRevealView(
  game: ApiGame,
  answers: ApiHostFastMoneyRow[],
  questions: FastMoneyQuestion[],
  slot: FmSlot,
  pick: FmPick | null,
): FmRevealView | undefined {
  const fm = game.fastMoney;
  if (!fm) return undefined;
  const rows = answers.map((row) => ({
    ...row,
    revealed: row.revealed || fm.rows.some((r) => r.slot === row.slot && r.questionIndex === row.questionIndex && r.revealed),
  }));
  const progress = (s: FmSlot): FmSlotProgress => {
    const mine = rows.filter((row) => row.slot === s);
    return {
      slot: s,
      name: playerName(game, fm.playerIds[s - 1]),
      revealed: mine.filter((row) => row.revealed).length,
      total: mine.length,
      next: mine.filter((row) => !row.revealed).sort((a, b) => a.questionIndex - b.questionIndex)[0],
    };
  };
  const slots: [FmSlotProgress, FmSlotProgress] = [progress(1), progress(2)];
  const active = slots[slot - 1];
  const next = active.next;
  const question = next ? questions[next.questionIndex] : undefined;
  const suggested = next?.answer && question ? suggestMatch(next.answer, question.answers) : null;
  const picked = next && pick?.key === fmPickKey(active.slot, next.questionIndex) ? pick : null;
  return {
    slots,
    active,
    question,
    suggested,
    choice: picked ? picked.match : suggested,
    allRevealed: rows.length > 0 && rows.every((row) => row.revealed),
  };
}

/* ---------- helpers ---------- */

function act(id: string, label: string, tone: Tone, run: () => void, extra: Partial<CueAction> = {}): CueAction {
  return { id, label, tone, run, enabled: true, ...extra };
}

function bound(bindings: Record<string, CueAction | undefined>): Record<string, CueAction> {
  const keys: Record<string, CueAction> = {};
  for (const [key, action] of Object.entries(bindings)) if (action) keys[key] = action;
  return keys;
}

/** What the ShowBar chip says. `short` carries the round on a phone. */
export function phaseChip(game: ApiGame): { short: string; label: string; full: string } {
  const round = game.currentRound;
  if (game.status === "ROUND_ACTIVE") {
    if (round && round.state !== "ENDED") {
      const label = ROUND_STATE_LABEL[round.state];
      const multiplied = round.multiplier > 1;
      return {
        short: `R${round.number}${multiplied ? ` ×${round.multiplier}` : ""}`,
        label,
        full: `Round ${round.number}${multiplied ? ` · ×${round.multiplier}` : ""} · ${label}`,
      };
    }
    return { short: "", label: "Between rounds", full: "Between rounds" };
  }
  if (game.status === "FAST_MONEY" || game.status === "FINISHED") {
    const fm = game.fastMoney;
    const label = fm ? fm.stage.replace("_", " ") : "";
    return { short: "FM", label, full: ["Fast Money", fm?.teamId ? teamName(game, fm.teamId) : "", label].filter(Boolean).join(" · ") };
  }
  return game.status === "TEAMS_SET" ? { short: "Lobby", label: "Teams set", full: "Lobby · Teams set" } : { short: "Lobby", label: "", full: "Lobby" };
}

function startLead(ctx: CueContext, number: number): CueAction {
  const { actions, host, gameId, short } = ctx;
  if (host && short > 0) {
    return act("write-survey", "Add surveys in Setup", "advance", () => undefined, { to: `/host/${gameId}/setup`, size: "xl", icon: PenLine });
  }
  return act("start-round", `Start round ${number}`, "advance", () => actions.start(), {
    size: "xl",
    icon: Play,
    enabled: host !== undefined,
    reason: "Loading surveys…",
  });
}

/* ---------- rounds ---------- */

function betweenRoundsCue(ctx: CueContext): Cue {
  const { game, unused, actions } = ctx;
  const number = (game.currentRound?.number ?? 0) + 1;
  const undo = act("undo", "Undo", "neutral", actions.undo, { enabled: false, reason: "No round in play", key: "Z", icon: Undo2, title: "Revert the last host action in this round" });
  const strike = act("strike", "Strike", "strike", actions.strike, { enabled: false, reason: "No round in play", key: "X", icon: X });
  const base = { mood: "plain" as const, support: [], undo, strike, eyebrow: "Between rounds" };

  if (number > game.config.roundCount) {
    return { ...base, id: "rounds-done", headline: "All rounds played. Fast Money comes next.", hint: "Waiting for Fast Money", lead: [] };
  }
  const lead = startLead(ctx, number);
  if (ctx.host && ctx.short > 0) return { ...base, id: `round-${number}-nosurvey`, headline: "Not enough surveys in the bank", lead: [lead] };
  const mult = game.config.roundMultipliers[number - 1] ?? 1;
  const start = { ...lead, key: "Space" };
  return {
    ...base,
    id: `round-${number}-next`,
    headline: `Start round ${number} of ${game.config.roundCount}${mult > 1 ? ` ×${mult}` : ""}`,
    detail: lead.enabled ? undefined : lead.reason,
    lead: [start],
    go: start,
  };
}

function roundCue(ctx: CueContext, round: PublicRound): Cue {
  const { game, actions } = ctx;
  const state = round.state;
  const [left, right] = game.teams;
  const strikeLive = canStrikeIn(state);

  const undo = act("undo", "Undo", "neutral", actions.undo, { key: "Z", icon: Undo2, title: "Revert the last host action in this round" });
  const strike = act("strike", state === "PLAYING" ? `Strike ${round.strikes + 1} of ${game.config.strikesToSteal}` : "Strike", "strike", actions.strike, {
    key: "X",
    icon: X,
    enabled: strikeLive,
    reason: strikeLive ? undefined : "No strikes right now",
  });
  const reset = act("reset", "Reset buzzers", "neutral", actions.reset, { key: "R", icon: RotateCcw });
  const skip = act("skip-guesser", "Skip guesser", "neutral", actions.skipGuesser, { key: "S", icon: SkipForward });

  const slotKeys: Record<string, CueAction> = {};
  for (const slot of round.board) {
    if (slot.index > 7 || slot.revealed) continue;
    slotKeys[String(slot.index + 1)] = act(`reveal-${slot.index}`, `Reveal ${slot.index + 1}`, "reveal", () => actions.reveal(slot.index), { enabled: canRevealIn(state) });
  }

  const base = {
    id: `round-${round.number}-${state}`,
    eyebrow: phaseChip(game).full,
    mood: "plain" as Cue["mood"],
    support: [] as CueAction[],
    lead: [] as CueAction[],
    undo,
    strike,
  };
  const withKeys = (cue: Cue, extra: Record<string, CueAction> = {}): Cue => ({ ...cue, keys: bound({ ...slotKeys, z: undo, x: strike, ...extra }) });
  const sideKey = (team: ApiTeam): string | undefined => (team === left ? "←" : team === right ? "→" : undefined);
  const pairOf = (make: (team: ApiTeam) => CueAction): Pick<Cue, "lead" | "left" | "right"> => {
    const lead = game.teams.map(make);
    return { lead, left: lead[0], right: lead[1] };
  };

  switch (state) {
    case "PICK_CONTESTANTS": {
      const names = contestantsOf(game, round).map(({ player }) => player.displayName);
      const arm = act("arm", "Arm buzzers & show question", "advance", actions.arm, { size: "xl", key: "Space", icon: Zap });
      return withKeys({ ...base, headline: `${names.join(" vs ")}, arm when ready`, lead: [arm], go: arm });
    }
    case "FACE_OFF_ARMED":
    case "FACE_OFF_ANSWERING": {
      const armed = state === "FACE_OFF_ARMED";
      const buzzed = !armed && round.buzzWinnerPlayerId ? teamOfPlayer(game, round.buzzWinnerPlayerId) : undefined;
      const pair = pairOf((team) =>
        act(`win-${team.id}`, `${team.name} wins face-off`, "advance", () => actions.faceOff(team.id), {
          size: "xl",
          icon: Check,
          outline: buzzed !== undefined && buzzed.id !== team.id,
          key: sideKey(team),
        }),
      );
      return withKeys(
        {
          ...base,
          ...pair,
          mood: buzzed ? "gold" : "plain",
          pulse: armed,
          headline: armed ? "Waiting for a buzz" : buzzed ? `${playerName(game, round.buzzWinnerPlayerId)} buzzed in` : "Face-off",
          support: [reset],
          go: buzzed ? pair.lead.find((action) => action.id === `win-${buzzed.id}`) : undefined,
        },
        { r: reset },
      );
    }
    case "PASS_OR_PLAY": {
      const pair = pairOf((team) => {
        const plays = team.id === round.faceOffWinnerTeamId;
        return act(`choose-${team.id}`, plays ? `${team.name} plays` : `Pass to ${team.name}`, "advance", () => actions.passOrPlay(team.id), {
          size: "xl",
          icon: plays ? Play : SkipForward,
          outline: !plays,
          key: sideKey(team),
        });
      });
      return withKeys({
        ...base,
        ...pair,
        headline: `${teamName(game, round.faceOffWinnerTeamId)} won the face-off`,
        go: pair.lead.find((action) => action.id === `choose-${round.faceOffWinnerTeamId}`),
      });
    }
    case "PLAYING":
      return withKeys(
        {
          ...base,
          headline: `${teamName(game, round.playingTeamId)}, up now: ${playerName(game, round.currentGuesserPlayerId)}`,
          hint: "Tap the answer, or Strike",
          support: [skip],
        },
        { s: skip },
      );
    case "STEAL":
      return withKeys({
        ...base,
        mood: "red",
        headline: `${otherTeam(game, round.playingTeamId)?.name ?? "—"} can steal, one answer`,
        hint: "Tap the answer, or Strike",
      });
    default: {
      const hidden = round.board.filter((slot) => !slot.revealed);
      const blue = { ...base, mood: "blue" as const, headline: `${round.pot} to ${teamName(game, round.awardedToTeamId)}, reveal the rest, then end the round` };
      const closing = nextClosingReveal(round.board);
      if (closing) {
        const next = act("reveal-next", "Reveal next", "reveal", () => actions.revealNext(closing.index), { size: "xl", key: "Space", icon: Eye });
        const end = act("end-round", "End round", "danger", actions.endRound, { hold: true, icon: Flag, title: "Hold to end the round with answers still hidden" });
        return withKeys({ ...blue, id: `${base.id}-hidden`, detail: `${hidden.length} still hidden`, lead: [next], support: [end], go: next });
      }
      const last = round.number >= game.config.roundCount;
      const end = act("end-round", last ? "End round, to Fast Money" : "End round", "advance", actions.endRound, { size: "xl", key: "Space", icon: Flag });
      return withKeys({ ...blue, id: `${base.id}-clear`, lead: [end], go: end });
    }
  }
}

/* ---------- lobby ---------- */

function lobbyCue(ctx: CueContext): Cue {
  const { game, actions } = ctx;
  const base = { mood: "plain" as const, eyebrow: phaseChip(game).full, support: [] };
  if (game.status === "TEAMS_SET") {
    const lead = startLead(ctx, 1);
    return {
      ...base,
      id: "lobby-teams",
      headline: ctx.host && ctx.short > 0 ? "Not enough surveys in the bank" : "Start round 1 when everyone's ready",
      detail: lead.enabled ? undefined : lead.reason,
      lead: [lead],
    };
  }
  const enough = game.players.filter((player) => player.active).length >= 2;
  const lead = act("randomize", "Randomize teams", "advance", actions.randomize, { size: "xl", icon: Shuffle, enabled: enough, reason: "Need 2 active players" });
  return { ...base, id: "lobby", headline: "Get everyone in", detail: enough ? undefined : lead.reason, lead: [lead] };
}

/* ---------- fast money ---------- */

function fmSetupCue(ctx: CueContext, base: Pick<Cue, "mood" | "eyebrow" | "lead" | "support">, names: string[]): Cue {
  const { game, actions, picks } = ctx;
  const fm = game.fastMoney!;
  const saved = fm.playerIds.length === 2;
  const unchanged = saved && fm.teamId === picks.teamId && fm.playerIds.join() === picks.picked.join();
  const startP1 = act("start-p1", `Start ${names[0]} (${game.config.fastMoneyP1Seconds}s)`, "advance", () => actions.startTurn(1), { icon: Timer });
  const confirm = act("confirm-players", "Confirm players", "advance", () => actions.selectPlayers(picks.teamId, picks.picked), {
    icon: Check,
    enabled: picks.picked.length === 2 && picks.teamId !== "" && !unchanged,
    reason: unchanged ? "Change a pick to confirm again" : "Pick exactly two players",
  });
  if (unchanged) {
    const lead = { ...startP1, size: "xl" as const, key: "Space" };
    return { ...base, id: "fm-SETUP-saved", headline: `${names[0]} is up first`, lead: [lead], support: [{ ...confirm, outline: true }], go: lead };
  }
  const lead = { ...confirm, size: "xl" as const, key: "Space" };
  return {
    ...base,
    id: "fm-SETUP-picking",
    headline: "Pick two players",
    detail: confirm.enabled ? undefined : confirm.reason,
    lead: [lead],
    support: saved ? [{ ...startP1, outline: true }] : [],
    go: confirm.enabled ? lead : undefined,
  };
}

function fmRevealCue(ctx: CueContext, base: Pick<Cue, "mood" | "eyebrow" | "lead" | "support">): Cue {
  const { actions, reveal } = ctx;
  if (!reveal) return { ...base, id: "fm-REVEAL", headline: "Reveal", hint: "Loading answers…" };
  if (reveal.allRevealed) {
    const finish = act("finish-tap", "Finish game", "advance", actions.finish, { size: "xl", key: "Space", icon: Flag });
    return { ...base, id: "fm-REVEAL-all", headline: "All revealed", lead: [finish], go: finish };
  }
  const [first, second] = reveal.slots;
  const shared = {
    support: [act("finish", "Finish game", "danger", actions.finish, { hold: true, icon: Flag, title: "Hold to finish with answers unrevealed" })],
    left: act("fm-slot-1", first.name, "neutral", () => actions.fmSlot(1)),
    right: act("fm-slot-2", second.name, "neutral", () => actions.fmSlot(2)),
  };
  const { active, question, choice } = reveal;
  const next = active.next;
  if (!next || !question) {
    return { ...base, ...shared, id: `fm-REVEAL-${active.slot}-done`, headline: `${active.name}: all revealed.`, hint: "Switch player to carry on" };
  }
  const answer = next.answer ?? "(no answer)";
  const match = (choice !== null ? question.answers[choice]?.text : undefined) ?? "Not on the board";
  const lead = act("fm-reveal", `Reveal: ${answer} → ${match}`, "reveal", () => actions.fmReveal(active.slot, next.questionIndex, choice), { size: "xl", key: "Space", icon: Eye });
  const keys: Record<string, CueAction> = { "0": act("pick-none", "Not on the board", "neutral", () => actions.fmPick(null)) };
  question.answers.slice(0, 8).forEach((board, index) => {
    keys[String(index + 1)] = act(`pick-${index}`, board.text, "neutral", () => actions.fmPick(index));
  });
  return {
    ...base,
    ...shared,
    id: `fm-REVEAL-${active.slot}-${next.questionIndex}`,
    headline: `${active.name} Q${next.questionIndex + 1}: ${answer}`,
    lead: [lead],
    go: lead,
    keys,
  };
}

function fastMoneyCue(ctx: CueContext): Cue {
  const { game, actions, seconds } = ctx;
  const fm = game.fastMoney;
  const base = { mood: "plain" as const, eyebrow: phaseChip(game).full, lead: [] as CueAction[], support: [] as CueAction[] };
  if (!fm) return { ...base, id: "fm-loading", headline: "Fast Money", hint: "Loading…" };
  const names = [playerName(game, fm.playerIds[0]), playerName(game, fm.playerIds[1])];

  if (fm.stage === "SETUP") return fmSetupCue(ctx, base, names);
  if (fm.stage === "REVEAL") return fmRevealCue(ctx, base);
  if (fm.stage === "DONE") return { ...base, id: "fm-DONE", headline: "Game over", hint: "That's the show" };

  const slot = fm.stage === "P1_ANSWERING" ? 1 : 2;
  const name = names[slot - 1];
  if (fm.timerEndsAt === null) {
    if (slot === 1) return { ...base, id: "fm-P1-idle", headline: `${name} is up next`, hint: "Waiting for the turn to start" };
    const lead = act("start-p2", `Start ${name} (${game.config.fastMoneyP2Seconds}s)`, "advance", () => actions.startTurn(2), { size: "xl", key: "Space", icon: Timer });
    return { ...base, id: "fm-P2-idle", headline: `${name} is up next`, lead: [lead], go: lead };
  }
  const left = seconds ?? 0;
  const running = { ...base, headline: `${name} is answering`, clock: { seconds: left, urgent: left <= URGENT_SECONDS } };
  if (left === 0) {
    const lead = act("end-turn-up", "End turn (time's up)", "advance", actions.endTurn, { size: "xl", key: "Space", icon: Flag });
    return { ...running, id: `fm-${fm.stage}-up`, lead: [lead], go: lead };
  }
  const lead = act("end-turn", "End turn early", "danger", actions.endTurn, { size: "xl", hold: true, icon: Flag, title: "Hold to end the turn early" });
  return { ...running, id: `fm-${fm.stage}-running`, lead: [lead] };
}

export function cueFor(ctx: CueContext): Cue {
  const { game } = ctx;
  if (game.status === "LOBBY" || game.status === "TEAMS_SET") return lobbyCue(ctx);
  if (game.status === "ROUND_ACTIVE") {
    const round = game.currentRound;
    return round && round.state !== "ENDED" ? roundCue(ctx, round) : betweenRoundsCue(ctx);
  }
  return fastMoneyCue(ctx);
}

/* ---------- key list: the legend and the Keys sheet both read this ---------- */

export interface KeyDoc {
  keys: string;
  label: (cue: Cue) => string;
  long: string;
  legal: (cue: Cue, hasTeams: boolean) => boolean;
}

const picking = (cue: Cue): boolean => cue.keys?.["0"] !== undefined;
const anyDigit = (cue: Cue): boolean => ["1", "2", "3", "4", "5", "6", "7", "8"].some((key) => cue.keys?.[key]?.enabled);

export const HOST_KEYS: KeyDoc[] = [
  { keys: "Space", label: () => "Next step", long: "Do the step marked Space (off in the lobby)", legal: (cue) => cue.go?.enabled === true },
  { keys: "1–8", label: (cue) => (picking(cue) ? "Pick match" : "Reveal"), long: "Reveal that answer. In the Fast Money reveal, pick the match", legal: anyDigit },
  { keys: "0", label: () => "No match", long: "Fast Money reveal: not on the board", legal: picking },
  { keys: "X", label: () => "Strike", long: "Strike", legal: (cue) => cue.keys?.x?.enabled === true },
  { keys: "Z", label: () => "Undo", long: "Undo the last host action in this round", legal: (cue) => cue.keys?.z?.enabled === true },
  { keys: "← →", label: (cue) => (cue.id.startsWith("fm-") ? "Player" : "Team"), long: "Pick the left or right team. In the Fast Money reveal, switch player", legal: (cue) => cue.left?.enabled === true },
  { keys: "R", label: () => "Reset", long: "Reset buzzers", legal: (cue) => cue.keys?.r?.enabled === true },
  { keys: "S", label: () => "Skip", long: "Skip guesser", legal: (cue) => cue.keys?.s?.enabled === true },
  { keys: "M", label: () => "Mute", long: "Mute or unmute sounds", legal: () => true },
  { keys: "D", label: () => "Display", long: "Open the Display sheet", legal: () => true },
  { keys: "C", label: () => "Chats", long: "Show or hide team chats", legal: (_cue, hasTeams) => hasTeams },
  { keys: "P", label: () => "Players", long: "Open the Players sheet", legal: () => true },
  { keys: "?", label: () => "Keys", long: "Open this list", legal: () => true },
  { keys: "Esc", label: () => "Close", long: "Close a sheet or the chats; cancel a rename or an edit", legal: () => true },
];
