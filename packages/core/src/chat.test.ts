import { describe, expect, it } from "vitest";
import {
  chatMoment,
  mergeMessages,
  TEAM_MESSAGE_TTL_MS,
  unreadCount,
  unreadLabel,
  type ChatMessageLike,
  type ChatMomentGame,
} from "./chat.js";

const NOW = 1_000_000_000;
const message = (id: string, sentAt: number, senderId = "other"): ChatMessageLike => ({ id, senderId, sentAt });

describe("mergeMessages", () => {
  it("dedupes by id, with the incoming copy winning", () => {
    const merged = mergeMessages([message("a", NOW, "old")], [message("a", NOW, "new")], NOW);
    expect(merged).toEqual([message("a", NOW, "new")]);
  });

  it("sorts oldest first, breaking ties on id", () => {
    const merged = mergeMessages([message("c", NOW), message("b", NOW - 5)], [message("a", NOW)], NOW);
    expect(merged.map((m) => m.id)).toEqual(["b", "a", "c"]);
  });

  it("drops messages at the expiry boundary and keeps those just inside it", () => {
    const merged = mergeMessages(
      [message("gone", NOW - TEAM_MESSAGE_TTL_MS), message("kept", NOW - TEAM_MESSAGE_TTL_MS + 1)],
      [],
      NOW,
    );
    expect(merged.map((m) => m.id)).toEqual(["kept"]);
  });

  it("does not mutate its inputs", () => {
    const current = [message("b", NOW), message("a", NOW - 1)];
    mergeMessages(current, [], NOW);
    expect(current.map((m) => m.id)).toEqual(["b", "a"]);
  });
});

describe("unreadCount", () => {
  it("skips your own messages and anything already seen", () => {
    const messages = [message("mine", NOW, "me"), message("seen", NOW), message("new", NOW)];
    expect(unreadCount(messages, new Set(["seen"]), "me")).toBe(1);
  });

  it("is zero with no messages", () => {
    expect(unreadCount([], new Set(), "me")).toBe(0);
  });
});

describe("unreadLabel", () => {
  it("shows the count up to 99, then caps it", () => {
    expect(unreadLabel(3)).toBe("3 new");
    expect(unreadLabel(99)).toBe("99 new");
    expect(unreadLabel(100)).toBe("99+ new");
  });
});

describe("chatMoment", () => {
  const round = (state: string, extra: Partial<NonNullable<ChatMomentGame["currentRound"]>> = {}): ChatMomentGame => ({
    status: "ROUND_ACTIVE",
    currentRound: { number: 2, state, contestantPlayerIds: ["me", "rival"], currentGuesserPlayerId: null, ...extra },
    fastMoney: null,
  });
  const fastMoney = (stage: string, timerEndsAt: number | null, playerIds = ["me", "partner"]): ChatMomentGame => ({
    status: "FAST_MONEY",
    currentRound: null,
    fastMoney: { stage, timerEndsAt, playerIds },
  });

  it("covers a contestant while buzzers are armed, with the overlay up", () => {
    expect(chatMoment(round("FACE_OFF_ARMED"), "me")).toEqual({ key: "round-2-FACE_OFF_ARMED", overlay: true });
  });

  it("gives answering a new key and no overlay, so the chat closes again", () => {
    expect(chatMoment(round("FACE_OFF_ANSWERING"), "me")).toEqual({ key: "round-2-FACE_OFF_ANSWERING", overlay: false });
  });

  it("leaves everyone else alone during a face-off", () => {
    expect(chatMoment(round("FACE_OFF_ARMED"), "bystander")).toBeNull();
  });

  it("does not trigger before buzzers are armed or after the face-off", () => {
    expect(chatMoment(round("PICK_CONTESTANTS"), "me")).toBeNull();
    expect(chatMoment(round("PASS_OR_PLAY"), "me")).toBeNull();
  });

  it("covers the current guesser only", () => {
    const game = round("PLAYING", { currentGuesserPlayerId: "me" });
    expect(chatMoment(game, "me")).toEqual({ key: "round-2-guess", overlay: false });
    expect(chatMoment(game, "rival")).toBeNull();
  });

  it("covers each Fast Money player only on their own running turn", () => {
    expect(chatMoment(fastMoney("P1_ANSWERING", NOW), "me")?.key).toBe("fast-money-P1_ANSWERING");
    expect(chatMoment(fastMoney("P1_ANSWERING", NOW), "partner")).toBeNull();
    expect(chatMoment(fastMoney("P2_ANSWERING", NOW), "partner")?.key).toBe("fast-money-P2_ANSWERING");
  });

  it("ignores Fast Money when the timer is not running or the stage is not answering", () => {
    expect(chatMoment(fastMoney("P2_ANSWERING", null), "partner")).toBeNull();
    expect(chatMoment(fastMoney("REVEAL", NOW), "me")).toBeNull();
  });

  it("is quiet outside a round or Fast Money", () => {
    expect(chatMoment({ status: "LOBBY" }, "me")).toBeNull();
    expect(chatMoment({ ...round("PLAYING", { currentGuesserPlayerId: "me" }), status: "FINISHED" }, "me")).toBeNull();
  });
});
