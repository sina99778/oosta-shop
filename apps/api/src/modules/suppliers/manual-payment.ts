import type { Order, Prisma, Receipt } from "@prisma/client";
import { z } from "zod";
import { env } from "../../config/env";
import type { GatewayConfig } from "../../lib/gatewayConfig";
import { AppError } from "../../utils/httpError";
import { readVariant, variantKey } from "./variant";
import { createHash } from "node:crypto";

const manualInvoice = z.object({
  manualSupplier: z.literal(true),
  quoteId: z.string().min(1),
  number: z.string().regex(/^\d{16}$/),
  holder: z.string().trim().min(1),
  bank: z.string(),
  expiresAt: z.iso.datetime(),
});
export const readManualSupplier = (value: unknown) => manualInvoice.safeParse(value).data;
export function manualSupplierCardReady(gateway: GatewayConfig) {
  return (
    env.SUPPLIER_MANUAL_APPROVAL &&
    gateway.cardEnabled &&
    /^\d{16}$/.test(gateway.cardNumber) &&
    !!gateway.cardHolder.trim()
  );
}

// The caller holds the order lock. This evidence is also checked before dispatch.
export async function confirmManualSupplierPayment(
  tx: Prisma.TransactionClient,
  receipt: Pick<Receipt, "id" | "status" | "reference"> & { order: Order },
) {
  const { order } = receipt;
  const invoice = readManualSupplier(order.paymentMetadata);
  const quote = await tx.supplierCheckoutQuote.findUnique({
    where: { orderId: order.id },
    include: { user: { select: { role: true } } },
  });
  const job = await tx.supplierFulfillment.findUnique({ where: { orderId: order.id } });
  const items = await tx.orderItem.findMany({
    where: { orderId: order.id },
    include: { plan: true, product: { select: { isActive: true } } },
  });
  const item = items[0];
  const variant = readVariant(item?.plan.variant);
  const tracking = receipt.reference?.trim();
  if (
    !env.SUPPLIER_MANUAL_APPROVAL ||
    !invoice ||
    !quote ||
    !job ||
    !item ||
    !variant ||
    order.paymentProvider !== "CARD_TO_CARD" ||
    order.bluInvoiceKey ||
    order.currency !== "IRR" ||
    order.paymentStatus !== "PENDING_REVIEW" ||
    order.paidAt ||
    receipt.status !== "PENDING" ||
    job.state !== "AWAITING_PAYMENT" ||
    job.walletExposure ||
    quote.id !== invoice.quoteId ||
    quote.userId !== order.userId ||
    quote.user.role !== "USER" ||
    items.length !== 1 ||
    item.quantity !== 1 ||
    item.planId !== quote.planId ||
    item.productId !== item.plan.productId ||
    item.plan.source !== "SUPPLIER" ||
    !item.product.isActive ||
    !item.plan.isActive ||
    quote.signature !== variantKey(variant, item.plan.durationDays) ||
    job.variantKey !== quote.signature ||
    !item.unitPrice.eq(quote.amount) ||
    !item.lineTotal.eq(quote.amount) ||
    !order.totalAmount.eq(quote.amount) ||
    quote.amount.lte(0) ||
    !/^\d{4,30}$/.test(tracking ?? "")
  )
    throw new AppError(409, "SUPPLIER_MANUAL_PAYMENT_INVALID", "Supplier payment requires review");
  const key =
    "supplierAudit.deposit." +
    createHash("sha256")
      .update(invoice.number + ":" + tracking)
      .digest("hex");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  if (await tx.siteSetting.findUnique({ where: { key } }))
    throw new AppError(409, "SUPPLIER_DEPOSIT_USED", "Transfer reference already approved");
  await tx.siteSetting.create({ data: { key, value: order.id } });
  await tx.order.update({
    where: { id: order.id },
    data: {
      paymentStatus: "PAID_PENDING_FULFILLMENT",
      paidAt: new Date(),
      paymentRefId: "card:" + receipt.id,
    },
  });
  await tx.supplierFulfillment.update({ where: { id: job.id }, data: { state: "AWAITING_FUNDS" } });
}
