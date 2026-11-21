// HTTP handlers for the auth routes. Validation runs in middleware; these assume
// req.body is already parsed. Thrown errors propagate to the central error handler.
//
// Browsers authenticate with the httpOnly session cookie set here. The token is
// still returned in the JSON body for programmatic Bearer clients (scripts, tests);
// the storefront never stores it.

import type { Request, Response } from "express";
import { AppError } from "../../utils/httpError";
import type { SendMail } from "../../lib/mailer";
import { notifyNewSignup } from "../../bot";
import { getWelcomeGift } from "../orders/welcome-gift";
import {
  clearSessionCookie,
  isTrustedCookieWrite,
  setSessionCookie,
} from "../../lib/sessionCookie";
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
  const result = await registerUser(req.body);
  setSessionCookie(res, result.token);
  res.status(201).json(result);
  void notifyNewSignup(result.user);
}

export async function login(req: Request, res: Response): Promise<void> {
  requireTrustedBrowserSource(req);
  const result = await loginUser(req.body);
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
  return async (req: Request, res: Response): Promise<void> => {
    const userId = requireUserSession(req);
    if (!send || !passwordResetBaseUrl()) {
      throw new AppError(
        503,
        "PASSWORD_RESET_UNAVAILABLE",
        "Email recovery is temporarily unavailable",
      );
    }
    const { currentPassword, locale } = req.body;
    await issueRecoveryVerification(userId, currentPassword, locale, send);
    res.status(202).json({ accepted: true });
  };
}

export async function confirmRecoveryEmailVerification(req: Request, res: Response): Promise<void> {
  await verifyRecoveryEmail(requireUserSession(req), req.body.token);
  res.status(204).end();
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
  const result = await changeUserPassword(requireUserSession(req), req.body);
  setSessionCookie(res, result.token);
  res.json(result);
}

// Clears this browser's cookie. Needs no valid session, so a stale cookie can always be removed.
export function logout(_req: Request, res: Response): void {
  requireTrustedBrowserSource(_req);
  clearSessionCookie(res);
  res.status(204).end();
}

export async function logoutAll(req: Request, res: Response): Promise<void> {
  await revokeAllSessions(requireUserSession(req));
  clearSessionCookie(res);
  res.status(204).end();
}
