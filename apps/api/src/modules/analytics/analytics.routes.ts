import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { recordVisit } from "./analytics.service";

const trackSchema = z.object({ path: z.string().min(1).max(500) });

// Country headers, most-specific first. ArvanCloud (docs.arvancloud.ir
// /en/cdn/headers/) sends X-Country-Code; cf-ipcountry covers Cloudflare if the
// CDN ever changes. The visitor IP comes from req.ip (resolved through the
// trusted proxy chain) — raw client-supplied IP headers are not trusted.
const COUNTRY_HEADERS = ["x-country-code", "cf-ipcountry"];

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
    ip: req.ip || "0.0.0.0",
    userAgent: String(req.headers["user-agent"] ?? ""),
  }).catch(() => {});
  res.status(204).end();
});
