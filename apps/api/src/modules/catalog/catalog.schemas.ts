// Zod schemas for public catalog query/params.

import { z } from "zod";

export const listProductsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  category: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(["newest", "price_asc", "price_desc"]).default("newest"),
});

export const bestsellingQuery = z.object({
  limit: z.coerce.number().int().min(1).max(24).default(8),
});

export const productParamsSchema = z.object({
  slug: z.string().trim().min(1),
});

export type ListProductsQuery = z.infer<typeof listProductsQuery>;
export type BestsellingQuery = z.infer<typeof bestsellingQuery>;
