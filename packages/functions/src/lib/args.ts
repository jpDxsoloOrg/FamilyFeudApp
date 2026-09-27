/** Readers for AppSync resolver arguments, which arrive as `unknown`. */
import { ValidationError } from "./errors.js";

export type Args = Record<string, unknown>;

export interface StringArgOptions {
  maxLength?: number;
  uppercase?: boolean;
}

/** Required string, trimmed; an all-whitespace value is rejected. */
export function requiredString(args: Args, name: string, options: StringArgOptions = {}): string {
  const raw = args[name];
  if (typeof raw !== "string") {
    throw new ValidationError(`"${name}" is required and must be a string`);
  }
  const value = options.uppercase ? raw.trim().toUpperCase() : raw.trim();
  if (value.length === 0) {
    throw new ValidationError(`"${name}" must not be empty`);
  }
  if (options.maxLength !== undefined && value.length > options.maxLength) {
    throw new ValidationError(`"${name}" must be at most ${options.maxLength} characters`);
  }
  return value;
}

export function optionalString(
  args: Args,
  name: string,
  options: StringArgOptions = {},
): string | undefined {
  const raw = args[name];
  if (raw === undefined || raw === null) return undefined;
  return requiredString(args, name, options);
}

export interface IntArgOptions {
  min?: number;
  max?: number;
}

/** Required integer. GraphQL `Int!` guarantees a number, not a sane one. */
export function requiredInt(args: Args, name: string, options: IntArgOptions = {}): number {
  const value = args[name];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ValidationError(`"${name}" is required and must be an integer`);
  }
  if (options.min !== undefined && value < options.min) {
    throw new ValidationError(`"${name}" must be at least ${options.min}`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new ValidationError(`"${name}" must be at most ${options.max}`);
  }
  return value;
}

export function optionalInt(args: Args, name: string, options: IntArgOptions = {}): number | undefined {
  const value = args[name];
  if (value === undefined || value === null) return undefined;
  return requiredInt(args, name, options);
}

export function optionalObject(args: Args, name: string): Args | undefined {
  const value = args[name];
  if (value === undefined || value === null) return undefined;
  return requiredObject(args, name);
}

export function requiredObject(args: Args, name: string): Args {
  const value = args[name];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError(`"${name}" is required and must be an object`);
  }
  return value as Args;
}

export function requiredArray(args: Args, name: string): unknown[] {
  const value = args[name];
  if (!Array.isArray(value)) {
    throw new ValidationError(`"${name}" is required and must be a list`);
  }
  return value;
}
