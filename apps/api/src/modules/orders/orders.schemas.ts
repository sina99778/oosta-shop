// Zod schemas for order creation and payment verification.

import { z } from "zod";

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
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
