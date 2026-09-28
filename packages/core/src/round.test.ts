import { describe, expect, it } from "vitest";
import {
  allRevealed,
  createRound,
  currentGuesser,
  IllegalTransitionError,
  makeBoard,
  roundReducer,
  type RoundAction,
  type RoundContext,
  type RoundEvent,
} from "./round.js";
import { DEFAULT_CONFIG, type Player, type RoundData, type Survey } from "./types.js";

const survey: Survey = {
  number: 1,
  text: "Name a pet",
  answers: [
    { text: "Cat", points: 30 },
    { text: "Dog", points: 55 },
    { text: "Fish", points: 10 },
  ],
  used: false,
};

function p(id: string, teamId: string, order: number, active = true): Player {
  return { id, displayName: id, teamId, order, active };
}

const players: Player[] = [
  p("a1", "A", 0),
  p("a2", "A", 1),
  p("a3", "A", 2),
  p("b1", "B", 0),
  p("b2", "B", 1),
];

const ctx: RoundContext = { config: DEFAULT_CONFIG, players, teamIds: ["A", "B"] };
const contestants = { A: "a2", B: "b1" };

function fresh(multiplier = 1): RoundData {
  return createRound(1, survey, multiplier, contestants);
}

/** Apply actions in order, returning the final round and every event. */
function play(start: RoundData, actions: RoundAction[], context = ctx): { round: RoundData; events: RoundEvent[] } {
  let round = start;
  const events: RoundEvent[] = [];
  for (const action of actions) {
    const result = roundReducer(round, action, context);
    round = result.round;
    events.push(...result.events);
  }
  return { round, events };
}

const toPlaying = (playingTeamId = "A"): RoundAction[] => [
  { type: "ARM_BUZZERS" },
  { type: "BUZZ", playerId: "a2" },
  { type: "REVEAL", index: 0 },
  { type: "SET_FACE_OFF_WINNER", teamId: "A" },
  { type: "CHOOSE_PASS_OR_PLAY", playingTeamId },
];

describe("makeBoard / createRound", () => {
  it("sorts answers by points descending and re-indexes", () => {
    expect(makeBoard(survey)).toEqual([
      { index: 0, text: "Dog", points: 55, revealed: false },
      { index: 1, text: "Cat", points: 30, revealed: false },
      { index: 2, text: "Fish", points: 10, revealed: false },
    ]);
  });

  it("starts in PICK_CONTESTANTS with the survey question and no pot", () => {
    const round = fresh(2);
    expect(round).toMatchObject({
      number: 1,
      surveyNumber: 1,
      multiplier: 2,
      state: "PICK_CONTESTANTS",
      questionText: "Name a pet",
      contestants,
      pot: 0,
      strikes: 0,
      awardedToTeamId: null,
    });
    expect(createRound(1, survey, 1, contestants).contestants).not.toBe(contestants);
    expect(() => createRound(1, survey, 0, contestants)).toThrow();
  });
});

describe("contestants and buzzers", () => {
  it("lets the host swap a contestant before arming", () => {
    const { round, events } = play(fresh(), [{ type: "SET_CONTESTANT", teamId: "A", playerId: "a3" }]);
    expect(round.contestants).toEqual({ A: "a3", B: "b1" });
    expect(events).toEqual([{ type: "CONTESTANT_CHANGED", teamId: "A", playerId: "a3" }]);
    expect(() => play(fresh(), [{ type: "SET_CONTESTANT", teamId: "A", playerId: "b1" }])).toThrow(/not on team/);
  });

  it("arms, takes the first buzz from a contestant only, and can reset", () => {
    const armed = play(fresh(), [{ type: "ARM_BUZZERS" }]);
    expect(armed.round.state).toBe("FACE_OFF_ARMED");
    expect(armed.events).toEqual([{ type: "BUZZERS_ARMED" }]);

    expect(() => play(armed.round, [{ type: "BUZZ", playerId: "a1" }])).toThrow(/not a face-off contestant/);
    const buzzed = play(armed.round, [{ type: "BUZZ", playerId: "b1" }]);
    expect(buzzed.round).toMatchObject({ state: "FACE_OFF_ANSWERING", buzzWinnerPlayerId: "b1" });

    // A second buzz is illegal once someone has won the buzz.
    expect(() => play(buzzed.round, [{ type: "BUZZ", playerId: "a2" }])).toThrow(IllegalTransitionError);

    const reset = play(buzzed.round, [{ type: "RESET_BUZZERS" }]);
    expect(reset.round).toMatchObject({ state: "FACE_OFF_ARMED", buzzWinnerPlayerId: null });
  });

  it("refuses to arm without both contestants", () => {
    const round = createRound(1, survey, 1, { A: "a1" });
    expect(() => play(round, [{ type: "ARM_BUZZERS" }])).toThrow(/no contestant/);
  });
});

