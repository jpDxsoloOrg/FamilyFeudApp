// Team chat: a slim bar that opens into a sheet on phones and a panel in the rail on computers. Only ever mounted for a player on a team.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { chatMoment, TEAM_MESSAGE_MAX_LENGTH, TEAM_MESSAGE_TTL_MS, unreadCount, unreadLabel } from "@familyfeud/core";
import { useTeamChat } from "../hooks/useTeamChat";
import { sendTeamMessage, toApiError } from "../lib/api";
import type { ApiGame, ApiTeam, ApiTeamMessage } from "../lib/types";

interface Props {
  gameId: string;
  teamId: string;
  game: ApiGame;
  me: string;
  clockOffset: number;
  open: boolean;
  /** From Play, which owns the one visual viewport hook. */
  keyboardUp: boolean;
  /** Play owns this so the shell can make room for the sheet in the same render. */
  onOpenTeamChange: (teamId: string | undefined) => void;
}

const TTL_MINUTES = TEAM_MESSAGE_TTL_MS / 60_000;
const PINNED_SLACK_PX = 32;
/** The side panel's breakpoint, as in show.css. */
const SIDE_PANEL = "(min-width: 940px)";
const QUICK_REPLIES = ["I know it!", "Not sure", "Go for it", "Good one!"];

/** Without `me` (the host) nothing is styled as your own, so every message shows its sender. */
export function MessageList({ messages, me, emptyText = "No messages yet. Say hi!" }: { messages: ApiTeamMessage[]; me?: string; emptyText?: string }) {
  const list = useRef<HTMLOListElement>(null);
  const pinned = useRef(true);

  const followNewest = useCallback(() => {
    if (list.current && pinned.current) list.current.scrollTop = list.current.scrollHeight;
  }, []);

  useLayoutEffect(followNewest, [messages, followNewest]);

  // The keyboard shrinks the list without any new message arriving.
  useEffect(() => {
    if (!list.current) return;
    const observer = new ResizeObserver(followNewest);
    observer.observe(list.current);
    return () => observer.disconnect();
  }, [followNewest]);

  function onScroll(): void {
    const el = list.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < PINNED_SLACK_PX;
  }

  return (
    <ol ref={list} className="chat__list" aria-live="polite" onScroll={onScroll}>
      {messages.length === 0 && <li className="muted small">{emptyText}</li>}
      {messages.map((message) => {
        const mine = message.senderId === me;
        return (
          <li key={message.id} className={`chat__msg${mine ? " chat__msg--mine" : ""}`}>
            {!mine && <span className="chat__sender">{message.senderName}</span>}
            {message.text}
          </li>
        );
      })}
    </ol>
  );
}

/** One line of the game for when the keyboard has taken the board's room. */
function ScoreStrip({ game }: { game: ApiGame }) {
  const [left, right] = game.teams;
  const round = game.status === "ROUND_ACTIVE" ? game.currentRound : null;
  const showStrikes = round && (round.state === "PLAYING" || round.state === "STEAL" || round.state === "FACE_OFF_ANSWERING");
  const team = (t: ApiTeam | undefined) =>
    t && (
      <span className="chat-strip__team">
        <span className="chat-strip__name">{t.name}</span>
        <strong>{t.score}</strong>
      </span>
    );
  return (
    <div className="chat-strip">
      {team(left)}
      <span className="chat-strip__strikes" aria-label={showStrikes ? `${round.strikes} of ${game.config.strikesToSteal} strikes` : undefined}>
        {showStrikes &&
          Array.from({ length: game.config.strikesToSteal }, (_, i) => (
            <span key={i} aria-hidden="true" className={`strikes__x${i < round.strikes ? " strikes__x--on" : ""}`}>
              ✕
            </span>
          ))}
      </span>
      {team(right)}
    </div>
  );
}

/** What is already on the board, so a team can confer on a steal with the keyboard up. Revealed slots only. */
function RevealTicker({ game }: { game: ApiGame }) {
  const round = game.status === "ROUND_ACTIVE" ? game.currentRound : null;
  if (!round) return null;
  const revealed = round.board.filter((slot) => slot.revealed);
  const parts = revealed.map((slot) => `${slot.text} ${slot.points}`);
  return <p className="sx-reveal-ticker">{[...parts, `${revealed.length} of ${round.board.length} up`].join(" · ")}</p>;
}

