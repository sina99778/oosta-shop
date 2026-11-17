import { createHash, createHmac, createPublicKey, verify } from "node:crypto";
import express, { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { lockOrder } from "../../lib/orderLock";
import { AppError } from "../../utils/httpError";
import { readBluInvoice } from "./blu-invoice";
import { autoApproveBluReceipts } from "./blu-auto-approval";

const eventSchema = z
  .object({
    version: z.literal(1),
    accountDigest: z.string().regex(/^[a-f0-9]{64}$/),
    currency: z.literal("IRR"),
    direction: z.literal("CREDIT"),
    amountIrr: z.string().regex(/^[1-9]\d{0,14}$/),
    transactionDigest: z.string().regex(/^[a-f0-9]{64}$/),
    trackingDigest: z.string().regex(/^[a-f0-9]{64}$/),
    receiptIdentifierType: z.enum(["TRACKING", "REFERENCE"]).default("TRACKING"),
    occurredAt: z.string().datetime({ precision: 3 }),
    observedAt: z.string().datetime({ precision: 3 }),
  })
  .strict();

export function normalizedReceipt(
  value: string | null,
  key: Buffer,
  type: "TRACKING" | "REFERENCE",
) {
  const code = value?.trim().replace(/[۰-۹٠-٩]/g, (digit) => String(digit.charCodeAt(0) % 16));
  return code && /^\d{4,30}$/.test(code)
    ? createHmac("sha256", key)
        .update(type === "REFERENCE" ? "oosta:blu:reference:v1\0" : "oosta:blu:tracking:v1\0")
        .update(code)
        .digest("hex")
    : null;
}

export function matchesBluReceipt(
  reference: string | null,
  claim: { trackingDigest: string; reviewRequired: boolean } | null,
) {
  const key = Buffer.from(env.BLU_TRACKING_HMAC_KEY ?? "", "base64");
  return (
    !!claim &&
    !claim.reviewRequired &&
    key.length === 32 &&
    (normalizedReceipt(reference, key, "TRACKING") === claim.trackingDigest ||
      normalizedReceipt(reference, key, "REFERENCE") === claim.trackingDigest)
  );
}

async function observe(
  event: z.infer<typeof eventSchema>,
  userId: string | undefined,
  receivingIban: string,
  trackingKey: Buffer,
) {
  const invoiceKey = receivingIban + ":" + event.amountIrr;
  const occurredAt = new Date(event.occurredAt);
  const { trackingDigest } = event;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"oosta:blu:event:" + event.transactionDigest}))`;
    const previous = await tx.bluBankObservation.findUnique({
      where: { transactionDigest: event.transactionDigest },
    });
    if (
      previous &&
      (previous.invoiceKey !== invoiceKey ||
        previous.trackingDigest !== trackingDigest ||
        previous.occurredAt.getTime() !== occurredAt.getTime())
    ) {
      throw new AppError(
        409,
        "BLU_EVENT_CONFLICT",
        "Bank observation conflicts with its recorded identity",
      );
    }

    const pointer = await tx.order.findUnique({
      where: { bluInvoiceKey: invoiceKey },
      select: { id: true },
    });
    if (!pointer) return "ignored";
    await lockOrder(tx, pointer.id);
    const order = await tx.order.findUnique({ where: { id: pointer.id } });
    if (!order || order.bluInvoiceKey !== invoiceKey || order.paymentProvider !== "CARD_TO_CARD")
      return "ignored";
    const snapshot = readBluInvoice(order.paymentMetadata);
    const privateCampaign = env.BLU_QA_INVOICE_CAMPAIGN?.toLowerCase();
    const stockCheckout =
      env.BLU_STOCK_CHECKOUT_ENABLED && snapshot?.stockHeld && !snapshot.qaCampaign;
    const supplierCheckout =
      snapshot?.supplierCheckout &&
      !snapshot.qaCampaign &&
      !snapshot.stockHeld &&
      !!(await tx.order.findFirst({
        where: {
          id: order.id,
          user: { role: "USER" },
          supplierCheckoutQuote: { isNot: null },
          supplierFulfillment: { state: "AWAITING_PAYMENT" },
        },
        select: { id: true },
      }));
    if (
      !snapshot ||
      (!stockCheckout &&
        !supplierCheckout &&
        (order.userId !== userId ||
          (privateCampaign && snapshot.qaCampaign !== privateCampaign))) ||
      ((stockCheckout || supplierCheckout) && snapshot.number !== env.BLU_INVOICE_CARD_NUMBER) ||
      snapshot.iban !== receivingIban ||
      snapshot.amountIrr !== event.amountIrr ||
      (order.currency !== "IRR" && order.currency !== "IRT") ||
      !order.totalAmount.mul(order.currency === "IRT" ? 10 : 1).eq(event.amountIrr)
    )
      return "ignored";
    if (previous?.matchedOrderId && previous.matchedOrderId !== order.id) {
      throw new AppError(
        409,
        "BLU_EVENT_ALREADY_CLAIMED",
        "Bank observation has already been claimed",
      );
    }

    if (!previous) {
      await tx.bluBankObservation.create({
        data: {
          transactionDigest: event.transactionDigest,
          invoiceKey,
          occurredAt,
          trackingDigest,
        },
      });
    }
    if (
      order.paymentStatus !== "PENDING_REVIEW" ||
      occurredAt < order.createdAt ||
      occurredAt.getTime() >= Date.parse(snapshot.expiresAt)
    )
      return "observed";

    const receipts = await tx.receipt.findMany({
      where: { orderId: order.id, status: "PENDING" },
      select: { reference: true },
    });
    const pendingDigests = receipts
      .map((receipt) =>
        normalizedReceipt(receipt.reference, trackingKey, event.receiptIdentifierType),
      )
      .filter((digest): digest is string => digest !== null);
    if (!pendingDigests.includes(trackingDigest)) return "observed";
    const competingDigests = receipts
      .flatMap((receipt) => [
        normalizedReceipt(receipt.reference, trackingKey, "TRACKING"),
        normalizedReceipt(receipt.reference, trackingKey, "REFERENCE"),
      ])
      .filter((digest): digest is string => digest !== null);
    if (previous?.reviewRequired) return "review";
    const otherClaim = await tx.bluBankObservation.findUnique({
      where: { matchedOrderId: order.id },
      select: { transactionDigest: true },
    });
    const otherCandidate = await tx.bluBankObservation.findFirst({
      where: {
        invoiceKey,
        trackingDigest: { in: competingDigests },
        occurredAt: { gte: order.createdAt, lt: new Date(snapshot.expiresAt) },
        transactionDigest: { not: event.transactionDigest },
      },
      select: { transactionDigest: true },
    });
    const competing = [otherClaim?.transactionDigest, otherCandidate?.transactionDigest].filter(
      (digest): digest is string => !!digest && digest !== event.transactionDigest,
    );
    if (competing.length > 0) {
      await tx.bluBankObservation.updateMany({
        where: { transactionDigest: { in: [event.transactionDigest, ...competing] } },
        data: { reviewRequired: true },
      });
      return "review";
    }
    if (previous?.matchedOrderId === order.id) return "matched";
    await tx.bluBankObservation.update({
      where: { transactionDigest: event.transactionDigest },
      data: { matchedOrderId: order.id },
    });
    return "matched";
  });
}

export const bluEventRouter = Router();
bluEventRouter.post(
  "/",
  express.raw({ type: "application/json", limit: "4kb", inflate: false }),
  async (req, res) => {
    const configuredKey = env.BLU_EVENT_PUBLIC_KEY;
    const userId = env.BLU_INVOICE_QA_USER_ID;
    const receivingIban = env.BLU_INVOICE_IBAN;
    const trackingKey = Buffer.from(env.BLU_TRACKING_HMAC_KEY ?? "", "base64");
    if (
      !configuredKey ||
      (!userId && !env.BLU_STOCK_CHECKOUT_ENABLED && !env.BLU_AUTO_APPROVE_ENABLED) ||
      !receivingIban ||
      trackingKey.length !== 32
    ) {
      throw new AppError(404, "NOT_FOUND", "Route not found");
    }
    const signature = req.get("x-oosta-blu-signature");
    let trusted = false;
    if (signature && /^[A-Za-z0-9_-]{86}$/.test(signature) && Buffer.isBuffer(req.body)) {
      try {
        const key = createPublicKey({
          key: Buffer.from(configuredKey, "base64"),
          format: "der",
          type: "spki",
        });
        trusted =
          key.asymmetricKeyType === "ed25519" &&
          verify(null, req.body, key, Buffer.from(signature, "base64url"));
      } catch {
        // An invalid key or signature fails closed.
      }
    }
    if (!trusted)
      throw new AppError(401, "BLU_SIGNATURE_INVALID", "Bank observation signature is invalid");

    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(req.body));
    } catch {
      throw new AppError(400, "BLU_EVENT_INVALID", "Bank observation is invalid");
    }
    const parsed = eventSchema.safeParse(body);
    if (!parsed.success)
      throw new AppError(400, "BLU_EVENT_INVALID", "Bank observation is invalid");
    const event = parsed.data;
    const now = Date.now();
    const observed = Date.parse(event.observedAt);
    const occurred = Date.parse(event.occurredAt);
    if (observed < now - 300000 || observed > now + 60000 || occurred > observed) {
      throw new AppError(400, "BLU_EVENT_TIME_INVALID", "Bank observation time is invalid");
    }
    const accountDigest = createHash("sha256")
      .update("oosta:blu:account:v1\0")
      .update(receivingIban)
      .digest("hex");
    if (event.accountDigest !== accountDigest) {
      res.json({ status: "ignored" });
      return;
    }
    const status = await observe(event, userId, receivingIban, trackingKey);
    if (status === "matched") {
      const order = await prisma.order.findUnique({
        where: { bluInvoiceKey: receivingIban + ":" + event.amountIrr },
        select: { id: true },
      });
      if (order) await autoApproveBluReceipts(order.id);
    }
    res.json({ status });
  },
);
