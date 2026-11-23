// Browser session cookie. The JWT lives in an httpOnly cookie so page scripts
// (including any injected by an XSS bug) can never read or exfiltrate it.
// Cookie-authenticated writes are additionally origin-checked in `authenticate`.

import type { Request, Response } from "express";
import { env } from "../config/env";
import { verifyAccessToken } from "./jwt";

export const SESSION_COOKIE = "oosta_session";

function baseAttributes(): string[] {
  const attributes = ["Path=/", "HttpOnly", "SameSite=Lax"];
  if (env.isProduction) attributes.push("Secure");
  return attributes;
}

export function setSessionCookie(res: Response, token: string): void {
  const { exp } = verifyAccessToken(token);
  const maxAge = exp ? Math.max(0, exp - Math.floor(Date.now() / 1000)) : 7 * 24 * 60 * 60;
  res.append(
    "Set-Cookie",
    [`${SESSION_COOKIE}=${token}`, ...baseAttributes(), `Max-Age=${maxAge}`].join("; "),
  );
}

export function clearSessionCookie(res: Response): void {
  res.append(
    "Set-Cookie",
    [
      `${SESSION_COOKIE}=`,
      ...baseAttributes(),
      "Max-Age=0",
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    ].join("; "),
  );
}

export function readSessionCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === SESSION_COOKIE) {
      const value = part.slice(index + 1).trim();
      return value || undefined;
    }
  }
  return undefined;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Cookies ride along on cross-site requests, so a cookie-authenticated write must
// prove it came from the storefront: its Origin (or, failing that, Referer) has to
// be one of the configured CORS origins. Missing both is rejected.
export function isTrustedCookieWrite(req: Request): boolean {
  if (SAFE_METHODS.has(req.method)) return true;
  const origin = req.headers.origin;
  if (origin !== undefined)
    return typeof origin === "string" && origin !== "null" && env.corsOrigins.includes(origin);
  const referer = req.headers.referer;
  if (typeof referer !== "string") return false;
  try {
    return env.corsOrigins.includes(new URL(referer).origin);
  } catch {
    return false;
  }
}
