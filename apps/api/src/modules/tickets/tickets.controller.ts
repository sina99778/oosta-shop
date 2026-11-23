import type { Request, Response } from "express";
import * as tickets from "./tickets.service";
import type { CreateTicketInput, TicketMessageInput } from "./tickets.schemas";
import { safeAttachmentName } from "../../middleware/upload";
import { AppError } from "../../utils/httpError";

function attachmentFrom(req: Request): tickets.NewAttachment | null {
  if (!req.file) return null;
  return {
    data: req.file.buffer,
    mime: req.file.mimetype,
    size: req.file.size,
    name: safeAttachmentName(req.file.originalname),
  };
}

function requireContent(body: string, attachment: tickets.NewAttachment | null): void {
  if (!body && !attachment)
    throw new AppError(400, "VALIDATION_ERROR", "Write a message or attach a screenshot");
}

export async function createTicket(req: Request, res: Response): Promise<void> {
  const { subject, body, orderId } = req.body as CreateTicketInput;
  const attachment = attachmentFrom(req);
  requireContent(body, attachment);
  res
    .status(201)
    .json(await tickets.createTicket(req.user!.id, { subject, body, orderId, attachment }));
}

export async function getMyAttachment(req: Request, res: Response): Promise<void> {
  const file = await tickets.getAttachment(
    { userId: req.user!.id },
    String(req.params.id),
    String(req.params.messageId),
  );
  tickets.sendAttachment(res, file);
}

export async function listMyTickets(req: Request, res: Response): Promise<void> {
  res.json({ tickets: await tickets.listMyTickets(req.user!.id) });
}

export async function getMyTicket(req: Request, res: Response): Promise<void> {
  res.json({ ticket: await tickets.getMyTicket(req.user!.id, String(req.params.id)) });
}

export async function addMyMessage(req: Request, res: Response): Promise<void> {
  const { body } = req.body as TicketMessageInput;
  const attachment = attachmentFrom(req);
  requireContent(body, attachment);
  res.json({
    ticket: await tickets.addMyMessage(req.user!.id, String(req.params.id), body, attachment),
  });
}