describe("face-off", () => {
  it("reveals add to the pot (with multiplier), strikes count but do not steal, host picks the winner", () => {
    const { round, events } = play(fresh(3), [
      { type: "ARM_BUZZERS" },
      { type: "BUZZ", playerId: "a2" },
      { type: "STRIKE" },
      { type: "RESET_BUZZERS" },
      { type: "BUZZ", playerId: "b1" },
      { type: "REVEAL", index: 1 },
      { type: "SET_FACE_OFF_WINNER", teamId: "B" },
    ]);
    expect(round).toMatchObject({ state: "PASS_OR_PLAY", faceOffWinnerTeamId: "B", pot: 90, strikes: 0 });
    expect(round.board[1].revealed).toBe(true);
    expect(events).toContainEqual({ type: "STRIKE", strikes: 1 });
    expect(events).toContainEqual({ type: "ANSWER_REVEALED", index: 1, points: 90 });
    expect(events).toContainEqual({ type: "FACE_OFF_WON", teamId: "B" });
  });

  it("lets the host award the face-off straight from ARMED (buzzers failed)", () => {
    const { round } = play(fresh(), [{ type: "ARM_BUZZERS" }, { type: "SET_FACE_OFF_WINNER", teamId: "A" }]);
    expect(round.state).toBe("PASS_OR_PLAY");
  });

  it("rejects an unknown team and a re-reveal", () => {
    const armed = play(fresh(), [{ type: "ARM_BUZZERS" }, { type: "BUZZ", playerId: "a2" }, { type: "REVEAL", index: 0 }]);
    expect(() => play(armed.round, [{ type: "REVEAL", index: 0 }])).toThrow(/already revealed/);
    expect(() => play(armed.round, [{ type: "REVEAL", index: 9 }])).toThrow(/No board answer/);
    expect(() => play(armed.round, [{ type: "SET_FACE_OFF_WINNER", teamId: "Z" }])).toThrow(/Unknown team/);
  });
});

describe("pass or play", () => {
  it("builds the guesser queue starting after the playing team's contestant", () => {
    const { round, events } = play(fresh(), toPlaying("A"));
    expect(round).toMatchObject({ state: "PLAYING", playingTeamId: "A", strikes: 0, guesserIndex: 0 });
    expect(round.guesserQueue).toEqual(["a3", "a1", "a2"]);
    expect(currentGuesser(round)).toBe("a3");
    expect(events).toContainEqual({ type: "PLAYING", teamId: "A" });
    expect(events).toContainEqual({ type: "GUESSER_CHANGED", playerId: "a3" });
  });

  it("the winner can pass to the other team", () => {
    const { round } = play(fresh(), toPlaying("B"));
    expect(round.playingTeamId).toBe("B");
    expect(round.guesserQueue).toEqual(["b2", "b1"]);
  });

  it("skips inactive players in the queue", () => {
    const withInactive = { ...ctx, players: players.map((pl) => (pl.id === "a1" ? { ...pl, active: false } : pl)) };
    const { round } = play(fresh(), toPlaying("A"), withInactive);
    expect(round.guesserQueue).toEqual(["a3", "a2"]);
  });

  it("awards immediately when nothing is left to guess", () => {
    const oneAnswer: Survey = { ...survey, answers: [{ text: "Only", points: 100 }] };
    const round = createRound(1, oneAnswer, 1, contestants);
    const result = play(round, toPlaying("A"));
    expect(result.round).toMatchObject({ state: "REVEAL_REMAINING", awardedToTeamId: "A", pot: 100 });
    expect(result.events).toContainEqual({ type: "POT_AWARDED", teamId: "A", points: 100 });
  });
});

