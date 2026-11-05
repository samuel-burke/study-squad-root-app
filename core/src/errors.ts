/**
 * Error codes shared by server and client. Positive values so they never
 * collide with the Root SDK's own (negative) RootServerExceptionType codes.
 */
export enum ErrorCode {
  Validation = 1001,
  NotFound = 1002,
  Conflict = 1003,
  RateLimited = 1004,
  Forbidden = 1005,
  Internal = 1500,
}

export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const validationError = (message: string) => new DomainError(ErrorCode.Validation, message);
export const notFoundError = (message: string) => new DomainError(ErrorCode.NotFound, message);
export const conflictError = (message: string) => new DomainError(ErrorCode.Conflict, message);
