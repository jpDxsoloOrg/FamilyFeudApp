// Fast Money's Stage. Picks and the reveal choice live in the console, because the dock presses them.
import { useCallback, useEffect, useMemo, useState } from "react";
import { teamName, playerName } from "../lib/gameHelpers";
import type { FmRevealView, FmSlot } from "../lib/hostCue";
import type { ApiGame, ApiHostFastMoneyRow, FastMoneyQuestion } from "../lib/types";
import { FastMoneyBoard } from "./FastMoneyBoard";
import { FinalSummary } from "./host/FinalSummary";

const POLL_MS = 1500;

export interface FastMoneyPicks {
  teamId: string;
  picked: string[];
  chooseTeam: (teamId: string) => void;
  toggle: (playerId: string) => void;
}

export function useFastMoneyPicks(game: ApiGame, onSwapped: (name: string) => void): FastMoneyPicks {
  const fm = game.fastMoney;
  const leading = useMemo(() => [...game.teams].sort((a, b) => b.score - a.score)[0], [game.teams]);
  const savedTeam = fm?.teamId ?? leading?.id ?? "";
  const savedIds = fm?.playerIds.join() ?? "";
  const [teamId, setTeamId] = useState(savedTeam);
  const [picked, setPicked] = useState<string[]>(fm?.playerIds ?? []);

  useEffect(() => {
    setTeamId(savedTeam);
    setPicked(savedIds ? savedIds.split(",") : []);
  }, [savedTeam, savedIds]);

  const chooseTeam = useCallback((next: string) => {
    setTeamId(next);
    setPicked([]);
  }, []);

  function toggle(id: string): void {
    if (picked.includes(id)) {
      setPicked(picked.filter((other) => other !== id));
      return;
    }
    if (picked.length === 2) onSwapped(playerName(game, picked[0]));
    setPicked([...picked, id].slice(-2));
  }

  return { teamId, picked, chooseTeam, toggle };
}

function PickPlayers({ game, picks }: { game: ApiGame; picks: FastMoneyPicks }) {
  const team = game.teams.find((candidate) => candidate.id === picks.teamId);
  const members = team?.players.filter((player) => player.active) ?? [];
  return (
    <section className="hx-card hx-fm-pick">
      <h2 className="hx-title">Fast Money: pick the players</h2>
      <p className="hx-note">The leading team is preselected. Choose two players; the first plays first.</p>
      <div className="hx-seg" role="group" aria-label="Team">
        {game.teams.map((candidate, index) => (
          <button key={candidate.id} type="button" className={`hx-seg__item hx-edge--${index === 0 ? "a" : "b"}`} aria-pressed={candidate.id === picks.teamId} onClick={() => picks.chooseTeam(candidate.id)}>
            {candidate.name} ({candidate.score})
          </button>
        ))}
      </div>
      <div className="hx-seats">
        {[0, 1].map((seat) => (
          <div key={seat} className="hx-seat" data-filled={picks.picked[seat] ? "" : undefined}>
            <span className="hx-eyebrow">Seat {seat + 1}</span>
            <strong>{picks.picked[seat] ? playerName(game, picks.picked[seat]) : "Empty"}</strong>
          </div>
        ))}
      </div>
      <div className="hx-picks">
        {members.map((player) => {
          const at = picks.picked.indexOf(player.id);
          return (
            <button key={player.id} type="button" className="hx-pick" aria-pressed={at !== -1} onClick={() => picks.toggle(player.id)}>
              {at !== -1 && <span className="hx-pick__seat">{at + 1}</span>}
              {player.displayName}
            </button>
          );
        })}
      </div>
    </section>
  );
}

interface AnswersProps {
  game: ApiGame;
  questions: FastMoneyQuestion[];
  answers: ApiHostFastMoneyRow[];
  names: [string, string];
  onBuzzDuplicate: (questionIndex: number) => void;
}

