import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import type { GatewayConfig } from "../../lib/gatewayConfig";
import { AppError } from "../../utils/httpError";
import { qaSelectionSchema } from "../suppliers/vente-purchase";
import { claimAvailableStock } from "./blu-stock";

const invoiceSchema = z.object({
  purpose: z.literal("BLU_INVOICE"),
  iban: z.string().regex(/^IR\d{24}$/),
  number: z.string().regex(/^\d{16}$/),
  holder: z.string().min(1),
  bank: z.string(),
  baseAmount: z.number().positive(),
  discount: z.number().positive(),
  amountIrr: z.string().regex(/^[1-9]\d*$/),
  expiresAt: z.string().datetime(),
  qaCampaign: z.string().uuid().optional(),
  stockHeld: z.literal(true).optional(),
  privateStockQa: z.literal(true).optional(),
});

export function readBluInvoice(metadata: Prisma.JsonValue | null) {
  const parsed = invoiceSchema.safeParse(metadata);
  return parsed.success ? parsed.data : null;
}

export async function reserveBluInvoice(
  tx: Prisma.TransactionClient,
  gateway: Pick<GatewayConfig, "cardNumber" | "cardHolder" | "cardBank">,
  baseAmount: Prisma.Decimal,
  currency: string,
  qaCampaign?: string,
) {
  const iban = env.BLU_INVOICE_IBAN;
  const number = env.BLU_INVOICE_CARD_NUMBER;
  if (
    !iban ||
    !/^IR\d{24}$/.test(iban) ||
    !number ||
    !/^\d{16}$/.test(number) ||
    gateway.cardNumber !== number ||
    !gateway.cardHolder.trim()
  ) {
    throw new AppError(
      503,
      "BLU_DESTINATION_UNAVAILABLE",
      "The Blu receiving account is unavailable",
    );
  }
  if (currency !== "IRR" && currency !== "IRT") {
    throw new AppError(400, "BLU_CURRENCY_UNSUPPORTED", "Blu invoices require rial or toman");
  }
  const factor = currency === "IRT" ? 10 : 1;
  const baseIrr = baseAmount.mul(factor);
  if (!baseIrr.isInteger() || baseIrr.lte(10) || baseIrr.gt(Number.MAX_SAFE_INTEGER)) {
    throw new AppError(
      400,
      "BLU_AMOUNT_UNSUPPORTED",
      "The order amount cannot be used for a Blu invoice",
    );
  }

  // One lock per receiving account. All currencies share the same rial key space.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"oosta:blu-invoice:" + iban}))`;
  const candidates = Array.from({ length: 249 }, (_, index) => baseIrr.sub((index + 1) * 10))
    .filter((amount) => amount.gt(0))
    .map((amount) => ({ amount, key: iban + ":" + amount.toFixed(0) }));
  const reserved = await tx.order.findMany({
    where: { bluInvoiceKey: { in: candidates.map(({ key }) => key) } },
    select: { bluInvoiceKey: true },
  });
  const used = new Set(reserved.map((order) => order.bluInvoiceKey));
  const available = candidates.find(({ key }) => !used.has(key));
  if (!available) {
    throw new AppError(409, "BLU_AMOUNTS_UNAVAILABLE", "No unique transfer amount is available");
  }
  const totalAmount = available.amount.div(factor);
  const snapshot = invoiceSchema.parse({
    purpose: "BLU_INVOICE",
    iban,
    number,
    holder: gateway.cardHolder,
    bank: gateway.cardBank,
    baseAmount: Number(baseAmount),
    discount: Number(baseAmount.sub(totalAmount)),
    amountIrr: available.amount.toFixed(0),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    ...(qaCampaign ? { qaCampaign } : {}),
  });
  return { totalAmount, bluInvoiceKey: available.key, paymentMetadata: snapshot };
}

