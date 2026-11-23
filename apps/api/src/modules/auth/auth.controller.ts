// HTTP handlers for the auth routes. Validation runs in middleware; these assume
// req.body is already parsed. Thrown errors propagate to the central error handler.
//
// Browsers authenticate with the httpOnly session cookie set here. The token is
// still returned in the JSON body for programmatic Bearer clients (scripts, tests);
// the storefront never stores it.

import type { Request, Response } from "express";
import { AppError } from "../../utils/httpError";
import type { SendMail } from "../../lib/mailer";
import { renderWelcomeEmail } from "../../lib/email-design";
import { trackMaintenanceWork } from "../../lib/maintenance";
import { notifyNewSignup } from "../../bot";
import { getWelcomeGift } from "../orders/welcome-gift";
import {
  clearSessionCookie,
  isTrustedCookieWrite,
  readSessionCookie,
  setSessionCookie,
} from "../../lib/sessionCookie";
import { verifyAccessToken } from "../../lib/jwt";
import { listActiveSessions, revokeSessions, type SessionMeta } from "../../lib/userSessions";
import {
  changePassword as changeUserPassword,
  getUserById,
  loginUser,
  registerUser,
  revokeAllSessions,
} from "./auth.service";
import {
  issuePasswordReset,
  issueRecoveryVerification,
  passwordResetBaseUrl,
  redeemPasswordReset,
  verifyRecoveryEmail,
} from "./password-reset";

function requireUserSession(req: Request): string {
  // `authenticate` guarantees req.user. API keys are automation credentials and
  // must not be able to take over the owner's password or sessions.
  if (req.authMethod === "api-key") {
    throw new AppError(403, "FORBIDDEN", "API keys cannot manage account sessions");
  }
  return req.user!.id;
}

const sessionMeta = (req: Request): SessionMeta => ({
  userAgent: req.get("user-agent") ?? null,
  ip: req.ip ?? null,
});

function requireTrustedBrowserSource(req: Request): void {
  if (
    (req.headers.origin !== undefined || req.headers.referer !== undefined) &&
    !isTrustedCookieWrite(req)
  ) {
    throw new AppError(403, "CSRF_REJECTED", "Request origin is not allowed");
  }
}

export async function signup(req: Request, res: Response): Promise<void> {
  requireTrustedBrowserSource(req);
  const result = await registerUser(req.body, sessionMeta(req));
  setSessionCookie(res, result.token);
  res.status(201).json(result);
  void notifyNewSignup(result.user);
}

export async function login(req: Request, res: Response): Promise<void> {
  requireTrustedBrowserSource(req);
  const result = await loginUser(req.body, sessionMeta(req));
  setSessionCookie(res, result.token);
  res.status(200).json(result);
}

export function createForgotPassword(send?: SendMail) {
  const baseUrl = passwordResetBaseUrl();
  return (req: Request, res: Response): void => {
    requireTrustedBrowserSource(req);
    if (!send || !baseUrl) {
      throw new AppError(
        503,
        "PASSWORD_RESET_UNAVAILABLE",
        "Password reset is temporarily unavailable",
      );
    }
    res.status(202).json({ accepted: true });
    // The response must never wait on an account lookup or an SMTP attempt.
    void issuePasswordReset(req.body, baseUrl, send).catch(() => {
      console.error("[password-reset] Could not issue or deliver a reset email");
    });
  };
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  requireTrustedBrowserSource(req);
  await redeemPasswordReset(req.body);
  res.status(204).end();
}

export function createRequestRecoveryEmailVerification(send?: SendMail) {
  const base = passwordResetBaseUrl();
  return async (req: Request, res: Response): Promise<void> => {
    const userId = requireUserSession(req);
    if (!send || !base) {
      throw new AppError(
        503,
        "PASSWORD_RESET_UNAVAILABLE",
        "Email recovery is temporarily unavailable",
      );
    }
    const { currentPassword, locale } = req.body;
    const deliveryRequested = await issueRecoveryVerification(
      userId,
      currentPassword,
      locale,
      base,
      send,
    );
    res.status(202).json({ accepted: true, deliveryRequested });
  };
}

export function confirmRecoveryEmailVerification(send?: SendMail) {
  const base = passwordResetBaseUrl();
  return async (req: Request, res: Response): Promise<void> => {
    const userId = requireUserSession(req);
    const { token, locale } = req.body;
    const recipient = await verifyRecoveryEmail(userId, token);
    const gift =
      recipient && send && base ? trackMaintenanceWork(() => getWelcomeGift(userId)) : null;
    res.status(204).end();
    if (!gift || !recipient || !send || !base) return;
    void gift
      .then(async (offer) => {
        if (offer?.state === "AVAILABLE") {
          await send({
            to: recipient,
            ...renderWelcomeEmail(locale, offer.code, offer.percent, base),
          });
        }
      })
      .catch(() => {
        console.error("[welcome-mail] Welcome email could not be sent");
      });
  };
}

export async function me(req: Request, res: Response): Promise<void> {
  // `authenticate` middleware guarantees req.user is set.
  const user = await getUserById(req.user!.id);
  res.json({ user });
}

export async function inbox(req: Request, res: Response): Promise<void> {
  const userId = requireUserSession(req);
  res.json({ welcomeGift: await getWelcomeGift(userId) });
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const result = await changeUserPassword(requireUserSession(req), req.body, sessionMeta(req));
  setSessionCookie(res, result.token);
  res.json(result);
}

// Clears this browser's cookie. Needs no valid session, so a stale cookie can always be
// removed; a still-valid cookie also ends its device session row.
export async function logout(req: Request, res: Response): Promise<void> {
  requireTrustedBrowserSource(req);
  const token = readSessionCookie(req);
  if (token) {
    let payload: ReturnType<typeof verifyAccessToken> | null = null;
    try {
      payload = verifyAccessToken(token);
    } catch {
      // An expired or tampered cookie has no session to end.
    }
    if (payload?.sid) await revokeSessions(payload.sub, { only: payload.sid });
  }
  clearSessionCookie(res);
  res.status(204).end();
}

// Signed-in devices for the account security page.
export async function sessions(req: Request, res: Response): Promise<void> {
  const userId = requireUserSession(req);
  res.json({
    sessions: await listActiveSessions(userId, req.sessionId),
    currentTracked: Boolean(req.sessionId),
  });
}

export async function revokeSession(req: Request, res: Response): Promise<void> {
  const userId = requireUserSession(req);
  const id = String(req.params.id);
  const count = await revokeSessions(userId, { only: id });
  if (!count) throw new AppError(404, "NOT_FOUND", "Session not found");
  if (id === req.sessionId) clearSessionCookie(res);
  res.status(204).end();
}

export async function revokeOtherSessions(req: Request, res: Response): Promise<void> {
  const userId = requireUserSession(req);
  const revoked = await revokeSessions(userId, { except: req.sessionId });
  res.json({ revoked });
}

export async function logoutAll(req: Request, res: Response): Promise<void> {
  await revokeAllSessions(requireUserSession(req));
  clearSessionCookie(res);
  res.status(204).end();
}
