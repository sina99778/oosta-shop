import { Router } from "express";
import type { Request, Response } from "express";
import { authenticate, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { uploadProductImage } from "../../middleware/upload";
import { settingsPatchSchema, type SettingsPatch } from "./settings.schemas";
import * as settings from "./settings.service";

// Public: the web layout fetches this on every render (theme + hero overrides).
export const settingsRouter = Router();
settingsRouter.get("/site-settings", async (_req: Request, res: Response) => {
  const [values, enamadBadge] = await Promise.all([
    settings.getSettings(),
    settings.hasEnamadBadge(),
  ]);
  res.json({ settings: values, enamadBadge });
});
settingsRouter.get("/site-assets/enamad", async (_req: Request, res: Response) => {
  const { data, mimeType } = await settings.getEnamadBadge();
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(data);
});

// Admin: merge-patch settings; null clears a key back to the built-in default.
export const settingsAdminRouter = Router();
settingsAdminRouter.use(authenticate, requireRole("ADMIN"));
settingsAdminRouter.get("/", async (_req: Request, res: Response) => {
  const [values, enamadBadge] = await Promise.all([
    settings.getSettings(),
    settings.hasEnamadBadge(),
  ]);
  res.json({ settings: values, enamadBadge });
});
settingsAdminRouter.patch(
  "/",
  validate({ body: settingsPatchSchema }),
  async (req: Request, res: Response) => {
    res.json({ settings: await settings.patchSettings(req.body as SettingsPatch) });
  },
);
settingsAdminRouter.post("/enamad", uploadProductImage, async (req: Request, res: Response) => {
  const file = req.file ? { buffer: req.file.buffer, mimetype: req.file.mimetype } : undefined;
  res.json(await settings.setEnamadBadge(file));
});
settingsAdminRouter.delete("/enamad", async (_req: Request, res: Response) => {
  res.json(await settings.deleteEnamadBadge());
});
