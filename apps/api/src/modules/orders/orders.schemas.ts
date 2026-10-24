// Zod schemas for order creation and payment verification.

import { z } from "zod";

const couponCode = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid discount code");

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        planId: z.string().min(1),
        quantity: z.coerce.number().int().min(1).max(10),
      }),
    )
    .min(1, "At least one item is required")
    .max(20),
  // "online" → payment gateway (Zarinpal/mock); "card_to_card" → manual transfer + receipt.
  method: z.enum(["online", "card_to_card"]).default("online"),
  // Storefront language, so the gateway returns the buyer to the same locale.
  locale: z.enum(["fa", "en"]).optional(),
  couponCode: couponCode.optional(),
});

// Price preview with a discount code (nothing is reserved).
export const quoteSchema = z.object({
  items: createOrderSchema.shape.items,
  couponCode,
});

// Optional note the buyer can attach to a card-to-card receipt (tracking no, last 4, etc.).
export const uploadReceiptSchema = z.object({
  reference: z.string().max(200).optional(),
});

export const verifyPaymentSchema = z.object({
  authority: z.string().min(1),
  status: z.string().min(1), // "OK" on success, otherwise treated as failure/cancel
});

export const orderParamsSchema = z.object({
  id: z.string().min(1),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type QuoteInput = z.infer<typeof quoteSchema>;
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
