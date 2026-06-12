// Authentication + authorization middleware.
//   authenticate   — requires a valid Bearer JWT; attaches req.user
//   requireRole(…) — requires req.user to hold one of the given roles

import type { NextFunction, Request, Response } from "express";
import type { Role } from "@prisma/client";
import { verifyAccessToken } from "../lib/jwt";
import { looksLikeApiKey, resolveApiKey } from "../lib/apiKey";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/httpError";

// Accepts either a user JWT (Authorization: Bearer <jwt>) OR an API key
// (X-API-Key: oosta_sk_… , or Authorization: Bearer oosta_sk_…). API keys
// authenticate as their owning user (used for programmatic admin access).
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : undefined;
  const apiKeyHeader = (req.headers["x-api-key"] as string | undefined)?.trim();
  const rawKey =
    apiKeyHeader && looksLikeApiKey(apiKeyHeader)
      ? apiKeyHeader
      : bearer && looksLikeApiKey(bearer)
        ? bearer
        : undefined;

  if (rawKey) {
    try {
      const resolved = await resolveApiKey(rawKey);
      if (!resolved) {
        next(new AppError(401, "UNAUTHORIZED", "Invalid API key"));
        return;
      }
      req.user = { id: resolved.userId, role: resolved.role };
      next();
    } catch {
      next(new AppError(401, "UNAUTHORIZED", "Invalid API key"));
    }
    return;
  }

  if (!bearer) {
    next(new AppError(401, "UNAUTHORIZED", "Missing or invalid Authorization header"));
    return;
  }
  // Only a bad/expired JWT is a 401. A DB error during the authorization lookup
  // must propagate to the error handler (500) — not masquerade as an auth failure
  // that makes clients drop a valid session during a transient outage.
  let payload;
  try {
    payload = verifyAccessToken(bearer);
  } catch {
    next(new AppError(401, "UNAUTHORIZED", "Invalid or expired token"));
    return;
  }
  try {
    // The JWT proves identity, but authorization comes from current DB state so
    // deleting or demoting an admin revokes access immediately instead of after 7d.
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true },
    });
    if (!user) {
      next(new AppError(401, "UNAUTHORIZED", "User no longer exists"));
      return;
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, "UNAUTHORIZED", "Authentication required"));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError(403, "FORBIDDEN", "Insufficient permissions"));
      return;
    }
    next();
  };
}
