// The round's Stage: what the host reads. Every press lives in the dock, bar the board and the plates' Skip.
import { EyeOff } from "lucide-react";
import type { HostData } from "../hooks/useHostGame";
import { canRevealIn } from "../lib/hostCue";
import type { ApiGame } from "../lib/types";
import { HostBoard } from "./host/HostBoard";
import { NextRoundPanel, type SurveyChoice } from "./host/NextRoundPanel";
import { TeamPlates } from "./host/TeamPlates";

interface Props {
  gameId: string;
  game: ApiGame;
  host: HostData | undefined;
  surveys: SurveyChoice;
  pendingReveals: number[];
  justRevealed: number | null;
  strikeFlashKey: number | null;
  onReveal: (index: number) => void;
  onSkipContestant: (teamId: string) => void;
}

export function HostRound({ gameId, game, host, surveys, pendingReveals, justRevealed, strikeFlashKey, onReveal, onSkipContestant }: Props) {
  const round = game.currentRound;

  if (!round || round.state === "ENDED") {
    return (
      <div className="hx-round">
        <TeamPlates game={game} round={null} flashKey={null} onSkipContestant={onSkipContestant} />
        <NextRoundPanel gameId={gameId} game={game} surveys={surveys} loaded={host !== undefined} />
      </div>
    );
  }

  const question = round.questionText ?? host?.currentQuestion ?? null;

  return (
    <div className="hx-round">
      <TeamPlates game={game} round={round} flashKey={strikeFlashKey} onSkipContestant={onSkipContestant} />
      <p className="hx-question">{question ?? "Loading question…"}</p>
      {!round.questionText && (
        <p className="hx-note hx-prearm">
          <EyeOff size={16} aria-hidden="true" /> Players and the display see the question once you arm the buzzers.
        </p>
      )}
      <HostBoard board={round.board} fullBoard={host?.currentBoard ?? []} live={canRevealIn(round.state)} pending={pendingReveals} justRevealed={justRevealed} onReveal={onReveal} />
    </div>
  );
}
