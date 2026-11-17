import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/httpError";

// The same transaction as manual approval; only the trusted worker can request automatic mode.
export async function autoApproveBluReceipts(orderId?: string) {
  if (!env.BLU_AUTO_APPROVE_ENABLED) return 0;
  const where = {
    status: "PENDING" as const,
    ...(orderId ? { orderId } : {}),
    order: {
      paymentProvider: "CARD_TO_CARD" as const,
      paymentStatus: "PENDING_REVIEW" as const,
      paidAt: null,
      user: { role: "USER" as const },
      OR: [
        { paymentMetadata: { path: ["stockHeld"], equals: true } },
        {
          paymentMetadata: { path: ["supplierCheckout"], equals: true },
          supplierCheckoutQuote: { isNot: null },
        },
      ],
      bluBankClaim: { is: { reviewRequired: false } },
    },
  };
  const count = await prisma.receipt.count({ where });
  if (!count) return 0;
  const candidates = await prisma.receipt.findMany({
    where,
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 5,
    skip: orderId ? 0 : (Math.floor(Date.now() / 120000) * 5) % count,
  });
  const { approveReceipt } = await import("../admin/admin.service");
  let approved = 0;
  for (const candidate of candidates) {
    try {
      await approveReceipt(candidate.id, {}, true);
      approved++;
    } catch (error) {
      // One failed order must not block unrelated approvals or bank lookups.
      if (!(error instanceof AppError && error.statusCode === 409))
        console.error(
          "[blu-auto-approval] approval failed; pending receipt retained",
          candidate.id,
        );
    }
  }
  return approved;
}
