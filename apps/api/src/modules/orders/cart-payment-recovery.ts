import type { Prisma } from "@prisma/client";
import { notifyAdmin } from "../../bot";
import { lockOrder } from "../../lib/orderLock";
import { prisma } from "../../lib/prisma";
import { inquireZarinpalPayment } from "../payments/provider";
import { expireOnlineSupplierOrder } from "../suppliers/online-order-expiry";
import { CART_PAYMENT_WINDOW, expireOnlineCartOrder } from "./cart-state";
import { verifyAndDeliver } from "./orders.service";

let nextOrderId: string | undefined;
let sweeping = false;
const reviewDelay = 24 * 60 * 60_000;
const authorityCreationGrace = 60_000;

type OnlineOrder = {
  id: string;
  paymentProvider: "ZARINPAL" | "MANUAL";
  paymentAuthority: string | null;
  paymentMetadata: Prisma.JsonValue;
  quoteDeadline: Date | null;
  createdAt: Date;
};

async function flagPaymentForReview(order: OnlineOrder, invalidAuthority: boolean) {
  const flagged = await prisma.$transaction(async (tx) => {
    await lockOrder(tx, order.id);
    const current = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
    const metadata = current.paymentMetadata as Prisma.JsonObject | null;
    if (
      current.paidAt ||
      current.paymentRefId ||
      !["PENDING", "FAILED"].includes(current.paymentStatus) ||
      current.paymentAuthority !== order.paymentAuthority ||
      metadata?.paymentReviewRequired === true
    )
      return false;
    await tx.order.update({
      where: { id: order.id },
      data: { paymentMetadata: { ...metadata, paymentReviewRequired: true } },
    });
    return true;
  });
  if (flagged)
    await notifyAdmin(
      `پرداخت سفارش #${order.id.slice(-8)} نیاز به بررسی دستی دارد. ` +
        (invalidAuthority
          ? "درگاه شناسهٔ پرداخت را نامعتبر گزارش کرد."
          : "پاسخ قطعی درگاه ثبت نشد."),
    ).catch(() => {});
}

export async function reconcileOnlineCartPayments(
  now = new Date(),
  verifySupplier?: (
    authority: string,
    status: string,
  ) => Promise<{ status: "paid" | "pending" | "failed" } | null>,
) {
  if (sweeping) return;
  sweeping = true;
  try {
    const orders = await prisma.$queryRaw<OnlineOrder[]>`
      SELECT o.id, o."paymentProvider", o."paymentAuthority", o."paymentMetadata",
             o."createdAt", q."expiresAt" AS "quoteDeadline"
      FROM orders o
      LEFT JOIN supplier_checkout_quotes q ON q."orderId" = o.id
      WHERE o.id > ${nextOrderId ?? ""}
        AND o."paymentStatus" IN ('PENDING', 'FAILED')
        AND o."paymentProvider" IN ('ZARINPAL', 'MANUAL')
        AND o."paidAt" IS NULL AND o."paymentRefId" IS NULL
        AND o."paymentMetadata"->>'paymentReviewRequired' IS DISTINCT FROM 'true'
        AND (
          (q.id IS NULL AND o."paymentAuthority" IS NOT NULL
            AND o."paymentMetadata"->>'cartStockHeld' = 'true'
            AND (o."paymentStatus" = 'FAILED'
              OR o."paymentMetadata"->>'cartExpiresAt' <= ${now.toISOString()}))
          OR (${!!verifySupplier} AND q.id IS NOT NULL
            AND (o."paymentStatus" = 'FAILED' OR q."expiresAt" <= ${now}
              OR (o."paymentAuthority" IS NULL
                AND o."createdAt" <= ${new Date(now.getTime() - authorityCreationGrace)})))
        )
      ORDER BY o.id LIMIT 8`;
    nextOrderId = orders.length === 8 ? orders.at(-1)?.id : undefined;
    await Promise.all(
      orders.map(async (order) => {
        const authority = order.paymentAuthority;
        const supplier = !!order.quoteDeadline;
        const expire = supplier ? expireOnlineSupplierOrder : expireOnlineCartOrder;
        const metadata = order.paymentMetadata as Prisma.JsonObject | null;
        const cartDeadline =
          typeof metadata?.cartExpiresAt === "string" ? Date.parse(metadata.cartExpiresAt) : NaN;
        const deadline =
          order.quoteDeadline?.getTime() ??
          (Number.isFinite(cartDeadline)
            ? cartDeadline
            : order.createdAt.getTime() + CART_PAYMENT_WINDOW);
        const reviewDue = now.getTime() >= deadline + reviewDelay;
        try {
          if (!authority || order.paymentProvider === "MANUAL") {
            // Mock sessions cannot represent a bank charge. Preserve their existing retry window.
            if (!authority || deadline <= now.getTime()) await expire(order.id, authority);
            return;
          }
          const context = supplier ? metadata?.verificationContext : metadata;
          const status = await inquireZarinpalPayment(authority, context).catch(() => null);
          if (status === "FAILED" || status === "REVERSED") {
            await expire(order.id, authority);
            if (reviewDue) await flagPaymentForReview(order, false);
          } else if (status === "PAID" || status === "VERIFIED") {
            const result = await (supplier && verifySupplier ? verifySupplier : verifyAndDeliver)(
              authority,
              "OK",
            );
            if (reviewDue && (!result || result.status === "failed"))
              await flagPaymentForReview(order, false);
          } else if (reviewDue) {
            await flagPaymentForReview(order, status === "INVALID_AUTHORITY");
          }
        } catch {
          if (authority && reviewDue) {
            await flagPaymentForReview(order, false).catch(() =>
              console.warn("[cart] payment review could not be recorded", order.id),
            );
          } else {
            console.warn("[cart] payment reconciliation will retry", order.id);
          }
        }
      }),
    );
  } finally {
    sweeping = false;
  }
}
