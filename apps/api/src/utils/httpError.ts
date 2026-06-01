// Typed application error with an HTTP status code and a stable machine-readable code.
// Thrown anywhere in the request lifecycle and rendered by the central error handler.

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message = "Bad request", details?: unknown): AppError =>
  new AppError(400, "BAD_REQUEST", message, details);

export const unauthorized = (message = "Unauthorized"): AppError =>
  new AppError(401, "UNAUTHORIZED", message);

export const forbidden = (message = "Forbidden"): AppError =>
  new AppError(403, "FORBIDDEN", message);

export const notFound = (message = "Resource not found"): AppError =>
  new AppError(404, "NOT_FOUND", message);

export const conflict = (message = "Conflict", details?: unknown): AppError =>
  new AppError(409, "CONFLICT", message, details);
