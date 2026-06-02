// Public catalog routes. NOTE: /products/bestselling is declared before
// /products/:slug so the literal path is matched first.

import { Router } from "express";
import { validate } from "../../middleware/validate";
import { authenticate } from "../../middleware/auth";
import {
  bestsellingQuery,
  listProductsQuery,
  productParamsSchema,
  reviewParamsSchema,
  submitReviewSchema,
} from "./catalog.schemas";
import {
  bestselling,
  galleryImage,
  listCategories,
  listProducts,
  productBySlug,
  productImage,
  submitReview,
} from "./catalog.controller";

export const catalogRouter = Router();

catalogRouter.get("/categories", listCategories);
catalogRouter.get("/products", validate({ query: listProductsQuery }), listProducts);
catalogRouter.get("/products/bestselling", validate({ query: bestsellingQuery }), bestselling);
// Two-segment paths — declared before /products/:slug.
catalogRouter.get("/products/:id/image", productImage);
catalogRouter.get("/product-images/:id", galleryImage);
// Authenticated buyers can leave a star rating + review (held for admin approval).
catalogRouter.post(
  "/products/:id/reviews",
  authenticate,
  validate({ params: reviewParamsSchema, body: submitReviewSchema }),
  submitReview,
);
catalogRouter.get("/products/:slug", validate({ params: productParamsSchema }), productBySlug);
