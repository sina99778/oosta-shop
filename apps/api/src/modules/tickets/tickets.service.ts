// Customer-facing support tickets.

import type { Response } from "express";
import { prisma } from "../../lib/prisma";
import { Prisma } from "@prisma/client";
import { AppError } from "../../utils/httpError";
import { notifyAdmin } from "../../bot";

export type NewAttachment = { data: Buffer; mime: string; size: number; name: string | null };

const attachmentData = (a: NewAttachment | null) =>
  a
    ? {
        attachmentData: Uint8Array.from(a.data),
        attachmentMime: a.mime,
        attachmentSize: a.size,
        attachmentName: a.name,
      }
    : {};

// Ticket reads never load screenshot bytes; they are fetched one at a time.
export const messageOmit = { attachmentData: true } as const;
const orderSummarySelect = {
  id: true,
  createdAt: true,
  totalAmount: true,
  currency: true,
  paymentStatus: true,
} as const;

async function ownedOrderId(userId: string, orderId: string | undefined) {
  if (!orderId) return null;
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    select: { id: true },
  });
  // The same answer for a foreign or missing order: no cross-account probing.
  if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  return order.id;
}

function shortId(id: string): string {
  return id.slice(-8);
}

export async function createTicket(
  userId: string,
  input: { subject: string; body: string; orderId?: string; attachment: NewAttachment | null },
) {
  const orderId = await ownedOrderId(userId, input.orderId);
  const ticket = await prisma.ticket.create({
    data: {
      userId,
      subject: input.subject,
      status: "OPEN",
      orderId,
      messages: {
        create: {
          authorId: userId,
          body: input.body,
          isStaff: false,
          ...attachmentData(input.attachment),
        },
      },
    },
  });
  void notifyAdmin(`🆕 تیکت جدید #${shortId(ticket.id)}`);
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
    orderId: t.orderId,
    messageCount: t._count.messages,
    lastMessage: t.messages[0]?.body ?? "",
    lastFromStaff: t.messages[0]?.isStaff ?? false,
    updatedAt: t.updatedAt,
  }));
}

export async function getMyTicket(userId: string, id: string) {
  const ticket = await prisma.ticket.findFirst({
    where: { id, userId },
    include: ticketInclude,
  });
  if (!ticket) throw new AppError(404, "NOT_FOUND", "Ticket not found");
  return serializeTicket(ticket);
}

const ticketInclude = {
  messages: { orderBy: { createdAt: "asc" }, omit: messageOmit },
  order: { select: orderSummarySelect },
} satisfies Prisma.TicketInclude;

export async function addMyMessage(
  userId: string,
  id: string,
  body: string,
  attachment: NewAttachment | null = null,
) {
  const ticket = await prisma.ticket
    .update({
      where: { id, userId },
      data: {
        status: "OPEN",
        updatedAt: new Date(),
        messages: {
          create: { authorId: userId, body, isStaff: false, ...attachmentData(attachment) },
        },
      },
      include: ticketInclude,
    })
    .catch(ticketWriteError);
  void notifyAdmin(`💬 پاسخ جدید در تیکت #${shortId(id)}`);
  return serializeTicket(ticket);
}

export function ticketWriteError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    throw new AppError(404, "NOT_FOUND", "Ticket not found");
  }
  throw error;
}

type MessageRow = {
  id: string;
  body: string;
  isStaff: boolean;
  createdAt: Date;
  attachmentMime: string | null;
  attachmentName: string | null;
  attachmentSize: number | null;
};

export function serializeMessage(m: MessageRow) {
  return {
    id: m.id,
    body: m.body,
    isStaff: m.isStaff,
    createdAt: m.createdAt,
    attachment:
      m.attachmentMime && m.attachmentSize
        ? { name: m.attachmentName, mime: m.attachmentMime, size: m.attachmentSize }
        : null,
  };
}

export function serializeOrderSummary(
  order: Prisma.OrderGetPayload<{ select: typeof orderSummarySelect }> | null,
) {
  return order
    ? {
        id: order.id,
        createdAt: order.createdAt,
        totalAmount: Number(order.totalAmount),
        currency: order.currency,
        paymentStatus: order.paymentStatus,
      }
    : null;
}

function serializeTicket(t: Prisma.TicketGetPayload<{ include: typeof ticketInclude }>) {
  return {
    id: t.id,
    subject: t.subject,
    status: t.status,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    order: serializeOrderSummary(t.order),
    messages: t.messages.map(serializeMessage),
  };
}

// Owner (or any admin) download of one screenshot. Missing, foreign and
// attachment-less messages all answer the same 404.
export async function getAttachment(
  who: { userId?: string; admin?: boolean },
  ticketId: string,
  messageId: string,
) {
  const message = await prisma.ticketMessage.findFirst({
    where: {
      id: messageId,
      ticketId,
      attachmentData: { not: null },
      ...(who.admin ? {} : { ticket: { userId: who.userId } }),
    },
    select: { attachmentData: true, attachmentMime: true, attachmentName: true },
  });
  if (!message?.attachmentData || !message.attachmentMime)
    throw new AppError(404, "NOT_FOUND", "Attachment not found");
  return message;
}

export function sendAttachment(
  res: Response,
  file: { attachmentData: Uint8Array | null; attachmentMime: string | null },
): void {
  res.setHeader("Content-Type", file.attachmentMime!);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; sandbox");
  res.setHeader("Cache-Control", "private, no-store");
  res.end(Buffer.from(file.attachmentData!));
}
