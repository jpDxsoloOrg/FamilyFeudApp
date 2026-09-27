/** Validation for `GameConfigInput` (partial) merged over an existing config. */
import type { GameConfig } from "@familyfeud/core";
import type { Args } from "./args.js";
import { ValidationError } from "./errors.js";

export const CONFIG_LIMITS = {
  roundCount: { min: 1, max: 10 },
  strikesToSteal: { min: 1, max: 5 },
  fastMoneyQuestionCount: { min: 1, max: 10 },
  fastMoneyP1Seconds: { min: 5, max: 180 },
  fastMoneyP2Seconds: { min: 5, max: 180 },
  fastMoneyTarget: { min: 1, max: 1000 },
  multiplier: { min: 1, max: 10 },
} as const;

type NumericKey = Exclude<keyof GameConfig, "roundMultipliers">;

function readInt(input: Args, key: NumericKey, fallback: number): number {
  const value = input[key];
  if (value === undefined || value === null) return fallback;
  const limits = CONFIG_LIMITS[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < limits.min || value > limits.max) {
    throw new ValidationError(`"${key}" must be an integer between ${limits.min} and ${limits.max}`);
  }
  return value;
}

/**
 * Merge a partial config input over `base`. `roundMultipliers` is resized to
 * `roundCount` (padding with 1) when only the count changes, and rejected when
 * an explicit list has the wrong length.
 */
export function mergeConfig(base: GameConfig, input: Args | undefined): GameConfig {
  if (!input) return { ...base, roundMultipliers: [...base.roundMultipliers] };
  const roundCount = readInt(input, "roundCount", base.roundCount);

  let roundMultipliers: number[];
  const rawMultipliers = input.roundMultipliers;
  if (rawMultipliers === undefined || rawMultipliers === null) {
    roundMultipliers = Array.from({ length: roundCount }, (_, i) => base.roundMultipliers[i] ?? 1);
  } else {
    if (!Array.isArray(rawMultipliers) || rawMultipliers.length !== roundCount) {
      throw new ValidationError(`"roundMultipliers" must have exactly ${roundCount} entries`);
    }
    const { min, max } = CONFIG_LIMITS.multiplier;
    roundMultipliers = rawMultipliers.map((value: unknown) => {
      if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
        throw new ValidationError(`Each round multiplier must be an integer between ${min} and ${max}`);
      }
      return value;
    });
  }

  return {
    roundCount,
    roundMultipliers,
    strikesToSteal: readInt(input, "strikesToSteal", base.strikesToSteal),
    fastMoneyQuestionCount: readInt(input, "fastMoneyQuestionCount", base.fastMoneyQuestionCount),
    fastMoneyP1Seconds: readInt(input, "fastMoneyP1Seconds", base.fastMoneyP1Seconds),
    fastMoneyP2Seconds: readInt(input, "fastMoneyP2Seconds", base.fastMoneyP2Seconds),
    fastMoneyTarget: readInt(input, "fastMoneyTarget", base.fastMoneyTarget),
  };
}
