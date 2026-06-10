import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { recordVisit } from "./analytics.service";

const trackSchema = z.object({ path: z.string().min(1).max(500) });

// Country / real-IP headers, most-specific first. ArvanCloud (docs.arvancloud.ir
// /en/cdn/headers/) sends X-Country-Code + ar-real-ip; cf-ipcountry covers
// Cloudflare if the CDN ever changes.
const COUNTRY_HEADERS = ["x-country-code", "cf-ipcountry"];
const IP_HEADERS = ["ar-real-ip", "x-real-ip"];

function headerValue(req: Request, names: string[]): string {
  for (const name of names) {
    const value = req.headers[name];
    if (typeof value === "string" && value) return value;
  }
  return "";
}

export const analyticsRouter = Router();

// Public, fire-and-forget page-view beacon (the web app calls this per view).
analyticsRouter.post("/track", async (req: Request, res: Response) => {
  const parsed = trackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(204).end();
    return;
  }
  await recordVisit({
    path: parsed.data.path,
    country: headerValue(req, COUNTRY_HEADERS),
    ip: headerValue(req, IP_HEADERS) || req.ip || "0.0.0.0",
    userAgent: String(req.headers["user-agent"] ?? ""),
  }).catch(() => {});
  res.status(204).end();
});
