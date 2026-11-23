import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/httpError";
import { lockOrder } from "../../lib/orderLock";
import { readVariant, variantKey } from "../suppliers/variant";
import { z } from "zod";
import { isWelcomeCode, welcomePercentFor } from "./welcome-gift";

export const CART_LIFETIME = 24 * 60 * 60 * 1000;
export const CART_PAYMENT_WINDOW = 30 * 60_000;
const privateStockSchema = z
  .object({ userId: z.string().min(1), planId: z.string().min(1) })
  .strict();

export async function isCartPlanAvailable(
  client: Pick<Prisma.TransactionClient, "siteSetting">,
  userId: string,
  plan: { id: string; source: string; isActive: boolean; product: { isActive: boolean } },
) {
  if (!plan.product.isActive) return false;
  if (plan.isActive) return true;
  if (plan.source !== "INTERNAL") return false;
  const setting = await client.siteSetting.findUnique({ where: { key: "checkout.privateStock" } });
  if (!setting) return false;
  try {
    const scope = privateStockSchema.parse(JSON.parse(setting.value));
    return scope.userId === userId && scope.planId === plan.id;
  } catch {
    return false;
  }
}
export const cartChanged = () =>
  new AppError(409, "CART_CHANGED", "Review the updated invoice before paying");
type CartPlan = { source: string; currency: string; variant: unknown; durationDays: number | null };
export function cartSignature(plan: CartPlan) {
  const variant = readVariant(plan.variant);
  return createHash("sha256")
    .update(
      JSON.stringify([
        plan.source,
        plan.currency,
        plan.durationDays,
        variant ? variantKey(variant, plan.durationDays) : null,
      ]),
    )
    .digest("hex");
}
export async function discountPercentFor(
  client: Prisma.TransactionClient,
  userId: string,
  code?: string,
) {
  if (!code) return 0;
  if (isWelcomeCode(code)) return welcomePercentFor(client, userId, code);
  const percent = process.env.OOSTA_DISCOUNT_CODES?.split(",")
    .map((entry) => entry.trim().split(":"))
    .find(
      ([key, rate, ...extra]) =>
        key === code && !extra.length && /^(?:[1-9]|[1-8]\d|90)$/.test(rate ?? ""),
    );
  if (!percent) throw new AppError(400, "INVALID_DISCOUNT_CODE", "Discount code is invalid");
  return Number(percent[1]);
}
export function discountFor(subtotal: Prisma.Decimal, percent: number) {
  return subtotal.mul(percent).div(100).floor();
}
export async function lockCartLine(tx: Prisma.TransactionClient, userId: string, id: string) {
  await tx.$queryRaw`SELECT id FROM cart_lines WHERE id = ${id} AND "userId" = ${userId} FOR UPDATE`;
  const line = await tx.cartLine.findFirst({ where: { id, userId } });
  if (!line) throw new AppError(404, "NOT_FOUND", "Cart item not found");
  return line;
}
export async function releaseCartLine(tx: Prisma.TransactionClient, id: string) {
  await tx.inventoryItem.updateMany({
    where: { cartLineId: id, status: "RESERVED" },
    data: { cartLineId: null, status: "AVAILABLE" },
  });
  await tx.cartLine.delete({ where: { id } });
}

async function expireCartOrders(tx: Prisma.TransactionClient, ids: string[]) {
  if (!ids.length) return;
  await tx.inventoryItem.updateMany({
    where: { status: "RESERVED", orderItem: { orderId: { in: ids } } },
    data: { status: "AVAILABLE", orderItemId: null },
  });
  await tx.order.updateMany({ where: { id: { in: ids } }, data: { paymentStatus: "EXPIRED" } });
  await tx.cartLine.updateMany({ where: { orderId: { in: ids } }, data: { orderId: null } });
}

// The session identity must still match after the network request.
export async function expireOnlineCartOrder(id: string, authority: string | null) {
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, id);
    const order = await tx.order.findFirst({
      where: {
        id,
        paymentAuthority: authority,
        paidAt: null,
        paymentRefId: null,
        paymentStatus: { in: ["PENDING", "FAILED"] },
        paymentProvider: { in: ["ZARINPAL", "MANUAL"] },
        paymentMetadata: { path: ["cartStockHeld"], equals: true },
        receipts: { none: {} },
      },
      select: { id: true },
    });
    if (order) await expireCartOrders(tx, [order.id]);
  });
}