function LiveAnswers({ game, questions, answers, names, onBuzzDuplicate }: AnswersProps) {
  const stage = game.fastMoney?.stage;
  const answerOf = (slot: number, q: number) => answers.find((row) => row.slot === slot && row.questionIndex === q);
  const shown = (row: ApiHostFastMoneyRow | undefined) => row?.answer ?? (row?.skipped ? "(skipped)" : "");

  return (
    <ol className="hx-fm-cards">
      {questions.slice(0, game.config.fastMoneyQuestionCount).map((question, q) => {
        const p1 = answerOf(1, q);
        const p2 = answerOf(2, q);
        return (
          <li key={q} className="hx-fm-card" data-dup={p2?.likelyDuplicate ? "" : undefined}>
            <span className="hx-fm-card__num">Q{q + 1}</span>
            <p className="hx-fm-card__q">{question.text}</p>
            <dl className="hx-fm-card__answers">
              <div>
                <dt>{names[0]}</dt>
                <dd>{shown(p1)}</dd>
              </div>
              <div>
                <dt>{names[1]}</dt>
                <dd>{shown(p2)}</dd>
              </div>
            </dl>
            {stage === "P2_ANSWERING" && p2?.answer && (
              <button className="hx-mini hx-ember" type="button" title="Duplicate of player 1 — make them answer again" onClick={() => onBuzzDuplicate(q)}>
                {p2.likelyDuplicate ? "Duplicate!" : "Buzz dup"}
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function RevealCard({ view, onSlot, onPick }: { view: FmRevealView; onSlot: (slot: FmSlot) => void; onPick: (match: number | null) => void }) {
  const { slots, active, question, suggested, choice } = view;
  const next = active.next;
  return (
    <section className="hx-card hx-fm-reveal">
      <div className="hx-seg" role="group" aria-label="Player">
        {slots.map((slot) => (
          <button key={slot.slot} type="button" className="hx-seg__item" aria-pressed={slot.slot === active.slot} onClick={() => onSlot(slot.slot)}>
            {slot.name} {slot.revealed}/{slot.total}
          </button>
        ))}
      </div>
      {!next || !question ? (
        <p className="hx-note">{active.name}: all revealed.</p>
      ) : (
        <>
          <h3 className="hx-fm-reveal__q">
            Reveal {active.name} · Q{next.questionIndex + 1}: {question.text}
          </h3>
          <p className="hx-fm-reveal__answer">
            {next.answer ?? "(no answer)"}
            {next.skipped && <span className="hx-tag hx-tag--plain">skipped</span>}
          </p>
          <div className="hx-matches" role="group" aria-label="Matches board answer">
            {question.answers.map((answer, index) => (
              <button key={index} type="button" className="hx-match" aria-pressed={choice === index} onClick={() => onPick(index)}>
                <kbd className="hx-key">{index + 1}</kbd>
                <span className="hx-match__text">{answer.text}</span>
                {suggested === index && <span className="hx-tag">suggested</span>}
                <span className="hx-match__points">{answer.points}</span>
              </button>
            ))}
            <button type="button" className="hx-match" aria-pressed={choice === null} onClick={() => onPick(null)}>
              <kbd className="hx-key">0</kbd>
              <span className="hx-match__text">Not on the board (0)</span>
            </button>
          </div>
        </>
      )}
    </section>
  );
}

interface Props {
  gameId: string;
  game: ApiGame;
  questions: FastMoneyQuestion[];
  answers: ApiHostFastMoneyRow[];
  picks: FastMoneyPicks;
  reveal: FmRevealView | undefined;
  /** Called while a turn runs so live answers stay fresh (they do not fan out). */
  onPoll: () => void;
  onBuzzDuplicate: (questionIndex: number) => void;
  onRevealSlot: (slot: FmSlot) => void;
  onRevealPick: (match: number | null) => void;
}

export function HostFastMoney({ gameId, game, questions, answers, picks, reveal, onPoll, onBuzzDuplicate, onRevealSlot, onRevealPick }: Props) {
  const fm = game.fastMoney;
  const running = fm?.timerEndsAt !== null && fm?.timerEndsAt !== undefined;

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(onPoll, POLL_MS);
    return () => window.clearInterval(timer);
  }, [running, onPoll]);

  if (!fm) return null;
  const names: [string, string] = [playerName(game, fm.playerIds[0]), playerName(game, fm.playerIds[1])];

  if (fm.stage === "DONE") return <FinalSummary gameId={gameId} game={game} questions={questions} />;
  if (fm.stage === "SETUP") return <PickPlayers game={game} picks={picks} />;
  if (fm.stage === "REVEAL") {
    return (
      <div className="hx-fm-split">
        {reveal && <RevealCard view={reveal} onSlot={onRevealSlot} onPick={onRevealPick} />}
        <FastMoneyBoard fastMoney={fm} questionCount={game.config.fastMoneyQuestionCount} target={game.config.fastMoneyTarget} questions={questions} playerNames={names} />
      </div>
    );
  }
  return (
    <>
      <p className="hx-note hx-fm-team">{teamName(game, fm.teamId)}: {names[0]} then {names[1]}</p>
      <LiveAnswers game={game} questions={questions} answers={answers} names={names} onBuzzDuplicate={onBuzzDuplicate} />
    </>
  );
}
