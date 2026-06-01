// Zod schemas for admin (role-guarded) endpoints.

import { z } from "zod";

const slug = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must be a lowercase, hyphenated slug");

const productType = z.enum(["ACCOUNT", "LICENSE", "GIFTCARD"]);

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug,
});
export const updateCategorySchema = createCategorySchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, "No fields to update");

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug,
  description: z.string().trim().min(1).max(5000),
  image: z.string().trim().min(1).nullable().optional(),
  type: productType,
  categoryId: z.string().min(1),
  isActive: z.boolean().optional(),
});
export const updateProductSchema = createProductSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, "No fields to update");

export const createPlanSchema = z.object({
  label: z.string().trim().min(1).max(100),
  durationDays: z.coerce.number().int().min(1).nullable().optional(),
  price: z.coerce.number().positive(),
  currency: z.string().trim().min(1).max(10).optional(),
  isActive: z.boolean().optional(),
});
export const updatePlanSchema = createPlanSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, "No fields to update");

export const bulkInventorySchema = z.object({
  planId: z.string().min(1),
  items: z
    .array(
      z.object({
        accountEmail: z.string().trim().min(1).optional(),
        accountPassword: z.string().trim().min(1).optional(),
        licenseKey: z.string().trim().min(1).optional(),
        giftCardCode: z.string().trim().min(1).optional(),
      }),
    )
    .min(1)
    .max(1000),
});

export const inventoryQuerySchema = z.object({
  productId: z.string().optional(),
  planId: z.string().optional(),
  status: z.enum(["AVAILABLE", "RESERVED", "SOLD"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const ordersQuerySchema = z.object({
  status: z.enum(["PENDING", "PAID", "FAILED", "REFUNDED", "EXPIRED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const idParamSchema = z.object({ id: z.string().min(1) });
export const productIdParamSchema = z.object({ productId: z.string().min(1) });

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type BulkInventoryInput = z.infer<typeof bulkInventorySchema>;
export type InventoryQuery = z.infer<typeof inventoryQuerySchema>;
export type OrdersQuery = z.infer<typeof ordersQuerySchema>;
