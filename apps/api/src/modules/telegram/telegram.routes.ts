// /telegram — the signed-in user's connection to the customer bot.
// Admin broadcasts are mounted on the admin router (see admin.routes.ts).

import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import * as ctrl from "./telegram.controller";

export const telegramRouter = Router();

telegramRouter.use(authenticate);
telegramRouter.get("/", ctrl.status);
telegramRouter.post("/link", ctrl.createLink);
telegramRouter.patch(
  "/",
  validate({ body: z.object({ newsOptIn: z.boolean() }) }),
  ctrl.updatePrefs,
);
telegramRouter.delete("/", ctrl.unlink);

export const broadcastSchema = z.object({ text: z.string().trim().min(1).max(3500) });
