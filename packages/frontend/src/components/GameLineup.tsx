// Question-bank lineup: one slot per round and per Fast Money question. Each slot
// is drawn at random (no repeats) when round 1 starts, unless the host pins a
// specific question to it here.
import { useState } from "react";
import { toApiError } from "../lib/api";
import type { ApiLineup, GameConfig } from "../lib/types";

interface BankQuestion {
  number: number;
  text: string;
}

type Pins = (number | null)[];

interface Props {
  config: GameConfig;
  /** Every survey in the bank; only unused ones can be pinned. */
  surveys: (BankQuestion & { used: boolean })[];
  fastMoneyQuestions: BankQuestion[];
  lineup: ApiLineup;
  onSave: (surveyPins: Pins, fastMoneyPins: Pins) => Promise<void>;
}

const RANDOM = "random";

function withPin(pins: Pins, slot: number, value: number | null): Pins {
  const next = [...pins];
  while (next.length <= slot) next.push(null);
  next[slot] = value;
  // Trailing randoms carry no information; keep the stored list short.
  while (next.length > 0 && next[next.length - 1] === null) next.pop();
  return next;
}

function BankStatus({ label, have, need, unit }: { label: string; have: number; need: number; unit: string }) {
  const short = need - have;
  return (
    <p className={short > 0 ? "lineup__status lineup__status--short" : "lineup__status"}>
      <strong>{label}:</strong> {have} in bank / {need} {unit}
      {short > 0 ? ` — add ${short} more before starting` : " ✓"}
    </p>
  );
}

interface SlotListProps {
  title: string;
  slotLabel: (slot: number) => string;
  count: number;
  bank: BankQuestion[];
  pins: Pins;
  busy: boolean;
  onPick: (slot: number, value: number | null) => void;
}

function SlotList({ title, slotLabel, count, bank, pins, busy, onPick }: SlotListProps) {
  const inBank = new Set(bank.map((q) => q.number));
  // A pin to a question that has since been deleted shows (and plays) as random.
  const pinAt = (slot: number): number | null => {
    const pin = pins[slot] ?? null;
    return pin !== null && inBank.has(pin) ? pin : null;
  };
  const pinnedElsewhere = (slot: number, number: number): boolean =>
    Array.from({ length: count }, (_, other) => other).some((other) => other !== slot && pinAt(other) === number);

  return (
    <div className="card lineup__group">
      <h3>{title}</h3>
      {Array.from({ length: count }, (_, slot) => {
        const pin = pinAt(slot);
        return (
          <label className="lineup__slot" key={slot}>
            <span className="lineup__label">{slotLabel(slot)}</span>
            <select
              className="input input--small lineup__select"
              value={pin === null ? RANDOM : String(pin)}
              disabled={busy}
              onChange={(event) => onPick(slot, event.target.value === RANDOM ? null : Number(event.target.value))}
            >
              <option value={RANDOM}>Random</option>
              {bank.map((question) => (
                <option key={question.number} value={question.number} disabled={pinnedElsewhere(slot, question.number)}>
                  #{question.number} — {question.text}
                </option>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
}

function DrawnList({ title, slotLabel, numbers, bank }: { title: string; slotLabel: (slot: number) => string; numbers: number[]; bank: BankQuestion[] }) {
  return (
    <div className="card lineup__group">
      <h3>{title}</h3>
      <ol className="lineup__drawn">
        {numbers.map((number, slot) => (
          <li key={slot}>
            <span className="lineup__label">{slotLabel(slot)}</span>
            <span className="lineup__text">{bank.find((q) => q.number === number)?.text ?? `#${number}`}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function GameLineup({ config, surveys: allSurveys, fastMoneyQuestions, lineup, onSave }: Props) {
  const [busy, setBusy] = useState(false);
  const surveys = allSurveys.filter((survey) => !survey.used);
  const [error, setError] = useState<string>();
  const roundLabel = (slot: number): string => {
    const multiplier = config.roundMultipliers[slot] ?? 1;
    return `Round ${slot + 1}${multiplier > 1 ? ` ×${multiplier}` : ""}`;
  };
  const fmLabel = (slot: number): string => `FM ${slot + 1}`;

  if (lineup.surveys && lineup.fastMoney) {
    return (
      <section>
        <h2>Game lineup</h2>
        <p className="muted small">Drawn when round 1 started. The lineup is now fixed.</p>
        <div className="lineup__grid">
          <DrawnList title="Rounds" slotLabel={roundLabel} numbers={lineup.surveys} bank={allSurveys} />
          <DrawnList title="Fast Money" slotLabel={fmLabel} numbers={lineup.fastMoney} bank={fastMoneyQuestions} />
        </div>
      </section>
    );
  }

  async function save(surveyPins: Pins, fastMoneyPins: Pins): Promise<void> {
    setBusy(true);
    setError(undefined);
    // Drop pins to questions that were deleted or played since, so the save is valid.
    const keep = (pins: Pins, bank: BankQuestion[]): Pins =>
      pins.map((pin) => (pin !== null && bank.some((q) => q.number === pin) ? pin : null));
    try {
      await onSave(keep(surveyPins, surveys), keep(fastMoneyPins, fastMoneyQuestions));
    } catch (cause) {
      setError(toApiError(cause).message);
    } finally {
      setBusy(false);
    }
  }

  const hasPins = [...lineup.surveyPins, ...lineup.fastMoneyPins].some((pin) => pin !== null);

  return (
    <section>
      <h2>Game lineup</h2>
      <p className="muted small">
        Every slot left on <strong>Random</strong> gets a different question from the bank when round 1 starts — no
        repeats. Pick a specific question to lock it into a slot.
      </p>
      <BankStatus label="Survey bank" have={surveys.length} need={config.roundCount} unit="rounds" />
      <BankStatus label="Fast Money bank" have={fastMoneyQuestions.length} need={config.fastMoneyQuestionCount} unit="needed" />
      <div className="lineup__grid">
        <SlotList
          title="Rounds"
          slotLabel={roundLabel}
          count={config.roundCount}
          bank={surveys}
          pins={lineup.surveyPins}
          busy={busy}
          onPick={(slot, value) => save(withPin(lineup.surveyPins, slot, value), lineup.fastMoneyPins)}
        />
        <SlotList
          title="Fast Money"
          slotLabel={fmLabel}
          count={config.fastMoneyQuestionCount}
          bank={fastMoneyQuestions}
          pins={lineup.fastMoneyPins}
          busy={busy}
          onPick={(slot, value) => save(lineup.surveyPins, withPin(lineup.fastMoneyPins, slot, value))}
        />
      </div>
      {error && <p className="field-error">{error}</p>}
      <div className="button-row">
        <button className="button button--small button--ghost" type="button" disabled={busy || !hasPins} onClick={() => save([], [])}>
          Reset all to random
        </button>
      </div>
    </section>
  );
}