export async function issuePrivateBluInvoice() {
  const userId = env.BLU_INVOICE_QA_USER_ID;
  const campaign = z.string().uuid().safeParse(env.BLU_QA_INVOICE_CAMPAIGN);
  const encodedHolder = env.BLU_QA_CARD_HOLDER_B64;
  if (!userId || !campaign.success || !encodedHolder) {
    throw new AppError(404, "NOT_FOUND", "Route not found");
  }

  const holder = Buffer.from(encodedHolder, "base64").toString("utf8").trim();
  if (!/^[\p{L}\p{M} .'-]{2,100}$/u.test(holder)) {
    throw new AppError(
      503,
      "BLU_DESTINATION_UNAVAILABLE",
      "The Blu receiving account is unavailable",
    );
  }

  const fixedAmount = env.BLU_QA_AMOUNT_IRR || "10000";
  if (!/^10[0-9]{2}0$/.test(fixedAmount) || Number(fixedAmount) > 10240) {
    throw new AppError(
      503,
      "BLU_QA_AMOUNT_INVALID",
      "The Blu QA amount is outside the pilot range",
    );
  }
  const amount = new Prisma.Decimal(fixedAmount);
  const campaignId = campaign.data.toLowerCase();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"oosta:blu:qa:" + campaignId}))`;
    const profile = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (profile?.role !== "USER") {
      throw new AppError(503, "BLU_QA_PROFILE_UNAVAILABLE", "The Blu QA profile is unavailable");
    }

    const existing = await tx.order.findFirst({
      where: {
        paymentProvider: "CARD_TO_CARD",
        paymentMetadata: { path: ["qaCampaign"], equals: campaignId },
      },
    });
    const order =
      existing ??
      (await tx.order.create({
        data: {
          userId,
          paymentProvider: "CARD_TO_CARD",
          currency: "IRR",
          ...(await reserveBluInvoice(
            tx,
            {
              cardNumber: env.BLU_INVOICE_CARD_NUMBER ?? "",
              cardHolder: holder,
              cardBank: "Blu",
            },
            amount.add(10),
            "IRR",
            campaignId,
          )),
        },
      }));
    const snapshot = readBluInvoice(order.paymentMetadata);
    if (!snapshot?.qaCampaign || order.bluInvoiceKey !== snapshot.iban + ":" + snapshot.amountIrr) {
      throw new AppError(503, "BLU_QA_INVOICE_INVALID", "The saved Blu QA invoice requires review");
    }
    if (
      order.userId !== userId ||
      snapshot.iban !== env.BLU_INVOICE_IBAN ||
      snapshot.number !== env.BLU_INVOICE_CARD_NUMBER
    ) {
      throw new AppError(
        409,
        "BLU_QA_CAMPAIGN_CONFLICT",
        "The Blu QA campaign belongs to a different profile or destination",
      );
    }
    if (!order.totalAmount.eq(amount)) {
      throw new AppError(
        409,
        "BLU_QA_AMOUNT_UNAVAILABLE",
        "The fixed Blu QA amount is unavailable",
      );
    }
    return {
      orderId: order.id,
      amountIrr: Number(order.totalAmount),
      expiresAt: snapshot.expiresAt,
      paymentStatus: order.paymentStatus,
    };
  });
}

// Trusted operator entry point. Its inactive inventory never enters the public catalog.
export async function issueHeldStockQaInvoice(attemptId: string) {
  const campaign = z.string().uuid().safeParse(env.BLU_QA_INVOICE_CAMPAIGN);
  const userId = env.BLU_INVOICE_QA_USER_ID;
  const holder = Buffer.from(env.BLU_QA_CARD_HOLDER_B64 ?? "", "base64")
    .toString("utf8")
    .trim();
  if (!userId || !campaign.success || !/^[\p{L}\p{M} .'-]{2,100}$/u.test(holder))
    throw new AppError(
      503,
      "BLU_QA_PROFILE_UNAVAILABLE",
      "The private checkout configuration is unavailable",
    );
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM supplier_qa_attempts WHERE id=${attemptId} FOR UPDATE`;
    const attempt = await tx.supplierQaAttempt.findUnique({ where: { id: attemptId } });
    const selection = qaSelectionSchema.safeParse(attempt?.selection);
    const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (
      !attempt ||
      attempt.userId !== userId ||
      user?.role !== "USER" ||
      !selection.success ||
      selection.data.holdForCheckout !== true ||
      attempt.currency !== "USD" ||
      !attempt.chargedCost?.eq("0.5") ||
      !["STOCK_READY", "AWAITING_PAYMENT", "DELIVERED"].includes(attempt.state)
    )
      throw new AppError(409, "BLU_QA_STOCK_UNAVAILABLE", "No authorized private stock is ready");
    let order = attempt.orderId
      ? await tx.order.findUnique({ where: { id: attempt.orderId } })
      : null;
    if (!order) {
      const plan = await tx.productPlan.findUnique({
        where: { id: "internal-held-qa-plan-" + attempt.id },
        include: { product: true },
      });
      if (
        !plan ||
        plan.source !== "INTERNAL" ||
        plan.isActive ||
        plan.product.isActive ||
        plan.currency !== "IRR" ||
        !plan.price.eq(10050)
      )
        throw new AppError(
          409,
          "BLU_QA_STOCK_UNAVAILABLE",
          "The private inventory requires review",
        );
      const invoice = await reserveBluInvoice(
        tx,
        {
          cardNumber: env.BLU_INVOICE_CARD_NUMBER ?? "",
          cardHolder: holder,
          cardBank: "Blu",
        },
        plan.price,
        "IRR",
        campaign.data.toLowerCase(),
      );
      if (invoice.totalAmount.lt(10000))
        throw new AppError(
          409,
          "BLU_QA_AMOUNT_UNAVAILABLE",
          "The private test amount is unavailable",
        );
      const created = await tx.order.create({
        data: {
          userId,
          paymentProvider: "CARD_TO_CARD",
          currency: "IRR",
          ...invoice,
          paymentMetadata: { ...invoice.paymentMetadata, stockHeld: true, privateStockQa: true },
          items: {
            create: {
              productId: plan.productId,
              planId: plan.id,
              quantity: 1,
              unitPrice: plan.price,
              lineTotal: plan.price,
              planSnapshot: {
                label: plan.label,
                durationDays: plan.durationDays,
                variant: null,
                source: "INTERNAL",
              },
            },
          },
        },
        include: { items: true },
      });
      await claimAvailableStock(tx, created.items[0], "RESERVED");
      await tx.supplierQaAttempt.update({
        where: { id: attempt.id },
        data: { orderId: created.id, state: "AWAITING_PAYMENT" },
      });
      order = created;
    }
    const snapshot = readBluInvoice(order.paymentMetadata);
    if (
      !snapshot?.privateStockQa ||
      order.userId !== userId ||
      snapshot.qaCampaign !== campaign.data.toLowerCase() ||
      snapshot.iban !== env.BLU_INVOICE_IBAN ||
      snapshot.number !== env.BLU_INVOICE_CARD_NUMBER
    )
      throw new AppError(
        409,
        "BLU_QA_CAMPAIGN_CONFLICT",
        "The saved private order requires review",
      );
    return {
      orderId: order.id,
      amountIrr: Number(order.totalAmount),
      expiresAt: snapshot.expiresAt,
      paymentStatus: order.paymentStatus,
    };
  });
}
