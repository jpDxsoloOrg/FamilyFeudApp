// Task 2.8 — game config, survey authoring, Fast Money question authoring.
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { CopyButton } from "../components/CopyButton";
import { HostTokenGate } from "../components/HostTokenGate";
import { QuestionEditor, type QuestionDraft } from "../components/QuestionEditor";
import { RealtimeBadge } from "../components/RealtimeBadge";
import { useHostGame } from "../hooks/useHostGame";
import { deleteSurvey, toApiError, updateConfig, upsertFastMoneyQuestion, upsertSurvey } from "../lib/api";
import type { FastMoneyQuestion, GameConfig, Survey } from "../lib/types";

type ConfigDraft = Record<Exclude<keyof GameConfig, "roundMultipliers">, string> & { roundMultipliers: string[] };

function toDraft(config: GameConfig): ConfigDraft {
  return {
    roundCount: String(config.roundCount),
    strikesToSteal: String(config.strikesToSteal),
    fastMoneyQuestionCount: String(config.fastMoneyQuestionCount),
    fastMoneyP1Seconds: String(config.fastMoneyP1Seconds),
    fastMoneyP2Seconds: String(config.fastMoneyP2Seconds),
    fastMoneyTarget: String(config.fastMoneyTarget),
    roundMultipliers: config.roundMultipliers.map(String),
  };
}

function fromDraft(draft: ConfigDraft): GameConfig {
  return {
    roundCount: Number(draft.roundCount),
    strikesToSteal: Number(draft.strikesToSteal),
    fastMoneyQuestionCount: Number(draft.fastMoneyQuestionCount),
    fastMoneyP1Seconds: Number(draft.fastMoneyP1Seconds),
    fastMoneyP2Seconds: Number(draft.fastMoneyP2Seconds),
    fastMoneyTarget: Number(draft.fastMoneyTarget),
    roundMultipliers: draft.roundMultipliers.map(Number),
  };
}

const NUMBER_FIELDS: { key: Exclude<keyof GameConfig, "roundMultipliers">; label: string; hint: string }[] = [
  { key: "roundCount", label: "Rounds", hint: "1–10" },
  { key: "strikesToSteal", label: "Strikes to steal", hint: "1–5" },
  { key: "fastMoneyQuestionCount", label: "Fast Money questions", hint: "1–10" },
  { key: "fastMoneyP1Seconds", label: "Player 1 seconds", hint: "5–180" },
  { key: "fastMoneyP2Seconds", label: "Player 2 seconds", hint: "5–180" },
  { key: "fastMoneyTarget", label: "Fast Money target", hint: "points to win" },
];

function ConfigForm({
  config,
  locked,
  onSave,
}: {
  config: GameConfig;
  locked: boolean;
  onSave: (config: GameConfig) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ConfigDraft>(() => toDraft(config));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    setDraft(toDraft(config));
  }, [config]);

  /** Keep the multiplier list the same length as the round count while typing. */
  function setRoundCount(value: string): void {
    const count = Number(value);
    setDraft((current) => {
      const multipliers = [...current.roundMultipliers];
      if (Number.isInteger(count) && count >= 1 && count <= 10) {
        while (multipliers.length < count) multipliers.push("1");
        multipliers.length = count;
      }
      return { ...current, roundCount: value, roundMultipliers: multipliers };
    });
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await onSave(fromDraft(draft));
      setMessage("Saved");
    } catch (cause) {
      setError(toApiError(cause).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit} noValidate>
      {locked && <p className="notice">The game has started; settings are locked.</p>}
      <div className="grid-2">
        {NUMBER_FIELDS.map(({ key, label, hint }) => (
          <div className="field" key={key}>
            <label className="label" htmlFor={`cfg-${key}`}>
              {label} <span className="muted small">({hint})</span>
            </label>
            <input
              id={`cfg-${key}`}
              className="input input--small"
              inputMode="numeric"
              value={draft[key]}
              disabled={locked}
              onChange={(event) =>
                key === "roundCount"
                  ? setRoundCount(event.target.value)
                  : setDraft((current) => ({ ...current, [key]: event.target.value }))
              }
            />
          </div>
        ))}
      </div>
      <div className="field">
        <span className="label">Round point multipliers</span>
        <div className="button-row">
          {draft.roundMultipliers.map((value, index) => (
            <label key={index} className="field field--row">
              <span className="muted small">R{index + 1} ×</span>
              <input
                className="input input--small input--points"
                inputMode="numeric"
                aria-label={`Round ${index + 1} multiplier`}
                value={value}
                disabled={locked}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    roundMultipliers: current.roundMultipliers.map((m, i) => (i === index ? event.target.value : m)),
                  }))
                }
              />
            </label>
          ))}
        </div>
      </div>
      {error && <p className="field-error">{error}</p>}
      <div className="button-row">
        <button className="button button--primary" type="submit" disabled={busy || locked}>
          {busy ? "Saving…" : "Save settings"}
        </button>
        {message && <span className="muted small">{message}</span>}
      </div>
    </form>
  );
}

