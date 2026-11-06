/**
 * What this player should know right now, as one value. The dock, the splash,
 * the live region and the haptics all read it, so they can never disagree.
 */
import { otherTeam, playerName, ROUND_STATE_LABEL, teamName, teamOfPlayer } from "./gameHelpers";
import type { ApiGame, PublicRound } from "./types";

export type CueMood = "plain" | "gold" | "blue" | "red";

export type CueAction = { kind: "chat" } | { kind: "link"; to: string; label: string };

/** How a cue announces itself when it becomes this player's. */
export type CueAlert = "armed" | "turn";

export interface PlayerCue {
  id: string;
  mood: CueMood;
  eyebrow: string;
  headline: string;
  detail?: string;
  pulse?: boolean;
  /** This player's own moment. */
  mine: boolean;
  action?: CueAction;
  alert?: CueAlert;
  /** Full-screen splash text, when the moment deserves one. */
  splash?: { headline: string; detail?: string };
  /** Something else on screen owns this moment, so the dock stands aside. */
  noDock?: boolean;
}

function plain(id: string, eyebrow: string, headline: string, detail?: string): PlayerCue {
  return { id, mood: "plain", eyebrow, headline, detail, mine: false };
}

function versus(game: ApiGame, round: PublicRound): string {
  return round.contestantPlayerIds.map((id) => playerName(game, id)).join(" vs ");
}

/** "You're next" is a hint from roster order: the host can still skip people. */
function isNext(game: ApiGame, round: PublicRound, me: string): boolean {
  const roster = teamOfPlayer(game, me)?.players.filter((player) => player.active) ?? [];
  const at = roster.findIndex((player) => player.id === round.currentGuesserPlayerId);
  if (at === -1 || roster.length < 2) return false;
  return roster[(at + 1) % roster.length].id === me;
}

function roundCue(game: ApiGame, round: PublicRound, me: string): PlayerCue {
  const key = `r${round.number}`;
  const eyebrow = `Round ${round.number}`;
  const contestant = round.contestantPlayerIds.includes(me);
  const myTeam = teamOfPlayer(game, me);

  switch (round.state) {
    case "PICK_CONTESTANTS":
      if (contestant) return { id: `${key}-pick-me`, mood: "blue", eyebrow, headline: "You're in the face-off — head to the podium.", mine: false };
      return plain(`${key}-pick`, eyebrow, versus(game, round));
    case "FACE_OFF_ARMED":
      if (contestant) return { id: `${key}-armed-me`, mood: "gold", eyebrow, headline: "Buzz!", mine: true, alert: "armed", noDock: true };
      return plain(`${key}-armed`, eyebrow, `${versus(game, round)} — who buzzes first?`);
    case "FACE_OFF_ANSWERING":
      if (round.buzzWinnerPlayerId === me) return { id: `${key}-answer-me`, mood: "gold", eyebrow, headline: "You buzzed first — answer!", mine: false };
      return { id: `${key}-answer`, mood: "blue", eyebrow, headline: `${playerName(game, round.buzzWinnerPlayerId)} buzzed in`, mine: false };
    case "PASS_OR_PLAY": {
      const headline = `${teamName(game, round.faceOffWinnerTeamId)}: pass or play?`;
      if (myTeam?.id === round.faceOffWinnerTeamId) return { id: `${key}-pass-mine`, mood: "gold", eyebrow, headline, detail: "Tell the host", mine: false };
      return plain(`${key}-pass`, eyebrow, headline);
    }
    case "PLAYING": {
      if (round.currentGuesserPlayerId === me) {
        const headline = "You're up! Give your answer.";
        return { id: `${key}-up-me`, mood: "gold", eyebrow, headline, pulse: true, mine: true, alert: "turn", splash: { headline: "You're up!", detail: "Give your answer." } };
      }
      const headline = `Up now: ${playerName(game, round.currentGuesserPlayerId)}`;
      const id = `${key}-up-${round.currentGuesserPlayerId ?? "none"}`;
      if (myTeam?.id === round.playingTeamId && isNext(game, round, me)) return { id, mood: "blue", eyebrow, headline, detail: "You're next", mine: false };
      return plain(id, eyebrow, headline);
    }
    case "STEAL": {
      const stealer = otherTeam(game, round.playingTeamId);
      if (myTeam && myTeam.id === stealer?.id) {
        const headline = "Your team can steal — confer!";
        return { id: `${key}-steal-mine`, mood: "red", eyebrow, headline, pulse: true, mine: true, action: { kind: "chat" }, alert: "turn", splash: { headline: "Steal!", detail: "Your team can steal — confer!" } };
      }
      return plain(`${key}-steal`, eyebrow, `${stealer?.name ?? "—"} is trying to steal`);
    }
    default:
      if (round.awardedToTeamId) {
        return { id: `${key}-awarded`, mood: "blue", eyebrow, headline: `${round.pot} points to ${teamName(game, round.awardedToTeamId)}`, mine: false };
      }
      return plain(`${key}-over`, eyebrow, "Round over");
  }
}

