/**
 * The drama layer. `primaryEvent` broadcasts only the first reducer event, so
 * a steal or an award never arrives as its own event: everything here comes
 * from comparing two snapshots.
 */
import { otherTeam, teamName } from "./gameHelpers";
import type { ApiGame } from "./types";

export type Moment =
  | { kind: "round"; ms: number; number: number; multiplier: number }
  | { kind: "strike"; ms: number; blades: number }
  | { kind: "steal"; ms: number; side: "left" | "right" }
  | { kind: "stolen"; ms: number; team: string }
  | { kind: "heldOn"; ms: number; team: string }
  | { kind: "award"; ms: number; team: string; points: number }
  | { kind: "fmWin"; ms: number }
  | { kind: "finale"; ms: number };

/** What the pocket layouts (a phone, the spectator view) also show. */
const EVERYWHERE: ReadonlySet<Moment["kind"]> = new Set(["strike", "finale"]);

export function showsOffStage(moment: Moment): boolean {
  return EVERYWHERE.has(moment.kind);
}

export function diffMoments(prev: ApiGame, next: ApiGame): Moment[] {
  const moments: Moment[] = [];
  const before = prev.currentRound;
  const after = next.currentRound;

  if (after && before?.number !== after.number) {
    moments.push({ kind: "round", ms: 2200, number: after.number, multiplier: after.multiplier });
  }

  if (before && after && before.number === after.number) {
    if (after.strikes > before.strikes) {
      const blades = before.state === "STEAL" ? 1 : Math.min(after.strikes, next.config.strikesToSteal);
      moments.push({ kind: "strike", ms: 1200, blades });
    }
    if (before.state === "PLAYING" && after.state === "STEAL") {
      const stealer = otherTeam(next, after.playingTeamId);
      moments.push({ kind: "steal", ms: 1600, side: stealer && next.teams[1]?.id === stealer.id ? "right" : "left" });
    }
    if (!before.awardedToTeamId && after.awardedToTeamId) {
      const team = teamName(next, after.awardedToTeamId);
      if (before.state !== "STEAL") moments.push({ kind: "award", ms: 2000, team, points: after.pot });
      else if (after.awardedToTeamId === after.playingTeamId) moments.push({ kind: "heldOn", ms: 2000, team });
      else moments.push({ kind: "stolen", ms: 2000, team });
    }
  }

  const target = next.config.fastMoneyTarget;
  if (next.fastMoney && next.fastMoney.total >= target && (prev.fastMoney?.total ?? 0) < target) {
    moments.push({ kind: "fmWin", ms: 3000 });
  }

  if (prev.status !== "FINISHED" && next.status === "FINISHED") moments.push({ kind: "finale", ms: 4000 });
  return moments;
}
