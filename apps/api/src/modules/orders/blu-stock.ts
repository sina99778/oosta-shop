import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/httpError";

export async function claimAvailableStock(
  tx: Prisma.TransactionClient,
  item: { id: string; planId: string; quantity: number; productId?: string },
  status: "RESERVED" | "SOLD",
) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM inventory_items
    WHERE "planId" = ${item.planId} AND status = 'AVAILABLE'
      ${item.productId ? Prisma.sql`AND "productId" = ${item.productId}` : Prisma.empty}
    ORDER BY "createdAt", id
    LIMIT ${item.quantity}
    FOR UPDATE SKIP LOCKED`;
  if (rows.length !== item.quantity)
    throw new AppError(409, "OUT_OF_STOCK", "The requested items are no longer available");
  await tx.inventoryItem.updateMany({
    where: { id: { in: rows.map(({ id }) => id) } },
    data: { status, orderItemId: item.id, soldAt: status === "SOLD" ? new Date() : null },
  });
}

export async function releaseExpiredBluStock(now = new Date()) {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  return prisma.$transaction(async (tx) => {
    // ISO timestamps written by reserveBluInvoice sort in chronological order.
    const orders = await tx.$queryRaw<{ id: string }[]>`
      SELECT o.id FROM orders o
      WHERE o."bluInvoiceKey" IS NOT NULL
        AND o."paymentStatus" IN ('PENDING', 'REJECTED', 'PENDING_REVIEW')
        AND o."paymentMetadata"->'stockHeld' = 'true'::jsonb
        AND o."paymentMetadata"->>'expiresAt' <= CASE
          WHEN o."paymentStatus" = 'PENDING_REVIEW' THEN ${cutoff}
          ELSE ${now.toISOString()}
        END
        AND NOT EXISTS (
          SELECT 1 FROM blu_bank_observations b WHERE b."matchedOrderId" = o.id
        )
        AND EXISTS (
          SELECT 1 FROM order_items i JOIN inventory_items s ON s."orderItemId" = i.id
          WHERE i."orderId" = o.id AND s.status = 'RESERVED'
        )
      ORDER BY o."createdAt", o.id LIMIT 50 FOR UPDATE OF o SKIP LOCKED`;
    if (!orders.length) return 0;
    const result = await tx.inventoryItem.updateMany({
      where: { status: "RESERVED", orderItem: { orderId: { in: orders.map(({ id }) => id) } } },
      data: { status: "AVAILABLE", orderItemId: null },
    });
    return result.count;
  });
}
