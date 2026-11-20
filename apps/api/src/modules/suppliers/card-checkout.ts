import { createPublicKey } from "node:crypto";
import type { Order, Prisma, Receipt } from "@prisma/client";
import { env } from "../../config/env";
import type { GatewayConfig } from "../../lib/gatewayConfig";
import { AppError } from "../../utils/httpError";
import { readBluInvoice } from "../orders/blu-invoice";
import { matchesBluReceipt } from "../orders/blu-events";
import { readVariant, variantKey } from "./variant";

export function supplierCardReady(gateway: GatewayConfig) {
  try {
    const key = createPublicKey({
      key: Buffer.from(env.BLU_EVENT_PUBLIC_KEY ?? "", "base64"),
      format: "der",
      type: "spki",
    });
    return (
      env.BLU_AUTO_APPROVE_ENABLED &&
      !env.SUPPLIER_MANUAL_APPROVAL &&
      gateway.cardEnabled &&
      key.asymmetricKeyType === "ed25519" &&
      Buffer.from(env.BLU_TRACKING_HMAC_KEY ?? "", "base64").length === 32 &&
      /^IR\d{24}$/.test(env.BLU_INVOICE_IBAN ?? "") &&
      /^\d{16}$/.test(env.BLU_INVOICE_CARD_NUMBER ?? "") &&
      gateway.cardNumber === env.BLU_INVOICE_CARD_NUMBER &&
      !!gateway.cardHolder.trim()
    );
  } catch {
    return false;
  }
}

// Called only by receipt approval while holding the existing order lock.
export async function confirmSupplierCardPayment(
  tx: Prisma.TransactionClient,
  receipt: Pick<Receipt, "id" | "reference" | "orderId"> & { order: Order },
  automatic: boolean,
) {
  const order = receipt.order,
    invoice = readBluInvoice(order.paymentMetadata);
  const [quote, job, claim, user, items] = await Promise.all([
    tx.supplierCheckoutQuote.findUnique({
      where: { orderId: order.id },
      include: { plan: { include: { product: { select: { isActive: true } } } } },
    }),
    tx.supplierFulfillment.findUnique({ where: { orderId: order.id } }),
    tx.bluBankObservation.findUnique({ where: { matchedOrderId: order.id } }),
    tx.user.findUnique({ where: { id: order.userId }, select: { role: true } }),
    tx.orderItem.findMany({ where: { orderId: order.id } }),
  ]);
  const variant = readVariant(quote?.plan.variant),
    item = items[0];
  if (
    !invoice?.supplierCheckout ||
    invoice.qaCampaign ||
    invoice.stockHeld ||
    !quote ||
    !job ||
    !variant ||
    !quote.plan.isActive ||
    !quote.plan.product.isActive ||
    quote.plan.source !== "SUPPLIER" ||
    quote.userId !== order.userId ||
    user?.role !== "USER" ||
    (automatic && (!env.BLU_AUTO_APPROVE_ENABLED || env.SUPPLIER_MANUAL_APPROVAL)) ||
    order.paymentProvider !== "CARD_TO_CARD" ||
    order.paymentStatus !== "PENDING_REVIEW" ||
    order.paidAt ||
    order.paymentRefId ||
    job.state !== "AWAITING_PAYMENT" ||
    quote.signature !== job.variantKey ||
    quote.signature !== variantKey(variant, quote.plan.durationDays) ||
    items.length !== 1 ||
    item.quantity !== 1 ||
    item.planId !== quote.planId ||
    item.productId !== quote.plan.productId ||
    !item.unitPrice.eq(order.totalAmount) ||
    !item.lineTotal.eq(order.totalAmount) ||
    order.currency !== "IRR" ||
    invoice.iban !== env.BLU_INVOICE_IBAN ||
    invoice.number !== env.BLU_INVOICE_CARD_NUMBER ||
    order.bluInvoiceKey !== invoice.iban + ":" + invoice.amountIrr ||
    !order.totalAmount.eq(invoice.amountIrr) ||
    !quote.amount.eq(invoice.baseAmount) ||
    !order.totalAmount.add(invoice.discount).eq(quote.amount) ||
    quote.expiresAt.getTime() !== Date.parse(invoice.expiresAt) ||
    job.expiresAt.getTime() !== quote.expiresAt.getTime() ||
    !matchesBluReceipt(receipt.reference, claim) ||
    !claim ||
    claim.invoiceKey !== order.bluInvoiceKey ||
    claim.occurredAt < order.createdAt ||
    claim.occurredAt.getTime() >= quote.expiresAt.getTime() ||
    Date.now() >= quote.expiresAt.getTime() + 86400000
  )
    throw new AppError(
      409,
      "SUPPLIER_BANK_PROOF_REQUIRED",
      "Supplier payment requires matching immutable bank evidence",
    );
  await tx.order.update({
    where: { id: order.id },
    data: {
      paymentStatus: "PAID_PENDING_FULFILLMENT",
      paidAt: new Date(),
      paymentRefId: "card:" + receipt.id,
    },
  });
  await tx.supplierFulfillment.update({ where: { id: job.id }, data: { state: "READY" } });
}