describe("playing the board", () => {
  it("reveals score into the pot and rotate the guesser", () => {
    const start = play(fresh(2), toPlaying("A")).round; // pot 110 (Dog 55 × 2)
    const { round, events } = play(start, [{ type: "REVEAL", index: 2 }]);
    expect(round.pot).toBe(110 + 20);
    expect(currentGuesser(round)).toBe("a1");
    expect(events).toEqual([
      { type: "ANSWER_REVEALED", index: 2, points: 20 },
      { type: "GUESSER_CHANGED", playerId: "a1" },
    ]);
  });

  it("awards the pot to the playing team once every answer is revealed", () => {
    const start = play(fresh(), toPlaying("A")).round;
    const { round, events } = play(start, [{ type: "REVEAL", index: 1 }, { type: "REVEAL", index: 2 }]);
    expect(allRevealed(round.board)).toBe(true);
    expect(round).toMatchObject({ state: "REVEAL_REMAINING", awardedToTeamId: "A", pot: 95 });
    expect(events.at(-1)).toEqual({ type: "POT_AWARDED", teamId: "A", points: 95 });
    expect(currentGuesser(round)).toBeNull();
  });

  it("strikes rotate the guesser and the third opens a steal for the other team", () => {
    const start = play(fresh(), toPlaying("A")).round;
    const two = play(start, [{ type: "STRIKE" }, { type: "STRIKE" }]);
    expect(two.round).toMatchObject({ state: "PLAYING", strikes: 2 });
    expect(currentGuesser(two.round)).toBe("a2");

    const three = play(two.round, [{ type: "STRIKE" }]);
    expect(three.round).toMatchObject({ state: "STEAL", strikes: 3, playingTeamId: "A" });
    expect(three.events).toEqual([
      { type: "STRIKE", strikes: 3 },
      { type: "STEAL_OPPORTUNITY", teamId: "B" },
    ]);
    expect(currentGuesser(three.round)).toBeNull();
  });

  it("honours a configured strikesToSteal", () => {
    const strict = { ...ctx, config: { ...DEFAULT_CONFIG, strikesToSteal: 1 } };
    const start = play(fresh(), toPlaying("A"), strict).round;
    expect(play(start, [{ type: "STRIKE" }], strict).round.state).toBe("STEAL");
  });

  it("skipGuesser advances without a strike", () => {
    const start = play(fresh(), toPlaying("A")).round;
    const { round, events } = play(start, [{ type: "SKIP_GUESSER" }]);
    expect(round.strikes).toBe(0);
    expect(currentGuesser(round)).toBe("a1");
    expect(events).toEqual([{ type: "GUESSER_CHANGED", playerId: "a1" }]);
  });

  it("wraps the guesser queue", () => {
    const start = play(fresh(), toPlaying("A")).round;
    const { round } = play(start, [{ type: "SKIP_GUESSER" }, { type: "SKIP_GUESSER" }, { type: "SKIP_GUESSER" }]);
    expect(currentGuesser(round)).toBe("a3");
  });
});

