// Rate limiters (express-rate-limit v8). A permissive global limiter is applied to
// every request; a stricter limiter is exported for sensitive auth endpoints (Phase 3).

import rateLimit from "express-rate-limit";

export const globalRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 120,
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

// Per-ACCOUNT login limiter: keyed on the submitted identifier (email/phone), so
// a password-guessing attack on one account is stopped even when the attacker
// rotates or spoofs IP addresses. Only failed attempts count.
export const loginIdentifierLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const id = typeof req.body?.identifier === "string" ? req.body.identifier : "";
    return `login:${id.trim().toLowerCase()}`;
  },
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many failed attempts for this account, please try again later.",
    },
  },
});
