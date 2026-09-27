import { describe, expect, it } from "vitest";
import {
  activeRoster,
  assignToTeam,
  guesserOrderAfter,
  nextContestant,
  renumberTeam,
  reorderWithinTeam,
  setPlayerActive,
  teamRoster,
} from "./rotation.js";
import type { Player } from "./types.js";

function p(id: string, teamId: string | null, order: number, active = true): Player {
  return { id, displayName: id, teamId, order, active };
}

const players: Player[] = [
  p("a", "t1", 0),
  p("b", "t1", 1),
  p("c", "t1", 2, false),
  p("d", "t1", 3),
  p("x", "t2", 0),
  p("y", "t2", 1),
  p("u", null, 0),
];

describe("rosters", () => {
  it("teamRoster keeps inactive players in order; activeRoster drops them", () => {
    expect(teamRoster(players, "t1").map((m) => m.id)).toEqual(["a", "b", "c", "d"]);
    expect(activeRoster(players, "t1").map((m) => m.id)).toEqual(["a", "b", "d"]);
    expect(activeRoster(players, "nope")).toEqual([]);
  });

  it("sorts by order regardless of input order", () => {
    const shuffled = [players[3], players[1], players[0]];
    expect(teamRoster(shuffled, "t1").map((m) => m.id)).toEqual(["a", "b", "d"]);
  });
});

describe("nextContestant", () => {
  const roster = teamRoster(players, "t1");

  it("walks top to bottom and wraps around", () => {
    let cursor = 0;
    const picked: string[] = [];
    for (let i = 0; i < 6; i++) {
      const { player, nextCursor } = nextContestant(roster, cursor);
      picked.push(player.id);
      cursor = nextCursor;
    }
    // c is inactive and skipped (its slot is consumed), so the cycle is a, b, d.
    expect(picked).toEqual(["a", "b", "d", "a", "b", "d"]);
  });

  it("skips an inactive player at the cursor and consumes their slot", () => {
    const { player, nextCursor } = nextContestant(roster, 2);
    expect(player.id).toBe("d");
    expect(nextCursor).toBe(4);
  });

  it("wraps a cursor past the end", () => {
    expect(nextContestant(roster, 7).player.id).toBe("d");
  });

  it("throws on an empty or fully inactive roster", () => {
    expect(() => nextContestant([], 0)).toThrow();
    expect(() => nextContestant([p("z", "t", 0, false)], 0)).toThrow(/no active/);
  });
});

describe("guesserOrderAfter", () => {
  const roster = teamRoster(players, "t1");

  it("starts after the contestant and puts the contestant last", () => {
    expect(guesserOrderAfter(roster, "b")).toEqual(["d", "a", "b"]);
    expect(guesserOrderAfter(roster, "a")).toEqual(["b", "d", "a"]);
    expect(guesserOrderAfter(roster, "d")).toEqual(["a", "b", "d"]);
  });

  it("drops inactive players and tolerates an unknown contestant", () => {
    expect(guesserOrderAfter(roster, "c")).toEqual(["a", "b", "d"]);
    expect(guesserOrderAfter(roster, "ghost")).toEqual(["a", "b", "d"]);
  });
});

describe("assignToTeam", () => {
  it("appends an unassigned late joiner to the bottom of the team", () => {
    const next = assignToTeam(players, "u", "t2");
    expect(teamRoster(next, "t2").map((m) => [m.id, m.order])).toEqual([
      ["x", 0],
      ["y", 1],
      ["u", 2],
    ]);
    expect(next.filter((m) => m.teamId === null)).toEqual([]);
  });

  it("moves a player between teams and closes the gap it left", () => {
    const next = assignToTeam(players, "b", "t2");
    expect(teamRoster(next, "t1").map((m) => [m.id, m.order])).toEqual([
      ["a", 0],
      ["c", 1],
      ["d", 2],
    ]);
    expect(teamRoster(next, "t2").map((m) => m.id)).toEqual(["x", "y", "b"]);
  });

  it("re-assigning to the same team sends the player to the bottom", () => {
    const next = assignToTeam(players, "a", "t1");
    expect(teamRoster(next, "t1").map((m) => m.id)).toEqual(["b", "c", "d", "a"]);
  });

  it("does not mutate its input and throws for an unknown player", () => {
    const before = JSON.stringify(players);
    assignToTeam(players, "u", "t1");
    expect(JSON.stringify(players)).toBe(before);
    expect(() => assignToTeam(players, "ghost", "t1")).toThrow();
  });
});

describe("reorderWithinTeam", () => {
  it("moves a player up and renumbers", () => {
    const next = reorderWithinTeam(players, "d", 0);
    expect(teamRoster(next, "t1").map((m) => [m.id, m.order])).toEqual([
      ["d", 0],
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
  });

  it("moves a player down and clamps out-of-range positions", () => {
    expect(teamRoster(reorderWithinTeam(players, "a", 2), "t1").map((m) => m.id)).toEqual(["b", "c", "a", "d"]);
    expect(teamRoster(reorderWithinTeam(players, "a", 99), "t1").map((m) => m.id)).toEqual(["b", "c", "d", "a"]);
    expect(teamRoster(reorderWithinTeam(players, "d", -5), "t1").map((m) => m.id)).toEqual(["d", "a", "b", "c"]);
  });

  it("leaves other teams untouched", () => {
    const next = reorderWithinTeam(players, "d", 0);
    expect(teamRoster(next, "t2")).toEqual(teamRoster(players, "t2"));
  });
});

describe("setPlayerActive / renumberTeam", () => {
  it("toggles active without changing order", () => {
    const removed = setPlayerActive(players, "b", false);
    expect(removed.find((m) => m.id === "b")).toMatchObject({ active: false, order: 1 });
    expect(setPlayerActive(removed, "b", true).find((m) => m.id === "b")?.active).toBe(true);
    expect(() => setPlayerActive(players, "ghost", true)).toThrow();
  });

  it("renumberTeam closes gaps", () => {
    const gappy = [p("a", "t", 0), p("b", "t", 5), p("c", "t", 9)];
    expect(renumberTeam(gappy, "t").map((m) => m.order)).toEqual([0, 1, 2]);
    expect(renumberTeam([p("q", null, 4)], null)[0].order).toBe(0);
  });
});
