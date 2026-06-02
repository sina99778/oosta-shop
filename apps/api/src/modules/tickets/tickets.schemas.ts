import { z } from "zod";

export const createTicketSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
});

export const ticketMessageSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

export const ticketParamsSchema = z.object({ id: z.string().min(1) });

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type TicketMessageInput = z.infer<typeof ticketMessageSchema>;
