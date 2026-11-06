/** Small lookups every round screen needs. */
import type { ApiGame, ApiTeam, Player, PublicRound } from "./types";

export function playerById(game: ApiGame, playerId: string | null | undefined): Player | undefined {
  if (!playerId) return undefined;
  return game.players.find((player) => player.id === playerId);
}

export function playerName(game: ApiGame, playerId: string | null | undefined): string {
  return playerById(game, playerId)?.displayName ?? "—";
}

export function teamById(game: ApiGame, teamId: string | null | undefined): ApiTeam | undefined {
  if (!teamId) return undefined;
  return game.teams.find((team) => team.id === teamId);
}

export function teamName(game: ApiGame, teamId: string | null | undefined): string {
  return teamById(game, teamId)?.name ?? "—";
}

export function teamOfPlayer(game: ApiGame, playerId: string): ApiTeam | undefined {
  return game.teams.find((team) => team.players.some((player) => player.id === playerId));
}

export function otherTeam(game: ApiGame, teamId: string | null | undefined): ApiTeam | undefined {
  return game.teams.find((team) => team.id !== teamId);
}

export interface Contestant {
  player: Player;
  team: ApiTeam;
}

/** The two face-off contestants in team order. */
export function contestantsOf(game: ApiGame, round: PublicRound): Contestant[] {
  return round.contestantPlayerIds.flatMap((playerId) => {
    const player = playerById(game, playerId);
    const team = teamOfPlayer(game, playerId);
    return player && team ? [{ player, team }] : [];
  });
}

export const ROUND_STATE_LABEL: Record<PublicRound["state"], string> = {
  PICK_CONTESTANTS: "Contestants to the podium",
  FACE_OFF_ARMED: "Face-off — buzz in!",
  FACE_OFF_ANSWERING: "Face-off",
  PASS_OR_PLAY: "Pass or play?",
  PLAYING: "Playing the board",
  STEAL: "Steal!",
  REVEAL_REMAINING: "Round over",
  ENDED: "Round ended",
};

export interface FinalResult {
  tied: boolean;
  winner: ApiTeam | undefined;
}

/** Who finished ahead on team scores. */
export function finalResult(game: ApiGame): FinalResult {
  const [left, right] = game.teams;
  const tied = Boolean(left && right && left.score === right.score);
  return { tied, winner: [...game.teams].sort((a, b) => b.score - a.score)[0] };
}
