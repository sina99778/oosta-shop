// Connecting site accounts to the customer Telegram bot.
//
// The deep link carries a single-use token that expires in 30 minutes: whoever
// starts it gets this account's orders and delivered credentials in their chat,
// so a link must never be long-lived or reusable. Only the SHA-256 is stored.

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/httpError";

const TOKEN_TTL_MS = 30 * 60 * 1000;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export type ChatInfo = { id: number; username?: string; firstName?: string };

// 24 random bytes → 32 base64url chars: fits Telegram's 64-char start payload.
export async function createLinkToken(userId: string) {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await prisma.$transaction([
    prisma.telegramLinkToken.deleteMany({ where: { userId, usedAt: null } }),
    prisma.telegramLinkToken.create({ data: { userId, tokenHash: hash(token), expiresAt } }),
  ]);
  return { token, expiresAt };
}

// Spends a link token and binds the chat to its account. A chat or account that
// was linked before is moved over (one chat per account, one account per chat).
export async function linkChat(token: string, chat: ChatInfo) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.telegramLinkToken.updateMany({
      where: { tokenHash: hash(token), usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new AppError(400, "LINK_INVALID", "This link is invalid or has expired");
    }
    const { userId } = await tx.telegramLinkToken.findUniqueOrThrow({
      where: { tokenHash: hash(token) },
      select: { userId: true },
    });
    const chatId = BigInt(chat.id);
    await tx.telegramLink.deleteMany({ where: { OR: [{ userId }, { chatId }] } });
    await tx.telegramLink.create({
      data: { userId, chatId, username: chat.username ?? null, firstName: chat.firstName ?? null },
    });
    // Older notices stay on the site; only new ones are sent to the chat.
    await tx.notification.updateMany({
      where: { userId, telegramSentAt: null },
      data: { telegramSentAt: new Date() },
    });
    return tx.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true } });
  });
}

export function linkForChat(chatId: number) {
  return prisma.telegramLink.findUnique({
    where: { chatId: BigInt(chatId) },
    include: { user: { select: { id: true, name: true, email: true, phone: true } } },
  });
}

export async function unlinkUser(userId: string) {
  await prisma.telegramLink.deleteMany({ where: { userId } });
}

export async function unlinkChat(chatId: number) {
  await prisma.telegramLink.deleteMany({ where: { chatId: BigInt(chatId) } });
}

export async function setNewsOptIn(userId: string, newsOptIn: boolean) {
  const result = await prisma.telegramLink.updateMany({ where: { userId }, data: { newsOptIn } });
  if (result.count === 0) throw new AppError(404, "NOT_LINKED", "Telegram is not connected");
}

export async function markChatBlocked(chatId: bigint, blocked: boolean) {
  await prisma.telegramLink.updateMany({
    where: { chatId },
    data: { blockedAt: blocked ? new Date() : null },
  });
}

export async function linkStatus(userId: string) {
  const link = await prisma.telegramLink.findUnique({ where: { userId } });
  return link
    ? { username: link.username, linkedAt: link.linkedAt, newsOptIn: link.newsOptIn }
    : null;
}

export async function isLinked(userId: string) {
  return (await prisma.telegramLink.count({ where: { userId } })) > 0;
}

// ── Outbox: site notifications → Telegram ────────────────────────────

export async function pendingNotifications(limit = 50) {
  return prisma.notification.findMany({
    where: { telegramSentAt: null, user: { telegram: { is: { blockedAt: null } } } },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { user: { select: { telegram: { select: { chatId: true } } } } },
  });
}

export async function markNotificationsSent(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.notification.updateMany({
    where: { id: { in: ids } },
    data: { telegramSentAt: new Date() },
  });
}

// ── Broadcasts (news and exclusive offers) ───────────────────────────

const recipientsWhere = { newsOptIn: true, blockedAt: null };

export async function broadcastAudience() {
  return prisma.telegramLink.count({ where: recipientsWhere });
}

export async function createBroadcast(text: string) {
  const total = await broadcastAudience();
  if (total === 0) throw new AppError(400, "NO_RECIPIENTS", "No subscribers to send to yet");
  return prisma.broadcast.create({ data: { text, total } });
}

export function listBroadcasts() {
  return prisma.broadcast.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
}

export function nextPendingBroadcast() {
  return prisma.broadcast.findFirst({ where: { doneAt: null }, orderBy: { createdAt: "asc" } });
}

// The next batch of recipients after the broadcast's cursor.
export function broadcastBatch(afterLinkId: string | null, size = 25) {
  return prisma.telegramLink.findMany({
    where: { ...recipientsWhere, ...(afterLinkId ? { id: { gt: afterLinkId } } : {}) },
    orderBy: { id: "asc" },
    take: size,
    select: { id: true, chatId: true },
  });
}

export async function recordBroadcastProgress(
  id: string,
  lastLinkId: string,
  sent: number,
  failed: number,
) {
  await prisma.broadcast.update({
    where: { id },
    data: { lastLinkId, sent: { increment: sent }, failed: { increment: failed } },
  });
}

export async function finishBroadcast(id: string) {
  await prisma.broadcast.update({ where: { id }, data: { doneAt: new Date() } });
}
