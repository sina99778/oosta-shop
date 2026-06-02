// Public catalog routes. NOTE: /products/bestselling is declared before
// /products/:slug so the literal path is matched first.

import { Router } from "express";
import { validate } from "../../middleware/validate";
import { bestsellingQuery, listProductsQuery, productParamsSchema } from "./catalog.schemas";
import {
  bestselling,
  listCategories,
  listProducts,
  productBySlug,
  productImage,
} from "./catalog.controller";

export const catalogRouter = Router();

catalogRouter.get("/categories", listCategories);
catalogRouter.get("/products", validate({ query: listProductsQuery }), listProducts);
catalogRouter.get("/products/bestselling", validate({ query: bestsellingQuery }), bestselling);
// Two-segment path — declared before /products/:slug; serves the uploaded image bytes.
catalogRouter.get("/products/:id/image", productImage);
catalogRouter.get("/products/:slug", validate({ params: productParamsSchema }), productBySlug);
