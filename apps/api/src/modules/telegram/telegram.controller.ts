// HTTP handlers for connecting an account to the customer bot, and admin broadcasts.

import type { Request, Response } from "express";
import { customerBotLink, isCustomerBotEnabled } from "../../customerBot";
import { AppError } from "../../utils/httpError";
import * as tg from "./telegram.service";

export async function status(req: Request, res: Response): Promise<void> {
  res.json({ enabled: isCustomerBotEnabled(), link: await tg.linkStatus(req.user!.id) });
}

// A fresh single-use deep link (30 min) for this account.
export async function createLink(req: Request, res: Response): Promise<void> {
  if (!isCustomerBotEnabled()) {
    throw new AppError(503, "BOT_DISABLED", "The Telegram bot is not available right now");
  }
  const { token, expiresAt } = await tg.createLinkToken(req.user!.id);
  res.status(201).json({ url: customerBotLink(token), expiresAt });
}

export async function updatePrefs(req: Request, res: Response): Promise<void> {
  await tg.setNewsOptIn(req.user!.id, Boolean(req.body.newsOptIn));
  res.json({ link: await tg.linkStatus(req.user!.id) });
}

export async function unlink(req: Request, res: Response): Promise<void> {
  await tg.unlinkUser(req.user!.id);
  res.status(204).end();
}

export async function listBroadcasts(_req: Request, res: Response): Promise<void> {
  const [broadcasts, audience] = await Promise.all([tg.listBroadcasts(), tg.broadcastAudience()]);
  res.json({ broadcasts, audience, enabled: isCustomerBotEnabled() });
}

export async function createBroadcast(req: Request, res: Response): Promise<void> {
  if (!isCustomerBotEnabled()) {
    throw new AppError(503, "BOT_DISABLED", "The Telegram bot is not configured");
  }
  res.status(201).json({ broadcast: await tg.createBroadcast(String(req.body.text)) });
}
