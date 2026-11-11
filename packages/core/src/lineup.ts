// Question-bank lineup: which survey plays each round and which questions make
// up Fast Money. The host may pin specific questions to slots; every other slot
// is drawn at random from what is left, once, when the game starts.

/** Host-chosen question numbers per slot; `null` means "draw at random". */
export interface LineupPins {
  surveys: (number | null)[];
  fastMoney: (number | null)[];
}

/** The resolved lineup: question numbers in play order. */
export interface Lineup {
  surveys: number[];
  fastMoney: number[];
}

export const EMPTY_PINS: LineupPins = { surveys: [], fastMoney: [] };

export class LineupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LineupError";
  }
}

export type Rng = () => number;

/** `count` distinct items from `pool`, in random order (partial Fisher–Yates). */
export function drawRandom<T>(pool: readonly T[], count: number, rng: Rng = Math.random): T[] {
  if (count > pool.length) throw new LineupError(`Cannot draw ${count} from ${pool.length}`);
  const items = [...pool];
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (items.length - i));
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
  return items.slice(0, count);
}

/**
 * The pins that will actually be honoured for `count` slots: only slots that
 * exist, only questions still in `pool`, and each question at most once (the
 * first slot to claim it wins). Anything else falls back to random.
 */
export function effectivePins(pool: readonly number[], pins: readonly (number | null)[], count: number): (number | null)[] {
  const available = new Set(pool);
  const claimed = new Set<number>();
  return Array.from({ length: count }, (_, slot) => {
    const pin = pins[slot] ?? null;
    if (pin === null || !available.has(pin) || claimed.has(pin)) return null;
    claimed.add(pin);
    return pin;
  });
}

/**
 * Fill `count` slots from `pool`: pinned slots keep their question, the rest get
 * distinct random questions from what is left. Throws when the pool is too small.
 */
export function resolveSlots(
  pool: readonly number[],
  pins: readonly (number | null)[],
  count: number,
  rng: Rng = Math.random,
): number[] {
  if (pool.length < count) throw new LineupError(`Need ${count} questions but the bank has ${pool.length}`);
  const fixed = effectivePins(pool, pins, count);
  const pinned = new Set(fixed.filter((n): n is number => n !== null));
  const drawn = drawRandom(
    pool.filter((n) => !pinned.has(n)),
    fixed.filter((n) => n === null).length,
    rng,
  );
  let next = 0;
  return fixed.map((n) => n ?? (drawn[next++] as number));
}
