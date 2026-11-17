import { z } from "zod";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { readBluInvoice } from "./blu-invoice";
import { normalizedReceipt } from "./blu-events";
import { releaseExpiredBluStock } from "./blu-stock";
import { autoApproveBluReceipts } from "./blu-auto-approval";

export async function pendingBluQaReceipts() {
  await autoApproveBluReceipts();
  const {
    BLU_INVOICE_QA_USER_ID: userId,
    BLU_INVOICE_IBAN: iban,
    BLU_INVOICE_CARD_NUMBER: cardNumber,
  } = env;
  await releaseExpiredBluStock();
  const campaign = z.string().uuid().safeParse(env.BLU_QA_INVOICE_CAMPAIGN);
  if (!iban || !cardNumber) return [];
  const stock = env.BLU_STOCK_CHECKOUT_ENABLED;
  const scope = [
    ...(campaign.success && userId
      ? [
          {
            userId,
            user: { role: "USER" as const },
            paymentMetadata: { path: ["qaCampaign"], equals: campaign.data.toLowerCase() },
          },
        ]
      : []),
    ...(stock ? [{ paymentMetadata: { path: ["stockHeld"], equals: true } }] : []),
  ];
  if (!scope.length) return [];

  const orders = await prisma.order.findMany({
    where: {
      paymentProvider: "CARD_TO_CARD",
      paymentStatus: "PENDING_REVIEW",
      paidAt: null,
      OR: scope,
      ...(stock ? { createdAt: { gte: new Date(Date.now() - 25 * 60 * 60 * 1000) } } : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      bluInvoiceKey: true,
      currency: true,
      totalAmount: true,
      paymentMetadata: true,
      bluBankClaim: { select: { trackingDigest: true } },
      receipts: { where: { status: "PENDING" }, select: { reference: true }, take: 5 },
    },
  });
  const key = Buffer.from(env.BLU_TRACKING_HMAC_KEY ?? "", "base64");
  const lookups = orders.flatMap((order) => {
    const snapshot = readBluInvoice(order.paymentMetadata);
    if (
      !snapshot ||
      snapshot.iban !== iban ||
      snapshot.number !== cardNumber ||
      !/^[1-9]\d{0,14}$/.test(snapshot.amountIrr) ||
      order.bluInvoiceKey !== iban + ":" + snapshot.amountIrr ||
      (order.currency !== "IRR" && order.currency !== "IRT") ||
      !order.totalAmount.mul(order.currency === "IRT" ? 10 : 1).eq(snapshot.amountIrr) ||
      Date.now() >= Date.parse(snapshot.expiresAt) + 24 * 60 * 60 * 1000
    )
      return [];

    const references = new Set(
      order.receipts.map(({ reference }) =>
        reference?.trim().replace(/[۰-۹٠-٩]/g, (digit) => String(digit.charCodeAt(0) % 16)),
      ),
    );
    if (order.bluBankClaim && key.length !== 32) return [];
    return Array.from(references)
      .filter((reference): reference is string => !!reference && /^\d{4,30}$/.test(reference))
      .filter(
        (reference) =>
          !order.bluBankClaim ||
          (normalizedReceipt(reference, key, "TRACKING") !== order.bluBankClaim.trackingDigest &&
            normalizedReceipt(reference, key, "REFERENCE") !== order.bluBankClaim.trackingDigest),
      )
      .map((reference) => ({ iban, cardNumber, amountIrr: snapshot.amountIrr, reference }));
  });
  if (lookups.length <= 5) return lookups;
  // Give later orders a turn if earlier unmatched receipts remain in the queue.
  const offset = Math.floor(Date.now() / 120000) % lookups.length;
  return [...lookups.slice(offset), ...lookups.slice(0, offset)].slice(0, 5);
}
