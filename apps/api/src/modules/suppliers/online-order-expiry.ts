import { lockOrder } from "../../lib/orderLock";
import { prisma } from "../../lib/prisma";
import { settleWallet } from "./wallet-budget";

// The caller must establish that the session can be closed before taking the order lock.
export async function expireOnlineSupplierOrder(id: string, authority: string | null) {
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, id);
    const order = await tx.order.findFirst({
      where: {
        id,
        paymentAuthority: authority,
        paymentStatus: { in: ["PENDING", "FAILED"] },
        paymentProvider: { in: ["ZARINPAL", "MANUAL"] },
        paidAt: null,
        paymentRefId: null,
        bluInvoiceKey: null,
        bluBankClaim: null,
        receipts: { none: {} },
      },
      select: {
        userId: true,
        paymentMetadata: true,
        supplierCheckoutQuote: { select: { id: true, userId: true, planId: true } },
        supplierFulfillment: true,
        items: { select: { planId: true } },
      },
    });
    const quote = order?.supplierCheckoutQuote;
    const job = order?.supplierFulfillment;
    const metadata = order?.paymentMetadata;
    if (
      !order ||
      !quote ||
      !job ||
      quote.userId !== order.userId ||
      order.items.length !== 1 ||
      order.items[0].planId !== quote.planId ||
      !metadata ||
      typeof metadata !== "object" ||
      Array.isArray(metadata) ||
      metadata.purpose !== "SUPPLIER_CHECKOUT" ||
      metadata.quoteId !== quote.id ||
      !["AWAITING_PAYMENT", "NO_CHARGE"].includes(job.state) ||
      job.supplierOrderId ||
      job.chargedCost !== null
    )
      return false;

    if (job.state === "AWAITING_PAYMENT") {
      await settleWallet(tx, job, "0");
      await tx.supplierFulfillment.update({ where: { id: job.id }, data: { state: "NO_CHARGE" } });
    }
    await tx.order.update({ where: { id }, data: { paymentStatus: "EXPIRED" } });
    await tx.cartLine.updateMany({
      where: { orderId: id, userId: order.userId, planId: quote.planId },
      data: { orderId: null },
    });
    return true;
  });
}
