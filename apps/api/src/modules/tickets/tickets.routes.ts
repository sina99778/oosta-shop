import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { createTicketSchema, ticketMessageSchema, ticketParamsSchema } from "./tickets.schemas";
import { addMyMessage, createTicket, getMyTicket, listMyTickets } from "./tickets.controller";

export const ticketsRouter = Router();

ticketsRouter.use(authenticate);
ticketsRouter.post("/", validate({ body: createTicketSchema }), createTicket);
ticketsRouter.get("/", listMyTickets);
ticketsRouter.get("/:id", validate({ params: ticketParamsSchema }), getMyTicket);
ticketsRouter.post(
  "/:id/messages",
  validate({ params: ticketParamsSchema, body: ticketMessageSchema }),
  addMyMessage,
);
