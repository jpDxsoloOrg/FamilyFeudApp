/** Team chat limits, shared by the server and the client. */
export const TEAM_MESSAGE_MAX_LENGTH = 280;
export const TEAM_MESSAGE_TTL_MS = 20 * 60 * 1000;

const MAX_UNREAD_SHOWN = 99;

export interface ChatMessageLike {
  id: string;
  senderId: string;
  sentAt: number;
}

/** Merge by id, drop what has expired, oldest first. `now` is server time. */
export function mergeMessages<T extends ChatMessageLike>(current: readonly T[], incoming: readonly T[], now: number): T[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()]
    .filter((message) => now - message.sentAt < TEAM_MESSAGE_TTL_MS)
    .sort((a, b) => a.sentAt - b.sentAt || a.id.localeCompare(b.id));
}

export function unreadCount(messages: readonly ChatMessageLike[], seen: ReadonlySet<string>, me: string): number {
  return messages.filter((message) => message.senderId !== me && !seen.has(message.id)).length;
}

export function unreadLabel(count: number): string {
  return `${count > MAX_UNREAD_SHOWN ? `${MAX_UNREAD_SHOWN}+` : count} new`;
}

/** The slice of a game view that decides whether it is this player's moment. */
export interface ChatMomentGame {
  status: string;
  currentRound?: {
    number: number;
    state: string;
    contestantPlayerIds: readonly string[];
    currentGuesserPlayerId?: string | null;
  } | null;
  fastMoney?: {
    stage: string;
    timerEndsAt?: number | null;
    playerIds: readonly string[];
  } | null;
}

export interface ChatMoment {
  /** Changes when the player's turn does, so each new moment closes the chat once. */
  key: string;
  /** The full-screen BUZZ overlay is up, so there is nothing to show chat on. */
  overlay: boolean;
}

/** The player's turn in the spotlight, if it is now. Chat steps aside for it. */
export function chatMoment(game: ChatMomentGame, me: string): ChatMoment | null {
  const round = game.currentRound;
  if (game.status === "ROUND_ACTIVE" && round) {
    const faceOff = round.state === "FACE_OFF_ARMED" || round.state === "FACE_OFF_ANSWERING";
    if (faceOff && round.contestantPlayerIds.includes(me)) {
      return { key: `round-${round.number}-${round.state}`, overlay: round.state === "FACE_OFF_ARMED" };
    }
    if (round.state === "PLAYING" && round.currentGuesserPlayerId === me) {
      return { key: `round-${round.number}-guess`, overlay: false };
    }
  }
  const fm = game.fastMoney;
  if (game.status === "FAST_MONEY" && fm && fm.timerEndsAt != null) {
    const answering = fm.stage === "P1_ANSWERING" ? 0 : fm.stage === "P2_ANSWERING" ? 1 : -1;
    if (answering !== -1 && fm.playerIds[answering] === me) return { key: `fast-money-${fm.stage}`, overlay: false };
  }
  return null;
}
