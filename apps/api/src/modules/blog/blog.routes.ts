import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { uploadProductImage } from "../../middleware/upload";
import {
  createPostSchema,
  postParamsSchema,
  postSlugSchema,
  updatePostSchema,
} from "./blog.schemas";
import * as ctrl from "./blog.controller";

// Public blog routes (mounted at the app root).
export const blogRouter = Router();
blogRouter.get("/blog", ctrl.listPublished);
blogRouter.get("/blog-media/:id", ctrl.media);
blogRouter.get("/blog-cover/:id", ctrl.cover);
blogRouter.get("/blog/:slug", validate({ params: postSlugSchema }), ctrl.getBySlug);

// Admin blog routes (mounted at /admin/blog; guarded here).
export const blogAdminRouter = Router();
blogAdminRouter.use(authenticate, requireRole("ADMIN"));
blogAdminRouter.get("/", ctrl.listAll);
blogAdminRouter.post("/", validate({ body: createPostSchema }), ctrl.create);
blogAdminRouter.post("/media", uploadProductImage, ctrl.addMedia);
blogAdminRouter.get("/:id", validate({ params: postParamsSchema }), ctrl.getOne);
blogAdminRouter.patch(
  "/:id",
  validate({ params: postParamsSchema, body: updatePostSchema }),
  ctrl.update,
);
blogAdminRouter.delete("/:id", validate({ params: postParamsSchema }), ctrl.remove);
blogAdminRouter.post(
  "/:id/cover",
  validate({ params: postParamsSchema }),
  uploadProductImage,
  ctrl.setCover,
);
