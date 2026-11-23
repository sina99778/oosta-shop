// Authentication + authorization middleware.
//   authenticate   — requires a valid Bearer JWT; attaches req.user
//   requireRole(…) — requires req.user to hold one of the given roles

import type { NextFunction, Request, Response } from "express";
import type { Role } from "@prisma/client";
import { verifyAccessToken } from "../lib/jwt";
import { looksLikeApiKey, resolveApiKey } from "../lib/apiKey";
import { prisma } from "../lib/prisma";
import { isTrustedCookieWrite, readSessionCookie } from "../lib/sessionCookie";
import { AppError } from "../utils/httpError";
import { TOUCH_INTERVAL_MS } from "../lib/userSessions";

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
      req.authMethod = "api-key";
      next();
    } catch (error) {
      next(error);
    }
    return;
  }

  // An explicit Authorization header wins; browsers use the httpOnly session cookie.
  const cookieToken = bearer ? undefined : readSessionCookie(req);
  const token = bearer ?? cookieToken;
  if (!token) {
    next(new AppError(401, "UNAUTHORIZED", "Missing or invalid Authorization header"));
    return;
  }
  // Only a bad/expired JWT is a 401. A DB error during the authorization lookup
  // must propagate to the error handler (500) — not masquerade as an auth failure
  // that makes clients drop a valid session during a transient outage.
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    next(new AppError(401, "UNAUTHORIZED", "Invalid or expired token"));
    return;
  }
  if (cookieToken && !isTrustedCookieWrite(req)) {
    next(new AppError(403, "CSRF_REJECTED", "Request origin is not allowed"));
    return;
  }
  try {
    // The JWT proves identity, but authorization comes from current DB state so
    // deleting or demoting an admin revokes access immediately instead of after 7d,
    // and a password change / logout-all revokes every older token.
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, sessionVersion: true },
    });
    if (!user) {
      next(new AppError(401, "UNAUTHORIZED", "User no longer exists"));
      return;
    }
    if (user.sessionVersion !== payload.sv) {
      next(new AppError(401, "UNAUTHORIZED", "Session has been revoked"));
      return;
    }
    if (payload.sid) {
      // Device sessions can be revoked one by one from the account security page.
      const session = await prisma.userSession.findUnique({
        where: { id: payload.sid },
        select: { userId: true, revokedAt: true, expiresAt: true, lastSeenAt: true },
      });
      if (
        !session ||
        session.userId !== user.id ||
        session.revokedAt ||
        session.expiresAt.getTime() <= Date.now()
      ) {
        next(new AppError(401, "UNAUTHORIZED", "Session has been revoked"));
        return;
      }
      if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
        await prisma.userSession.updateMany({
          where: { id: payload.sid, revokedAt: null },
          data: { lastSeenAt: new Date() },
        });
      }
      req.sessionId = payload.sid;
    }
    req.user = { id: user.id, role: user.role };
    req.authMethod = cookieToken ? "cookie" : "bearer";
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
