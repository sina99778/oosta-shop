// Browser session cookie. The web app no longer keeps the JWT in localStorage
// (readable by any injected script); the API sets it as an httpOnly cookie that
// JavaScript cannot touch. Bearer tokens / API keys keep working for scripts.

import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "../utils/httpError";

export const SESSION_COOKIE = "oosta_session";

function cookieAttributes(maxAgeSeconds: number): string {
  return [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    env.cookieSecure ? "Secure" : "",
    `Max-Age=${maxAgeSeconds}`,
  ]
    .filter(Boolean)
    .join("; ");
}

export function setSessionCookie(res: Response, token: string): void {
  const decoded = jwt.decode(token);
  const exp = decoded && typeof decoded === "object" && decoded.exp ? decoded.exp : 0;
  const maxAge = Math.max(0, exp - Math.floor(Date.now() / 1000));
  res.append("Set-Cookie", `${SESSION_COOKIE}=${token}; ${cookieAttributes(maxAge)}`);
}

export function clearSessionCookie(res: Response): void {
  res.append("Set-Cookie", `${SESSION_COOKIE}=; ${cookieAttributes(0)}`);
}

export function readSessionCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === SESSION_COOKIE) {
      const value = part.slice(index + 1).trim();
      return value || undefined;
    }
  }
  return undefined;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

// CSRF defense in depth on top of SameSite=Lax: a state-changing request that
// authenticates with the cookie (no Authorization / API-key header) must come
// from one of our own origins.
export function requireTrustedOrigin(req: Request, _res: Response, next: NextFunction): void {
  const usesCookie =
    !SAFE_METHODS.has(req.method) &&
    !req.headers.authorization &&
    !req.headers["x-api-key"] &&
    readSessionCookie(req) !== undefined;
  if (!usesCookie) {
    next();
    return;
  }
  const origin = originOf(req.headers.origin) ?? originOf(req.headers.referer);
  if (origin && env.corsOrigins.includes(origin)) {
    next();
    return;
  }
  next(new AppError(403, "BAD_ORIGIN", "Request origin not allowed"));
}
