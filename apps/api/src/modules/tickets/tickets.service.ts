// Customer-facing support tickets.

import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/httpError";
import { notifyAdmin } from "../../bot";

function shortId(id: string): string {
  return id.slice(-8);
}

export async function createTicket(userId: string, subject: string, body: string) {
  const ticket = await prisma.ticket.create({
    data: {
      userId,
      subject,
      status: "OPEN",
      messages: { create: { authorId: userId, body, isStaff: false } },
    },
    include: { user: { select: { name: true } } },
  });
  void notifyAdmin(`🆕 New ticket #${shortId(ticket.id)} from ${ticket.user.name}\n${subject}`);
  return { id: ticket.id, status: ticket.status };
}

export async function listMyTickets(userId: string) {
  const tickets = await prisma.ticket.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, isStaff: true } },
      _count: { select: { messages: true } },
    },
  });
  return tickets.map((t) => ({
    id: t.id,
    subject: t.subject,
    status: t.status,
    messageCount: t._count.messages,
    lastMessage: t.messages[0]?.body ?? "",
    updatedAt: t.updatedAt,
  }));
}

export async function getMyTicket(userId: string, id: string) {
  const ticket = await prisma.ticket.findFirst({
    where: { id, userId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket) throw new AppError(404, "NOT_FOUND", "Ticket not found");
  return serializeTicket(ticket);
}

export async function addMyMessage(userId: string, id: string, body: string) {
  const ticket = await prisma.ticket.findFirst({ where: { id, userId } });
  if (!ticket) throw new AppError(404, "NOT_FOUND", "Ticket not found");
  await prisma.ticketMessage.create({
    data: { ticketId: id, authorId: userId, body, isStaff: false },
  });
  await prisma.ticket.update({ where: { id }, data: { status: "OPEN", updatedAt: new Date() } });
  void notifyAdmin(`💬 New reply on ticket #${shortId(id)}\n${body.slice(0, 200)}`);
  return getMyTicket(userId, id);
}

type TicketWithMessages = {
  id: string;
  subject: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  messages: { id: string; body: string; isStaff: boolean; createdAt: Date }[];
};

function serializeTicket(t: TicketWithMessages) {
  return {
    id: t.id,
    subject: t.subject,
    status: t.status,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    messages: t.messages.map((m) => ({
      id: m.id,
      body: m.body,
      isStaff: m.isStaff,
      createdAt: m.createdAt,
    })),
  };
}
