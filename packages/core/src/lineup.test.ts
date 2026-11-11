import { describe, expect, it } from "vitest";
import { drawRandom, effectivePins, LineupError, resolveSlots } from "./lineup.js";

/** Deterministic RNG so draws are repeatable in tests. */
function seeded(seed = 1): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

const pool = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe("drawRandom", () => {
  it("returns distinct items from the pool", () => {
    for (let seed = 1; seed < 50; seed++) {
      const drawn = drawRandom(pool, 5, seeded(seed));
      expect(drawn).toHaveLength(5);
      expect(new Set(drawn).size).toBe(5);
      expect(drawn.every((n) => pool.includes(n))).toBe(true);
    }
  });

  it("does not mutate the pool and can take everything", () => {
    const copy = [...pool];
    expect([...drawRandom(pool, pool.length, seeded())].sort((a, b) => a - b)).toEqual(pool);
    expect(pool).toEqual(copy);
  });

  it("varies with the random source", () => {
    const draws = new Set(Array.from({ length: 20 }, (_, i) => drawRandom(pool, 5, seeded(i + 1)).join(",")));
    expect(draws.size).toBeGreaterThan(1);
  });
});

describe("resolveSlots", () => {
  it("draws all-random slots with no repeats", () => {
    const lineup = resolveSlots(pool, [], 5, seeded(7));
    expect(lineup).toHaveLength(5);
    expect(new Set(lineup).size).toBe(5);
  });

  it("keeps pins in their slots and fills the rest without reusing them", () => {
    for (let seed = 1; seed < 30; seed++) {
      const lineup = resolveSlots(pool, [null, 3, null, 9], 5, seeded(seed));
      expect(lineup[1]).toBe(3);
      expect(lineup[3]).toBe(9);
      expect(new Set(lineup).size).toBe(5);
    }
  });

  it("honours a fully pinned lineup exactly", () => {
    expect(resolveSlots(pool, [4, 2, 8], 3, seeded())).toEqual([4, 2, 8]);
  });

  it("uses the whole bank when it is exactly the required size", () => {
    const lineup = resolveSlots([4, 5, 6], [], 3, seeded(3));
    expect([...lineup].sort()).toEqual([4, 5, 6]);
  });

  it("rejects a bank that is too small", () => {
    expect(() => resolveSlots([1, 2], [], 3)).toThrow(LineupError);
  });

  it("treats a pin to a deleted question as random", () => {
    const lineup = resolveSlots([1, 2, 3], [42, 2], 3, seeded());
    expect(lineup[1]).toBe(2);
    expect([...lineup].sort()).toEqual([1, 2, 3]);
  });

  it("ignores pins past the slot count and duplicate pins", () => {
    expect(effectivePins(pool, [5, 5, null, 7], 3)).toEqual([5, null, null]);
  });
});
