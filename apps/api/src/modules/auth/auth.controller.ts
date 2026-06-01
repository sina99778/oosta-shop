// HTTP handlers for the auth routes. Validation runs in middleware; these assume
// req.body is already parsed. Thrown errors propagate to the central error handler.

import type { Request, Response } from "express";
import { getUserById, loginUser, registerUser } from "./auth.service";

export async function signup(req: Request, res: Response): Promise<void> {
  const result = await registerUser(req.body);
  res.status(201).json(result);
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = await loginUser(req.body);
  res.status(200).json(result);
}

export async function me(req: Request, res: Response): Promise<void> {
  // `authenticate` middleware guarantees req.user is set.
  const user = await getUserById(req.user!.id);
  res.json({ user });
}
