import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { uploadTicketImage } from "../../middleware/upload";
import {
  createTicketSchema,
  ticketAttachmentParamsSchema,
  ticketMessageSchema,
  ticketParamsSchema,
} from "./tickets.schemas";
import {
  addMyMessage,
  createTicket,
  getMyAttachment,
  getMyTicket,
  listMyTickets,
} from "./tickets.controller";

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
ticketsRouter.post(
  "/",
  ticketWrites,
  uploadTicketImage,
  validate({ body: createTicketSchema }),
  createTicket,
);
ticketsRouter.get("/", listMyTickets);
ticketsRouter.get("/:id", validate({ params: ticketParamsSchema }), getMyTicket);
ticketsRouter.get(
  "/:id/messages/:messageId/attachment",
  validate({ params: ticketAttachmentParamsSchema }),
  getMyAttachment,
);
ticketsRouter.post(
  "/:id/messages",
  ticketWrites,
  uploadTicketImage,
  validate({ params: ticketParamsSchema, body: ticketMessageSchema }),
  addMyMessage,
);
