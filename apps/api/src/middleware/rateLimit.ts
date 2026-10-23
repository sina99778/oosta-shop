// Rate limiters (express-rate-limit v8). A permissive global limiter is applied to
// every request; a stricter limiter is exported for sensitive auth endpoints (Phase 3).

import type { Request } from "express";
import rateLimit from "express-rate-limit";

const PRIVATE_ADDRESS =
  /^(::ffff:)?(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|^::1$|^fc|^fd/i;

// Server-to-server calls from the Next.js container (SSR) arrive straight over the
// Docker network: private source address and no X-Forwarded-For (nginx always adds
// one for public traffic). They'd otherwise share ONE bucket and 429 the whole site.
export function isInternalRequest(req: Request): boolean {
  if (req.headers["x-forwarded-for"]) return false;
  return PRIVATE_ADDRESS.test(req.socket.remoteAddress ?? "");
}

export const globalRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 120,
  skip: isInternalRequest,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: { code: "RATE_LIMITED", message: "Too many requests, please slow down." },
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: { code: "RATE_LIMITED", message: "Too many attempts, please try again later." },
  },
});
