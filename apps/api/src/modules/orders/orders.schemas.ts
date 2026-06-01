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
