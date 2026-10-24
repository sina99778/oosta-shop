// In-site notifications (the header bell) and "notify me when it's back" watches.
// There is no SMS/email channel, so these are how the shop reaches a buyer who
// isn't looking at the page when something happens.

import type { NotificationKind, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/httpError";

type Db = Prisma.TransactionClient | typeof prisma;

const LIST_LIMIT = 30;

export async function notify(
  db: Db,
  userId: string,
  kind: NotificationKind,
  data: Prisma.InputJsonObject,
) {
  await db.notification.create({ data: { userId, kind, data } });
}

export async function listNotifications(userId: string) {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return {
    unread,
    items: items.map((n) => ({
      id: n.id,
      kind: n.kind,
      data: n.data,
      read: n.readAt != null,
      createdAt: n.createdAt,
    })),
  };
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

// ── Stock watches ────────────────────────────────────────────────────

export async function isWatching(userId: string, productId: string) {
  return (await prisma.stockWatch.count({ where: { userId, productId } })) > 0;
}

export async function watchProduct(userId: string, productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { isActive: true },
  });
  if (!product?.isActive) throw new AppError(404, "NOT_FOUND", "Product not found");
  await prisma.stockWatch.upsert({
    where: { userId_productId: { userId, productId } },
    create: { userId, productId },
    update: {},
  });
}

export async function unwatchProduct(userId: string, productId: string) {
  await prisma.stockWatch.deleteMany({ where: { userId, productId } });
}

// Tells everyone waiting for this product that it's back, then drops their
// watches (one notice per wait). Called after new stock is added.
export async function notifyBackInStock(productId: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const watches = await tx.stockWatch.findMany({
      where: { productId },
      include: { product: { select: { id: true, slug: true, name: true, isActive: true } } },
    });
    if (watches.length === 0 || !watches[0].product.isActive) return 0;
    const { id, slug, name } = watches[0].product;
    await tx.notification.createMany({
      data: watches.map((w) => ({
        userId: w.userId,
        kind: "BACK_IN_STOCK" as const,
        data: { productId: id, slug, name },
      })),
    });
    await tx.stockWatch.deleteMany({ where: { id: { in: watches.map((w) => w.id) } } });
    return watches.length;
  });
}
