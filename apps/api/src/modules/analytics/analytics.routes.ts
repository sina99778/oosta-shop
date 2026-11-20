import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { recordVisit, recordStorefrontStep, storefrontSteps } from "./analytics.service";

const trackSchema = z.union([
  z.object({ path: z.string().min(1).max(500) }),
  z.strictObject({ step: z.enum(storefrontSteps) }),
]);

export const analyticsRouter = Router();

// Public, fire-and-forget page-view beacon (the web app calls this per view).
analyticsRouter.post("/track", async (req: Request, res: Response) => {
  const parsed = trackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(204).end();
    return;
  }
  const userAgent = String(req.headers["user-agent"] ?? "");
  if ("step" in parsed.data) {
    await recordStorefrontStep(parsed.data.step, userAgent).catch(() => {});
    res.status(204).end();
    return;
  }
  await recordVisit({
    path: parsed.data.path,
    // Express accepts forwarded IPs only through configured proxy addresses.
    country: "",
    ip: req.ip ?? "0.0.0.0",
    userAgent,
  }).catch(() => {});
  res.status(204).end();
});