function lobbyCue(game: ApiGame, me: string): PlayerCue {
  const self = game.players.find((player) => player.id === me);
  const eyebrow = "Lobby";
  if (!self) {
    return { ...plain("lobby-out", eyebrow, "You're not in this game on this device."), action: { kind: "link", to: `/?code=${game.joinCode}`, label: `Join with the code ${game.joinCode}` } };
  }
  if (game.teams.length === 0) return plain("lobby-wait", eyebrow, `Waiting for the host to make teams… ${game.players.length} here so far.`);
  const team = teamOfPlayer(game, me);
  if (!team) return plain("lobby-noteam", eyebrow, "Teams are set — the host will slot you in.");
  const place = team.players.filter((player) => player.active).findIndex((player) => player.id === me) + 1;
  const detail = `#${place} in the order`;
  return { id: `lobby-team-${team.id}`, mood: "plain", eyebrow, headline: `You're on ${team.name}`, detail, mine: true, alert: "turn", splash: { headline: `You're on ${team.name}`, detail } };
}

function fastMoneyCue(game: ApiGame, me: string): PlayerCue {
  const fm = game.fastMoney;
  const eyebrow = "Fast Money";
  if (!fm) return plain("fm-setup-wait", eyebrow, "Fast Money is being set up…");
  const slot = fm.playerIds.indexOf(me) + 1;
  const answering = fm.stage === "P1_ANSWERING" ? 1 : fm.stage === "P2_ANSWERING" ? 2 : 0;
  const timing = fm.timerEndsAt !== null;

  if (fm.stage === "SETUP" && slot !== 0) {
    const headline = `You're playing Fast Money — player ${slot}!`;
    return { id: `fm-setup-${slot}`, mood: "gold", eyebrow, headline, mine: true, alert: "turn", splash: { headline: "Fast Money!", detail: `You're player ${slot}` } };
  }
  if (fm.stage === "P2_ANSWERING" && !timing) {
    if (slot === 2) {
      const headline = "Get ready — you're up next.";
      return { id: "fm-p2-ready", mood: "gold", eyebrow, headline, mine: true, alert: "turn", splash: { headline: "Get ready!", detail: "You're up next." } };
    }
    if (slot === 1) return plain("fm-p2-wait", eyebrow, "Your answers are in");
  }
  if (answering !== 0 && timing) {
    if (slot === answering) return { id: `fm-turn-${slot}`, mood: "gold", eyebrow, headline: "Your turn: answer fast!", mine: true, alert: "turn", noDock: true };
    const name = playerName(game, fm.playerIds[answering - 1]);
    if (slot !== 0) return { ...plain(`fm-away-${answering}`, eyebrow, `Look away! ${name} is answering.`), noDock: true };
    return plain(`fm-answering-${answering}`, eyebrow, `${name} is answering…`);
  }
  return plain(`fm-${fm.stage}`, eyebrow, fm.stage === "REVEAL" ? "Let's see those answers" : fm.stage === "DONE" ? "Fast Money is done" : "Fast Money is being set up…");
}

export function playerCue(game: ApiGame, me: string): PlayerCue {
  if (game.status === "FINISHED") return { ...plain("finished", "Game over", "That's the game!"), noDock: true };
  if (game.status === "FAST_MONEY") return fastMoneyCue(game, me);
  if (game.status === "ROUND_ACTIVE" && game.currentRound) return roundCue(game, game.currentRound, me);
  return lobbyCue(game, me);
}

export function spectatorCue(game: ApiGame): PlayerCue {
  const finished = game.status === "FINISHED";
  return {
    ...plain("spectator", "Spectator", "You're watching."),
    action: finished ? { kind: "link", to: "/", label: "Back to start" } : { kind: "link", to: `/?code=${game.joinCode}`, label: `Join with code ${game.joinCode}` },
  };
}

/** One line for the top bar, e.g. "Round 3 · ×2 · Playing the board". */
export function barState(game: ApiGame): string {
  const round = game.currentRound;
  if (game.status === "ROUND_ACTIVE" && round) {
    return [`Round ${round.number}`, round.multiplier > 1 ? `×${round.multiplier}` : "", ROUND_STATE_LABEL[round.state]].filter(Boolean).join(" · ");
  }
  if (game.status === "FAST_MONEY") return "Fast Money";
  if (game.status === "FINISHED") return "Game over";
  return game.teams.length > 0 ? "Teams are set" : "Lobby";
}
