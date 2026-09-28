/**
 * Errors that map to a client-visible GraphQL error. AppSync surfaces the class
 * name as `errorType`, so these names are part of the API contract the frontend
 * matches on (see frontend `lib/api.ts`).
 */
export class AppError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super("NOT_FOUND", message);
  }
}

/** Bad or missing host token. */
export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super("FORBIDDEN", message);
  }
}

/** Well-formed request, invalid arguments. */
export class ValidationError extends AppError {
  constructor(message = "Invalid request") {
    super("VALIDATION", message);
  }
}

/** The game is not in a state that allows this operation. */
export class ConflictError extends AppError {
  constructor(message = "Conflicting state") {
    super("CONFLICT", message);
  }
}
