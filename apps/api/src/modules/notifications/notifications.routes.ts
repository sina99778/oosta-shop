// The signed-in user's notifications (header bell) and back-in-stock watches.

import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import * as ctrl from "./notifications.controller";

export const notificationsRouter = Router();

const productParams = validate({ params: z.object({ productId: z.string().min(1) }) });

notificationsRouter.use(authenticate);
notificationsRouter.get("/", ctrl.list);
notificationsRouter.post("/read-all", ctrl.readAll);
notificationsRouter.get("/watches/:productId", productParams, ctrl.getWatch);
notificationsRouter.post("/watches/:productId", productParams, ctrl.watch);
notificationsRouter.delete("/watches/:productId", productParams, ctrl.unwatch);
