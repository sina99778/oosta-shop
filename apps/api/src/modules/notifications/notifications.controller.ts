// HTTP handlers for notifications and stock watches (auth enforced by the router).

import type { Request, Response } from "express";
import * as svc from "./notifications.service";

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await svc.listNotifications(req.user!.id));
}

export async function readAll(req: Request, res: Response): Promise<void> {
  await svc.markAllRead(req.user!.id);
  res.status(204).end();
}

export async function getWatch(req: Request, res: Response): Promise<void> {
  res.json({ watching: await svc.isWatching(req.user!.id, String(req.params.productId)) });
}

export async function watch(req: Request, res: Response): Promise<void> {
  await svc.watchProduct(req.user!.id, String(req.params.productId));
  res.json({ watching: true });
}

export async function unwatch(req: Request, res: Response): Promise<void> {
  await svc.unwatchProduct(req.user!.id, String(req.params.productId));
  res.json({ watching: false });
}
