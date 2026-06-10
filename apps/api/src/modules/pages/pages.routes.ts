import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import {
  createPageSchema,
  pageParamsSchema,
  pageSlugSchema,
  updatePageSchema,
} from "./pages.schemas";
import * as ctrl from "./pages.controller";

// Public page routes (mounted at the app root).
export const pagesRouter = Router();
pagesRouter.get("/pages", ctrl.listPublished);
pagesRouter.get("/pages/:slug", validate({ params: pageSlugSchema }), ctrl.getBySlug);

// Admin page routes (mounted at /admin/pages; guarded here).
export const pagesAdminRouter = Router();
pagesAdminRouter.use(authenticate, requireRole("ADMIN"));
pagesAdminRouter.get("/", ctrl.listAll);
pagesAdminRouter.post("/", validate({ body: createPageSchema }), ctrl.create);
pagesAdminRouter.get("/:id", validate({ params: pageParamsSchema }), ctrl.getOne);
pagesAdminRouter.patch(
  "/:id",
  validate({ params: pageParamsSchema, body: updatePageSchema }),
  ctrl.update,
);
pagesAdminRouter.delete("/:id", validate({ params: pageParamsSchema }), ctrl.remove);
