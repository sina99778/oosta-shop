// Centralized error handling: a 404 handler for unmatched routes and a single
// error handler that renders AppError, ZodError, and Prisma errors as consistent JSON.

import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { MulterError } from "multer";
import { AppError } from "../utils/httpError";
import { env } from "../config/env";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, "NOT_FOUND", `Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  let statusCode = 500;
  let code = "INTERNAL_SERVER_ERROR";
  let message = "Something went wrong";
  let details: unknown;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = "Validation failed";
    details = err.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
  } else if (err instanceof MulterError) {
    statusCode = 400;
    code = "UPLOAD_ERROR";
    message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Receipt file is too large (max 5 MB)"
        : "File upload failed";
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      statusCode = 409;
      code = "CONFLICT";
      message = "A record with this value already exists";
    } else if (err.code === "P2025") {
      statusCode = 404;
      code = "NOT_FOUND";
      message = "Record not found";
    } else {
      statusCode = 400;
      code = "DATABASE_ERROR";
      message = "Database request error";
    }
  } else if (err instanceof Error && err.message) {
    message = err.message;
  }

  if (statusCode >= 500) {
    console.error(err);
    // Never leak raw internal error text to clients in production; the full
    // error is in the server logs above.
    if (env.isProduction) message = "Something went wrong";
  }

  const error: Record<string, unknown> = { code, message };
  if (details !== undefined) {
    error.details = details;
  }
  if (!env.isProduction && statusCode >= 500 && err instanceof Error) {
    error.stack = err.stack;
  }

  res.status(statusCode).json({ error });
}