export function TeamChat({ gameId, teamId, game, me, clockOffset, open, keyboardUp, onOpenTeamChange }: Props) {
  const { messages, addMessage } = useTeamChat(gameId, teamId, clockOffset);
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState<{ text: string; reason: string }>();
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const moment = chatMoment(game, me);
  const momentKey = moment?.key;
  const typing = open && focused && keyboardUp;
  const unread = useMemo(() => unreadCount(messages, seen, me), [messages, seen, me]);
  const latestUnseen = useMemo(() => [...messages].reverse().find((message) => message.senderId !== me && !seen.has(message.id)), [messages, seen, me]);

  const collapse = useCallback(() => {
    input.current?.blur();
    setFocused(false);
    onOpenTeamChange(undefined);
  }, [onOpenTeamChange]);

  useEffect(() => {
    if (window.matchMedia(SIDE_PANEL).matches) onOpenTeamChange(teamId);
  }, [onOpenTeamChange, teamId]);

  // Not a lock: this fires as a moment starts, and reopening during it stays open.
  // Beside the board the panel is in nobody's way, so it only gives up the keyboard.
  useEffect(() => {
    if (!momentKey) return;
    if (window.matchMedia(SIDE_PANEL).matches) input.current?.blur();
    else collapse();
  }, [momentKey, collapse]);

  useEffect(() => {
    if (open) setSeen(new Set(messages.map((message) => message.id)));
  }, [open, messages]);

  async function send(text: string, typed?: string): Promise<void> {
    if (!text || sending) return;
    setSending(true);
    setFailed(undefined);
    try {
      addMessage(await sendTeamMessage(gameId, me, text));
      if (typed !== undefined) setDraft((current) => (current === typed ? "" : current));
    } catch (cause) {
      setFailed({ text, reason: toApiError(cause).message });
    } finally {
      setSending(false);
    }
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    void send(draft.trim(), draft);
  }

  if (moment?.overlay) return null;

  if (!open) {
    return (
      <button className="chat-bar" type="button" onClick={() => onOpenTeamChange(teamId)}>
        {latestUnseen ? (
          <span key={latestUnseen.id} className="chat-bar__preview">
            <span className="sx-sr">Team chat. </span>
            {latestUnseen.senderName}: {latestUnseen.text}
          </span>
        ) : (
          "Team chat"
        )}
        {unread > 0 && <span className="tag tag--gold">{unreadLabel(unread)}</span>}
      </button>
    );
  }

  const note = `Messages disappear after ${TTL_MINUTES} minutes. Only your team and the host can see them.`;

  return (
    <section className={`chat-sheet${typing ? " chat-sheet--typing" : ""}`} aria-label="Team chat" style={{ "--sx-chat-note": JSON.stringify(note) } as CSSProperties}>
      <div className="chat__head">
        {typing ? <ScoreStrip game={game} /> : <span className="chat__title">Team chat</span>}
        <button className="button button--ghost button--small" type="button" onClick={collapse}>
          Close
        </button>
      </div>
      {typing && <RevealTicker game={game} />}
      <MessageList messages={messages} me={me} />
      {failed && (
        <p className="sx-strip sx-strip--ember">
          <span>
            Didn't send. <span className="small">{failed.reason}</span>
          </span>
          <button className="button button--small button--ghost" type="button" disabled={sending} onMouseDown={(event) => event.preventDefault()} onClick={() => void send(failed.text, failed.text === draft.trim() ? draft : undefined)}>
            Retry
          </button>
        </p>
      )}
      <div className="sx-quick">
        {QUICK_REPLIES.map((reply) => (
          <button key={reply} className="sx-quick__reply" type="button" disabled={sending} onMouseDown={(event) => event.preventDefault()} onClick={() => void send(reply)}>
            {reply}
          </button>
        ))}
      </div>
      <form className="chat__form" onSubmit={submit}>
        <input
          ref={input}
          className="input chat__input"
          value={draft}
          maxLength={TEAM_MESSAGE_MAX_LENGTH}
          autoComplete="off"
          enterKeyHint="send"
          placeholder="Message your team"
          aria-label="Message your team"
          onChange={(event) => {
            setDraft(event.target.value);
            setFailed(undefined);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {/* Keep focus in the input, or tapping Send drops the keyboard. */}
        <button className="button button--primary" type="submit" disabled={sending || !draft.trim()} onMouseDown={(event) => event.preventDefault()}>
          Send
        </button>
      </form>
    </section>
  );
}
