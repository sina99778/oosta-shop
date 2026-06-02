import type { Request, Response } from "express";
import * as tickets from "./tickets.service";
import type { CreateTicketInput, TicketMessageInput } from "./tickets.schemas";

export async function createTicket(req: Request, res: Response): Promise<void> {
  const { subject, body } = req.body as CreateTicketInput;
  res.status(201).json(await tickets.createTicket(req.user!.id, subject, body));
}

export async function listMyTickets(req: Request, res: Response): Promise<void> {
  res.json({ tickets: await tickets.listMyTickets(req.user!.id) });
}

export async function getMyTicket(req: Request, res: Response): Promise<void> {
  res.json({ ticket: await tickets.getMyTicket(req.user!.id, String(req.params.id)) });
}

export async function addMyMessage(req: Request, res: Response): Promise<void> {
  const { body } = req.body as TicketMessageInput;
  res.json({ ticket: await tickets.addMyMessage(req.user!.id, String(req.params.id), body) });
}
