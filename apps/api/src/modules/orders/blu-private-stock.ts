import type { Order, OrderItem, Prisma } from "@prisma/client";
import { env } from "../../config/env";
import { qaSelectionSchema } from "../suppliers/vente-purchase";
import { matchesBluReceipt } from "./blu-events";
import type { readBluInvoice } from "./blu-invoice";

export async function canDeliverPrivateBluStock(
  tx: Prisma.TransactionClient,
  order: Pick<Order, "id" | "userId"> & { items: Pick<OrderItem, "planId" | "quantity">[] },
  invoice: ReturnType<typeof readBluInvoice>,
) {
  if (
    !invoice?.privateStockQa ||
    !invoice.stockHeld ||
    invoice.qaCampaign !== env.BLU_QA_INVOICE_CAMPAIGN?.toLowerCase() ||
    order.userId !== env.BLU_INVOICE_QA_USER_ID ||
    order.items.length !== 1
  )
    return false;

  const [attempt, claim, receipts, profile] = await Promise.all([
    tx.supplierQaAttempt.findUnique({ where: { orderId: order.id } }),
    tx.bluBankObservation.findUnique({ where: { matchedOrderId: order.id } }),
    tx.receipt.findMany({
      where: { orderId: order.id, status: "PENDING" },
      select: { reference: true },
    }),
    tx.user.findUnique({ where: { id: order.userId }, select: { role: true } }),
  ]);
  const selection = qaSelectionSchema.safeParse(attempt?.selection);
  return (
    !!attempt &&
    attempt.userId === order.userId &&
    attempt.state === "AWAITING_PAYMENT" &&
    selection.success &&
    selection.data.holdForCheckout === true &&
    order.items[0].planId === "internal-held-qa-plan-" + attempt.id &&
    order.items[0].quantity === 1 &&
    profile?.role === "USER" &&
    receipts.some((r) => matchesBluReceipt(r.reference, claim))
  );
}
