import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { createTicketSchema, ticketMessageSchema, ticketParamsSchema } from "./tickets.schemas";
import { addMyMessage, createTicket, getMyTicket, listMyTickets } from "./tickets.controller";

export const ticketsRouter = Router();
const ticketWrites = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 12,
  keyGenerator: (req) => req.user!.id,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: { code: "RATE_LIMITED", message: "Too many support requests. Try again later." },
  },
});

ticketsRouter.use(authenticate);
ticketsRouter.post("/", ticketWrites, validate({ body: createTicketSchema }), createTicket);
ticketsRouter.get("/", listMyTickets);
ticketsRouter.get("/:id", validate({ params: ticketParamsSchema }), getMyTicket);
ticketsRouter.post(
  "/:id/messages",
  ticketWrites,
  validate({ params: ticketParamsSchema, body: ticketMessageSchema }),
  addMyMessage,
);
