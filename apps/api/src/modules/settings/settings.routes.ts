import { Router } from "express";
import type { Request, Response } from "express";
import { authenticate, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { settingsPatchSchema, type SettingsPatch } from "./settings.schemas";
import * as settings from "./settings.service";

// Public: the web layout fetches this on every render (theme + hero overrides).
export const settingsRouter = Router();
settingsRouter.get("/site-settings", async (_req: Request, res: Response) => {
  res.json({ settings: await settings.getSettings() });
});

// Admin: merge-patch settings; null clears a key back to the built-in default.
export const settingsAdminRouter = Router();
settingsAdminRouter.use(authenticate, requireRole("ADMIN"));
settingsAdminRouter.get("/", async (_req: Request, res: Response) => {
  res.json({ settings: await settings.getSettings() });
});
settingsAdminRouter.patch(
  "/",
  validate({ body: settingsPatchSchema }),
  async (req: Request, res: Response) => {
    res.json({ settings: await settings.patchSettings(req.body as SettingsPatch) });
  },
);
