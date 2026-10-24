// HTTP handlers for the auth routes. Validation runs in middleware; these assume
// req.body is already parsed. Thrown errors propagate to the central error handler.

import type { Request, Response } from "express";
import {
  changePassword,
  getUserById,
  loginUser,
  registerUser,
  updateProfile,
} from "./auth.service";
import { clearSessionCookie, setSessionCookie } from "../../lib/session";

// The token is also returned in the body for API clients/scripts; browsers use
// the httpOnly cookie and never store it.
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

export async function logout(_req: Request, res: Response): Promise<void> {
  clearSessionCookie(res);
  res.status(204).end();
}

export async function me(req: Request, res: Response): Promise<void> {
  // `authenticate` middleware guarantees req.user is set.
  const user = await getUserById(req.user!.id);
  res.json({ user });
}

export async function session(req: Request, res: Response): Promise<void> {
  res.json({ user: await getUserById(req.user!.id) });
}

export async function updateMe(req: Request, res: Response): Promise<void> {
  res.json({ user: await updateProfile(req.user!.id, req.body) });
}

export async function changeMyPassword(req: Request, res: Response): Promise<void> {
  await changePassword(req.user!.id, req.body);
  res.status(204).end();
}