function nextNumber(taken: number[]): number {
  let n = 1;
  while (taken.includes(n)) n += 1;
  return n;
}

interface QuestionListProps<T extends { number: number; text: string; answers: { text: string; points: number }[] }> {
  heading: string;
  intro: string;
  items: T[];
  editorTitle: string;
  canDelete: (item: T) => boolean;
  canEdit: (item: T) => boolean;
  lockedTag?: (item: T) => string | undefined;
  onSave: (draft: QuestionDraft) => Promise<void>;
  onDelete?: (item: T) => Promise<void>;
}

function QuestionList<T extends { number: number; text: string; answers: { text: string; points: number }[] }>({
  heading,
  intro,
  items,
  editorTitle,
  canDelete,
  canEdit,
  lockedTag,
  onSave,
  onDelete,
}: QuestionListProps<T>) {
  const [editing, setEditing] = useState<QuestionDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const taken = items.map((item) => item.number);

  async function save(draft: QuestionDraft): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      await onSave(draft);
      setEditing(null);
    } catch (cause) {
      setError(toApiError(cause).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: T): Promise<void> {
    if (!onDelete || !window.confirm(`Delete #${item.number} "${item.text}"?`)) return;
    setBusy(true);
    setError(undefined);
    try {
      await onDelete(item);
    } catch (cause) {
      setError(toApiError(cause).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>{heading}</h2>
      <p className="muted small">{intro}</p>
      {items.length === 0 && !editing && <p className="muted">None yet.</p>}
      <div className="survey-list">
        {items.map((item) => (
          <div className="card survey-list__item" key={item.number}>
            <span className="roster__order">{item.number}</span>
            <div className="grow">
              <div>
                {item.text}
                {lockedTag?.(item) && <span className="tag">{lockedTag(item)}</span>}
              </div>
              <div className="muted small">
                {item.answers.length} answers · {item.answers.map((a) => `${a.text} ${a.points}`).join(", ")}
              </div>
            </div>
            <div className="roster__actions">
              <button
                className="button button--small"
                type="button"
                disabled={busy || !canEdit(item)}
                onClick={() => setEditing({ number: item.number, text: item.text, answers: item.answers })}
              >
                Edit
              </button>
              {onDelete && (
                <button
                  className="button button--small button--danger"
                  type="button"
                  disabled={busy || !canDelete(item)}
                  onClick={() => remove(item)}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {error && !editing && <p className="field-error">{error}</p>}
      {editing ? (
        <QuestionEditor
          key={editing.number}
          title={`${editorTitle} #${editing.number}`}
          initial={editing}
          takenNumbers={taken.filter((n) => n !== editing.number)}
          busy={busy}
          error={error}
          onSave={save}
          onCancel={() => {
            setEditing(null);
            setError(undefined);
          }}
        />
      ) : (
        <div className="button-row">
          <button
            className="button"
            type="button"
            onClick={() => setEditing({ number: nextNumber(taken), text: "", answers: [] })}
          >
            + Add {editorTitle.toLowerCase()}
          </button>
        </div>
      )}
    </section>
  );
}

export function HostSetup() {
  const { gameId } = useParams<{ gameId: string }>();
  const { game, host, hostToken, isHost, realtime, loading, error, hostError, applyUpdate, patchHost } =
    useHostGame(gameId);

  if (!gameId) {
    return (
      <main className="page page--narrow">
        <h1>Game Setup</h1>
        <Link to="/">Back to start</Link>
      </main>
    );
  }
  if (!isHost || !hostToken) {
    return <HostTokenGate gameId={gameId} title="Game Setup" onStored={() => window.location.reload()} />;
  }

  if (!game) {
    return (
      <main className="page">
        <h1>Game Setup</h1>
        <p className="muted">{loading ? "Loading…" : (error?.message ?? "That game could not be found.")}</p>
      </main>
    );
  }

  const locked = game.status !== "LOBBY" && game.status !== "TEAMS_SET";
  const surveys = host?.surveys ?? [];
  const fastMoneyQuestions = host?.fastMoneyQuestions ?? [];
  const surveysNeeded = game.config.roundCount;
  const fmNeeded = game.config.fastMoneyQuestionCount;

  return (
    <main className="page">
      <header className="page__header">
        <h1>Game Setup</h1>
        <nav className="page__nav">
          <span className="muted">
            Code <strong>{game.joinCode}</strong>
          </span>
          <Link className="button button--small" to={`/host/${gameId}`}>
            Host console →
          </Link>
          <CopyButton value={hostToken} label="Copy host token" />
          <RealtimeBadge status={realtime} />
        </nav>
      </header>

      {hostError && <p className="field-error">{hostError.message}</p>}

      <h2>Settings</h2>
      <ConfigForm
        config={game.config}
        locked={locked}
        onSave={async (config) => applyUpdate(await updateConfig(gameId, hostToken, config))}
      />

      <QuestionList<Survey>
        heading={`Survey questions (${surveys.length}/${surveysNeeded} needed)`}
        intro="One per round. Up to 8 answers each; the board sorts them by points. A survey that has been played is locked."
        items={surveys}
        editorTitle="Survey"
        canEdit={(survey) => !survey.used}
        canDelete={(survey) => !survey.used}
        lockedTag={(survey) => (survey.used ? "played" : undefined)}
        onSave={async (draft) => {
          const saved = await upsertSurvey(gameId, hostToken, draft.number, draft.text, draft.answers);
          patchHost((current) => ({
            ...current,
            surveys: [...current.surveys.filter((s) => s.number !== saved.number), saved].sort(
              (a, b) => a.number - b.number,
            ),
          }));
        }}
        onDelete={async (survey) => {
          await deleteSurvey(gameId, hostToken, survey.number);
          patchHost((current) => ({ ...current, surveys: current.surveys.filter((s) => s.number !== survey.number) }));
        }}
      />

      <QuestionList<FastMoneyQuestion>
        heading={`Fast Money questions (${fastMoneyQuestions.length}/${fmNeeded} needed)`}
        intro="Quick-fire questions for the finale. Locked once Fast Money starts."
        items={fastMoneyQuestions}
        editorTitle="Fast Money question"
        canEdit={() => game.status !== "FAST_MONEY" && game.status !== "FINISHED"}
        canDelete={() => false}
        onSave={async (draft) => {
          const saved = await upsertFastMoneyQuestion(gameId, hostToken, draft.number, draft.text, draft.answers);
          patchHost((current) => ({
            ...current,
            fastMoneyQuestions: [...current.fastMoneyQuestions.filter((q) => q.number !== saved.number), saved].sort(
              (a, b) => a.number - b.number,
            ),
          }));
        }}
      />
    </main>
  );
}
