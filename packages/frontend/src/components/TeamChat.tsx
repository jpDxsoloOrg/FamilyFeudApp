// Team chat: a slim bar that opens into a bottom sheet on phones and a panel beside the board on computers. Only ever mounted for a player on a team.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { chatMoment, TEAM_MESSAGE_MAX_LENGTH, TEAM_MESSAGE_TTL_MS, unreadCount, unreadLabel } from "@familyfeud/core";
import { useTeamChat } from "../hooks/useTeamChat";
import { useVisualViewport } from "../hooks/useVisualViewport";
import { sendTeamMessage, toApiError } from "../lib/api";
import type { ApiGame, ApiTeam, ApiTeamMessage } from "../lib/types";

interface Props {
  gameId: string;
  teamId: string;
  game: ApiGame;
  me: string;
  clockOffset: number;
  open: boolean;
  /** Play owns this so `main` can make room for the sheet in the same render. */
  onOpenTeamChange: (teamId: string | undefined) => void;
}

const TTL_MINUTES = TEAM_MESSAGE_TTL_MS / 60_000;
const PINNED_SLACK_PX = 32;

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

export function TeamChat({ gameId, teamId, game, me, clockOffset, open, onOpenTeamChange }: Props) {
  const { messages, addMessage } = useTeamChat(gameId, teamId, clockOffset);
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [focused, setFocused] = useState(false);
  const keyboardUp = useVisualViewport(open);
  const input = useRef<HTMLInputElement>(null);
  const scrollBeforeOpen = useRef<number>();

  const moment = chatMoment(game, me);
  const momentKey = moment?.key;
  const typing = open && focused && keyboardUp;
  const unread = useMemo(() => unreadCount(messages, seen, me), [messages, seen, me]);

  const collapse = useCallback(() => {
    input.current?.blur();
    setFocused(false);
    onOpenTeamChange(undefined);
  }, [onOpenTeamChange]);

  // Not a lock: this fires as a moment starts, and reopening during it stays open.
  useEffect(() => {
    if (momentKey) collapse();
  }, [momentKey, collapse]);

  useEffect(() => {
    if (open) setSeen(new Set(messages.map((message) => message.id)));
  }, [open, messages]);

  // An open sheet pins `main`, which takes the page's scroll position with it.
  useLayoutEffect(() => {
    if (open || scrollBeforeOpen.current === undefined) return;
    window.scrollTo(0, scrollBeforeOpen.current);
    scrollBeforeOpen.current = undefined;
  }, [open]);

  function expand(): void {
    scrollBeforeOpen.current = window.scrollY;
    onOpenTeamChange(teamId);
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setProblem(undefined);
    try {
      addMessage(await sendTeamMessage(gameId, me, text));
      setDraft((current) => (current === draft ? "" : current));
    } catch (cause) {
      setProblem(toApiError(cause).message);
    } finally {
      setSending(false);
    }
  }

  if (moment?.overlay) return null;

  if (!open) {
    return (
      <button className="chat-bar" type="button" onClick={expand}>
        Team chat
        {unread > 0 && <span className="tag tag--gold">{unreadLabel(unread)}</span>}
      </button>
    );
  }

  return (
    <section className={`chat-sheet${typing ? " chat-sheet--typing" : ""}`} aria-label="Team chat">
      <div className="chat__head">
        {typing ? <ScoreStrip game={game} /> : <span className="chat__title">Team chat</span>}
        <button className="button button--ghost button--small" type="button" onClick={collapse}>
          Close
        </button>
      </div>
      <MessageList messages={messages} me={me} />
      <p className="chat__note muted">Messages disappear after {TTL_MINUTES} minutes. Only your team and the host can see them.</p>
      {problem && <p className="field-error">{problem}</p>}
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
          onChange={(event) => setDraft(event.target.value)}
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
