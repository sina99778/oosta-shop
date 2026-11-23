import { z } from "zod";

const orderRef = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,64}$/)
  .optional()
  .or(z.literal("").transform(() => undefined));

// Multipart requests carry these as strings; an attached screenshot may replace text.
export const createTicketSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().max(5000).default(""),
  orderId: orderRef,
});

export const ticketMessageSchema = z.object({
  body: z.string().trim().max(5000).default(""),
});

export const ticketParamsSchema = z.object({ id: z.string().min(1).max(64) });
export const ticketAttachmentParamsSchema = z.object({
  id: z.string().min(1).max(64),
  messageId: z.string().min(1).max(64),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type TicketMessageInput = z.infer<typeof ticketMessageSchema>;