describe("steal", () => {
  const toSteal = (): RoundData =>
    play(fresh(), [...toPlaying("A"), { type: "STRIKE" }, { type: "STRIKE" }, { type: "STRIKE" }]).round;

  it("a successful steal hands the whole pot (plus the stolen answer) to the other team", () => {
    const { round, events } = play(toSteal(), [{ type: "REVEAL", index: 1 }]);
    expect(round).toMatchObject({ state: "REVEAL_REMAINING", awardedToTeamId: "B", pot: 85 });
    expect(events).toEqual([
      { type: "ANSWER_REVEALED", index: 1, points: 30 },
      { type: "POT_AWARDED", teamId: "B", points: 85 },
    ]);
  });

  it("a failed steal keeps the pot with the playing team", () => {
    const { round, events } = play(toSteal(), [{ type: "STRIKE" }]);
    expect(round).toMatchObject({ state: "REVEAL_REMAINING", awardedToTeamId: "A", pot: 55 });
    expect(events.at(-1)).toEqual({ type: "POT_AWARDED", teamId: "A", points: 55 });
  });

  it("nothing else is allowed during a steal", () => {
    for (const action of [{ type: "SKIP_GUESSER" }, { type: "END_ROUND" }, { type: "ARM_BUZZERS" }] as RoundAction[]) {
      expect(() => play(toSteal(), [action])).toThrow(IllegalTransitionError);
    }
  });
});

describe("reveal remaining and end", () => {
  const awarded = (): RoundData => play(fresh(), [...toPlaying("A"), { type: "STRIKE" }, { type: "STRIKE" }, { type: "STRIKE" }, { type: "STRIKE" }]).round;

  it("reveals leftover answers for no points, then ends", () => {
    const start = awarded();
    const potBefore = start.pot;
    const { round, events } = play(start, [{ type: "REVEAL", index: 1 }, { type: "REVEAL", index: 2 }, { type: "END_ROUND" }]);
    expect(round.pot).toBe(potBefore);
    expect(round.state).toBe("ENDED");
    expect(allRevealed(round.board)).toBe(true);
    expect(events).toContainEqual({ type: "ANSWER_REVEALED", index: 1, points: 0 });
    expect(events.at(-1)).toEqual({ type: "ROUND_ENDED" });
  });

  it("can end without revealing everything, and nothing works after ENDED", () => {
    const { round } = play(awarded(), [{ type: "END_ROUND" }]);
    expect(round.state).toBe("ENDED");
    for (const action of [{ type: "REVEAL", index: 1 }, { type: "STRIKE" }, { type: "END_ROUND" }] as RoundAction[]) {
      expect(() => play(round, [action])).toThrow(IllegalTransitionError);
    }
  });
});

describe("illegal transitions", () => {
  it("throws for every action that is out of place in PICK_CONTESTANTS", () => {
    const bad: RoundAction[] = [
      { type: "BUZZ", playerId: "a2" },
      { type: "REVEAL", index: 0 },
      { type: "STRIKE" },
      { type: "SET_FACE_OFF_WINNER", teamId: "A" },
      { type: "CHOOSE_PASS_OR_PLAY", playingTeamId: "A" },
      { type: "SKIP_GUESSER" },
      { type: "END_ROUND" },
      { type: "RESET_BUZZERS" },
    ];
    for (const action of bad) expect(() => play(fresh(), [action])).toThrow(IllegalTransitionError);
  });

  it("cannot end or pass/play before the face-off is decided", () => {
    const armed = play(fresh(), [{ type: "ARM_BUZZERS" }]).round;
    expect(() => play(armed, [{ type: "END_ROUND" }])).toThrow(IllegalTransitionError);
    expect(() => play(armed, [{ type: "CHOOSE_PASS_OR_PLAY", playingTeamId: "A" }])).toThrow(IllegalTransitionError);
    expect(() => play(armed, [{ type: "REVEAL", index: 0 }])).toThrow(IllegalTransitionError);
  });

  it("never mutates its input", () => {
    const start = fresh();
    const snapshot = JSON.stringify(start);
    play(start, [...toPlaying("A"), { type: "STRIKE" }, { type: "REVEAL", index: 1 }]);
    expect(JSON.stringify(start)).toBe(snapshot);
  });
});