export async function releaseExpiredCart(now = new Date()) {
  const lateReceiptCutoff = new Date(now.getTime() - CART_LIFETIME).toISOString();
  await prisma.$transaction(async (tx) => {
    const lines = await tx.$queryRaw<{ id: string }[]>`SELECT c.id FROM cart_lines c
      WHERE c."expiresAt" <= ${now}
        AND NOT EXISTS (
          SELECT 1 FROM orders o
          WHERE o.id = c."orderId" AND o."paymentStatus" NOT IN ('PAID', 'EXPIRED', 'REFUNDED')
        )
      ORDER BY c."expiresAt" LIMIT 100 FOR UPDATE OF c SKIP LOCKED`;
    for (const line of lines) await releaseCartLine(tx, line.id);
    const orders = await tx.$queryRaw<{ id: string }[]>`SELECT o.id FROM orders o
      WHERE o."paidAt" IS NULL AND (
        (o."paymentStatus" IN ('PENDING','FAILED')
          AND o."paymentMetadata"->'cartStockHeld' = 'true'::jsonb
          AND o."bluInvoiceKey" IS NULL
          AND ((o."paymentAuthority" IS NULL AND (
            o."paymentStatus" = 'FAILED'
            OR (o."paymentProvider" IN ('ZARINPAL', 'MANUAL')
              AND o."paymentMetadata"->>'cartExpiresAt' <= ${now.toISOString()})))
            OR (o."paymentProvider" = 'CARD_TO_CARD' AND o."paymentMetadata"->>'cartExpiresAt' <= ${now.toISOString()}))
          AND NOT EXISTS (SELECT 1 FROM receipts WHERE "orderId"=o.id))
        OR
        (o."paymentStatus" IN ('PENDING','REJECTED') AND o."paymentProvider" = 'CARD_TO_CARD'
          AND EXISTS (SELECT 1 FROM welcome_gifts WHERE "userId"=o."userId")
          AND ((o."paymentStatus" = 'REJECTED' AND o."paymentMetadata"->'manualSupplier' = 'true'::jsonb)
            OR COALESCE(o."paymentMetadata"->>'cartExpiresAt', o."paymentMetadata"->>'expiresAt') <= ${lateReceiptCutoff})
          AND NOT EXISTS (SELECT 1 FROM receipts WHERE "orderId"=o.id AND status <> 'REJECTED')
          AND NOT EXISTS (SELECT 1 FROM blu_bank_observations
            WHERE "invoiceKey"=o."bluInvoiceKey" AND "occurredAt">=o."createdAt"))
      )
      AND NOT EXISTS (SELECT 1 FROM blu_bank_observations WHERE "matchedOrderId"=o.id)
      ORDER BY o."createdAt" LIMIT 100 FOR UPDATE OF o SKIP LOCKED`;
    await expireCartOrders(
      tx,
      orders.map(({ id }) => id),
    );
  });
}

export type CartPayment = {
  lineId: string;
  extraIds?: string[];
  revision?: string;
  subtotal: string;
  total: string;
  code?: string;
};
export function cartRevision(items: { line: { id: string }; price: Prisma.Decimal }[]) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        items
          .map(({ line, price }) => [line.id, price.toString()])
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
    )
    .digest("hex");
}
const cardSnapshot = z.object({
  cartStockHeld: z.literal(true),
  cartExpiresAt: z.iso.datetime(),
  cartCard: z.object({
    number: z.string().regex(/^\d{16}$/),
    holder: z.string().min(1),
    bank: z.string(),
  }),
});
export const readCartCard = (value: unknown) => cardSnapshot.safeParse(value).data;
export async function checkedCartTotal(
  tx: Prisma.TransactionClient,
  userId: string,
  subtotal: Prisma.Decimal,
  payment: CartPayment,
) {
  const discount = discountFor(subtotal, await discountPercentFor(tx, userId, payment.code));
  const total = subtotal.sub(discount);
  if (!subtotal.eq(payment.subtotal) || !total.eq(payment.total) || !total.gt(0))
    throw cartChanged();
  return { subtotal, discount, total };
}

export function cartNotice(
  previous: Prisma.Decimal,
  current: Prisma.Decimal | null,
  currency: string,
) {
  if (current === null) return "UNAVAILABLE";
  if (current.sub(previous).gte(currency === "IRT" ? 100000 : 1000000)) return "PRICE_INCREASE";
  return null;
}
