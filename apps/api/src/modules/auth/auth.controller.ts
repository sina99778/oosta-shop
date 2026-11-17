// HTTP handlers for the auth routes. Validation runs in middleware; these assume
// req.body is already parsed. Thrown errors propagate to the central error handler.
//
// Browsers authenticate with the httpOnly session cookie set here. The token is
// still returned in the JSON body for programmatic Bearer clients (scripts, tests);
// the storefront never stores it.

import type { Request, Response } from "express";
import { AppError } from "../../utils/httpError";
import { clearSessionCookie, setSessionCookie } from "../../lib/sessionCookie";
import {
  changePassword as changeUserPassword,
  getUserById,
  loginUser,
  registerUser,
  revokeAllSessions,
} from "./auth.service";

function requireUserSession(req: Request): string {
  // `authenticate` guarantees req.user. API keys are automation credentials and
  // must not be able to take over the owner's password or sessions.
  if (req.authMethod === "api-key") {
    throw new AppError(403, "FORBIDDEN", "API keys cannot manage account sessions");
  }
  return req.user!.id;
}

export async function signup(req: Request, res: Response): Promise<void> {
  const result = await registerUser(req.body);
  setSessionCookie(res, result.token);
  res.status(201).json(result);
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = await loginUser(req.body);
  setSessionCookie(res, result.token);
  res.status(200).json(result);
}

export async function me(req: Request, res: Response): Promise<void> {
  // `authenticate` middleware guarantees req.user is set.
  const user = await getUserById(req.user!.id);
  res.json({ user });
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const result = await changeUserPassword(requireUserSession(req), req.body);
  setSessionCookie(res, result.token);
  res.json(result);
}

// Clears this browser's cookie. Needs no valid session, so a stale cookie can always be removed.
export function logout(_req: Request, res: Response): void {
  clearSessionCookie(res);
  res.status(204).end();
}

export async function logoutAll(req: Request, res: Response): Promise<void> {
  await revokeAllSessions(requireUserSession(req));
  clearSessionCookie(res);
  res.status(204).end();
}
