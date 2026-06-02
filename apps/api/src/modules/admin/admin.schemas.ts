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

const specRow = z.object({
  label: z.string().trim().max(100),
  value: z.string().trim().max(500),
});

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug,
  shortDescription: z.string().trim().max(300).nullable().optional(),
  description: z.string().trim().min(1).max(20000),
  specs: z.array(specRow).max(50).optional(),
  isFeatured: z.boolean().optional(),
  metaTitle: z.string().trim().max(200).nullable().optional(),
  metaDescription: z.string().trim().max(400).nullable().optional(),
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
  // number = set a sale price; null = clear it; absent = leave unchanged.
  salePrice: z.union([z.coerce.number().positive(), z.null()]).optional(),
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
  status: z
    .enum(["PENDING", "PENDING_REVIEW", "PAID", "FAILED", "REJECTED", "REFUNDED", "EXPIRED"])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

// Card-to-card receipts (review queue + full history).
export const receiptsQuerySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const reviewReceiptSchema = z
  .object({ note: z.string().trim().max(500).optional() })
  .optional()
  .transform((v) => v ?? {});

// Customer reviews moderation
export const reviewsQuerySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

// Support tickets (admin)
export const ticketsQuerySchema = z.object({
  status: z.enum(["OPEN", "ANSWERED", "CLOSED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export const ticketReplySchema = z.object({ body: z.string().trim().min(1).max(5000) });
export const ticketStatusSchema = z.object({ status: z.enum(["OPEN", "ANSWERED", "CLOSED"]) });

export const idParamSchema = z.object({ id: z.string().min(1) });
export const productIdParamSchema = z.object({ productId: z.string().min(1) });
export const imageIdParamSchema = z.object({ imageId: z.string().min(1) });

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type BulkInventoryInput = z.infer<typeof bulkInventorySchema>;
export type InventoryQuery = z.infer<typeof inventoryQuerySchema>;
export type OrdersQuery = z.infer<typeof ordersQuerySchema>;
export type ReceiptsQuery = z.infer<typeof receiptsQuerySchema>;
export type ReviewReceiptInput = z.infer<typeof reviewReceiptSchema>;
export type ReviewsQuery = z.infer<typeof reviewsQuerySchema>;
export type TicketsQuery = z.infer<typeof ticketsQuerySchema>;
export type TicketReplyInput = z.infer<typeof ticketReplySchema>;
export type TicketStatusInput = z.infer<typeof ticketStatusSchema>;
