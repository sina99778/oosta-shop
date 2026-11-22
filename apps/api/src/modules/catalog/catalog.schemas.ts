// Zod schemas for public catalog query/params.

import { z } from "zod";

const boolFlag = z.preprocess(
  (v) => (v === "true" || v === true ? true : v === "false" || v === undefined ? undefined : v),
  z.boolean().optional(),
);

export const listProductsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  category: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  sort: z
    .enum([
      "recommended",
      "newest",
      "price_asc",
      "price_desc",
      "available",
      "popular",
      "bestselling",
    ])
    .default("recommended"),
  featured: boolFlag,
  // Storefront filters: purchasable now, access type and delivery of at least one plan.
  inStock: boolFlag,
  access: z.enum(["PERSONAL", "SHARED", "TEAM"]).optional(),
  delivery: z.enum(["AUTOMATIC", "MANUAL"]).optional(),
});

export const bestsellingQuery = z.object({
  limit: z.coerce.number().int().min(1).max(24).default(8),
});

export const productParamsSchema = z.object({
  slug: z.string().trim().min(1),
});

export const reviewParamsSchema = z.object({
  id: z.string().min(1),
});

export const submitReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
});

export type ListProductsQuery = z.infer<typeof listProductsQuery>;
export type BestsellingQuery = z.infer<typeof bestsellingQuery>;
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;
