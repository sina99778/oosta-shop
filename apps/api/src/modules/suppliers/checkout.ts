import { Prisma, type SupplierCheckoutQuote } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { lockOrder } from "../../lib/orderLock";
import { authenticate } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { AppError } from "../../utils/httpError";
import { getPaymentProvider, getPaymentProviderForOrder } from "../payments/provider";
import { getGatewayConfig, isOnlinePaymentBlocked } from "../../lib/gatewayConfig";
import { readBluInvoice, reserveBluInvoice } from "../orders/blu-invoice";
import { supplierCardReady } from "./card-checkout";
import {
  processSupplierFulfillment,
  reconcileSupplierFulfillment,
  selectSupplierPurchase,
  type SupplierRegistry,
  supplierSupported,
} from "./fulfillment";
import { reserveWallet, settleWallet } from "./wallet-budget";
import { readVariant, supplierIds, variantKey } from "./variant";

const selectionSchema = z
  .object({
    supplier: z.enum(supplierIds),
    externalId: z.string().min(1).max(120),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    quoteId: z.string().min(1).max(120),
    maximumCost: z
      .string()
      .regex(/^\d{1,12}(\.\d{1,6})?$/)
      .refine((s) => new Prisma.Decimal(s).gt(0)),
    currency: z.enum(["USD", "USDT"]),
  })
  .strict();
const unavailable = () =>
  new AppError(503, "SUPPLIER_PURCHASE_UNSUPPORTED", "Bounded supplier checkout is unavailable");
const expired = () =>
  new AppError(409, "SUPPLIER_QUOTE_EXPIRED", "Request a new price before paying");
function quoteDTO(q: SupplierCheckoutQuote) {
  return {
    id: q.id,
    planId: q.planId,
    amount: Number(q.amount),
    range: { min: Number(q.amount), max: Number(q.amount) },
    currency: "IRR",
    expiresAt: q.expiresAt.toISOString(),
    kind: "FIRM" as const,
    checkoutEnabled: true as const,
  };
}

export function createSupplierCheckout(registry: SupplierRegistry = new Map()) {
  const available = [...registry.values()].some(supplierSupported);
  async function quote(userId: string, planId: string) {
    if (!available) throw unavailable();
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (user?.role !== "USER") throw new AppError(403, "FORBIDDEN", "Customer account required");
    const plan = await prisma.productPlan.findFirst({
      where: { id: planId, isActive: true, source: "SUPPLIER", product: { isActive: true } },
      include: { product: { select: { type: true } } },
    });
    if (!plan) throw new AppError(404, "NOT_FOUND", "Plan not found");
    const variant = readVariant(plan.variant);
    if (
      !variant ||
      variant.delivery !== "AUTOMATIC" ||
      !["ACCOUNT", "CODE"].includes(variant.fulfillment)
    )
      throw unavailable();
    const selected = await selectSupplierPurchase(
      { ...plan, productType: plan.product.type },
      registry,
    );
    const gateway = await getGatewayConfig();
    const methods = {
      online:
        !(env.isProduction && gateway.provider === "mock") && !isOnlinePaymentBlocked(gateway),
      cardToCard: supplierCardReady(gateway) && selected.expiry - Date.now() >= 300000,
    };
    if (!methods.online && !methods.cardToCard)
      throw new AppError(503, "METHOD_UNAVAILABLE", "No safe payment method is available");
    const saved = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      if (
        (await tx.user.findUnique({ where: { id: userId }, select: { role: true } }))?.role !==
        "USER"
      )
        throw new AppError(403, "FORBIDDEN", "Customer account required");
      const open = await tx.supplierCheckoutQuote.count({
        where: { userId, orderId: null, expiresAt: { gt: new Date() } },
      });
      if (open >= 5)
        throw new AppError(429, "QUOTE_LIMIT", "Use or wait for an existing quote to expire");
      return tx.supplierCheckoutQuote.create({
        data: {
          userId,
          planId,
          signature: selected.signature,
          amount: selected.price,
          expiresAt: new Date(selected.expiry),
          selection: {
            supplier: selected.offer.supplier,
            externalId: selected.offer.externalId,
            fingerprint: selected.offer.fingerprint,
            quoteId: selected.quote.quoteId,
            maximumCost: selected.quote.cost,
            currency: selected.quote.currency,
          },
          snapshot: {
            source: "SUPPLIER",
            label: plan.label,
            variant,
            durationDays: plan.durationDays,
          },
        },
      });
    });
    return { ...quoteDTO(saved), methods, fx: selected.fx };
  }
  async function response(orderId: string) {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const metadata = order.paymentMetadata as Record<string, Prisma.JsonValue> | null;
    const summary = {
      order: {
        id: order.id,
        totalAmount: Number(order.totalAmount),
        currency: order.currency,
        paymentStatus: order.paymentStatus,
      },
    };
    if (order.paidAt) return summary;
    if (order.paymentProvider === "CARD_TO_CARD") {
      const invoice = readBluInvoice(order.paymentMetadata);
      if (!invoice?.supplierCheckout || Date.parse(invoice.expiresAt) <= Date.now())
        throw expired();
      return {
        ...summary,
        cardToCard: {
          number: invoice.number,
          holder: invoice.holder,
          bank: invoice.bank,
          amount: Number(order.totalAmount),
          currency: order.currency,
        },
      };
    }
    if (!order.paymentAuthority && order.paymentStatus === "FAILED")
      throw new AppError(
        502,
        "PAYMENT_INITIALIZATION_FAILED",
        "Request a new quote; no supplier purchase was sent",
      );
    if (!order.paymentAuthority || typeof metadata?.redirectUrl !== "string")
      throw new AppError(
        409,
        "PAYMENT_INITIALIZING",
        "Payment is still initializing; retry the same quote",
      );
    return {
      ...summary,
      payment: { authority: order.paymentAuthority, redirectUrl: metadata.redirectUrl },
    };
  }
  async function create(
    userId: string,
    quoteId: string,
    method: "online" | "card_to_card" = "online",
  ) {
    if (!available) throw unavailable();
    const provider = method === "online" ? await getPaymentProvider() : null;
    const gateway = method === "card_to_card" ? await getGatewayConfig() : null;
    const reserved = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM supplier_checkout_quotes WHERE id = ${quoteId} FOR UPDATE`;
      const q = await tx.supplierCheckoutQuote.findFirst({
        where: { id: quoteId, userId },
        include: {
          plan: { include: { product: { select: { isActive: true } } } },
          user: { select: { role: true } },
        },
      });
      if (!q) throw new AppError(404, "NOT_FOUND", "Quote not found");
      if (q.user.role !== "USER") throw new AppError(403, "FORBIDDEN", "Customer account required");
      if (q.orderId) {
        const existing = await tx.order.findUniqueOrThrow({
          where: { id: q.orderId },
          select: { paidAt: true, paymentProvider: true },
        });
        if ((method === "card_to_card") !== (existing.paymentProvider === "CARD_TO_CARD"))
          throw new AppError(409, "QUOTE_ALREADY_USED", "This quote already has a payment method");
        if (!existing.paidAt && q.expiresAt.getTime() <= Date.now()) throw expired();
        return { id: q.orderId, created: false };
      }
      if (q.expiresAt.getTime() <= Date.now()) throw expired();
      const variant = readVariant(q.plan.variant);
      if (
        !variant ||
        q.plan.source !== "SUPPLIER" ||
        !q.plan.isActive ||
        !q.plan.product.isActive ||
        variantKey(variant, q.plan.durationDays) !== q.signature
      )
        throw expired();
      const selected = selectionSchema.parse(q.selection);
      const adapter = registry.get(selected.supplier);
      if (!supplierSupported(adapter)) throw unavailable();
      let invoice: Awaited<ReturnType<typeof reserveBluInvoice>> | null = null;
      if (method === "card_to_card") {
        if (!gateway || !supplierCardReady(gateway) || q.expiresAt.getTime() - Date.now() < 60000)
          throw new AppError(
            409,
            "SUPPLIER_QUOTE_EXPIRED",
            "Request a fresh price before transferring",
          );
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
        if (
          await tx.order.count({
            where: {
              userId,
              paymentProvider: "CARD_TO_CARD",
              paymentStatus: { in: ["PENDING", "PENDING_REVIEW", "REJECTED"] },
              supplierCheckoutQuote: { isNot: null },
              OR: [
                { supplierCheckoutQuote: { expiresAt: { gt: new Date() } } },
                { bluBankClaim: { isNot: null } },
              ],
            },
          })
        )
          throw new AppError(
            409,
            "BLU_STOCK_ORDER_OPEN",
            "An existing card invoice is awaiting payment",
          );
        invoice = await reserveBluInvoice(tx, gateway, q.amount, "IRR");
      }
      const amount = invoice?.totalAmount ?? q.amount;
      const order = await tx.order.create({
        data: {
          userId,
          totalAmount: amount,
          currency: "IRR",
          paymentStatus: "PENDING",
          paymentProvider: method === "card_to_card" ? "CARD_TO_CARD" : provider!.name,
          ...(invoice ? { bluInvoiceKey: invoice.bluInvoiceKey } : {}),
          paymentMetadata: invoice
            ? {
                ...invoice.paymentMetadata,
                supplierCheckout: true,
                expiresAt: q.expiresAt.toISOString(),
              }
            : { purpose: "SUPPLIER_CHECKOUT", quoteId: q.id },
          items: {
            create: {
              productId: q.plan.productId,
              planId: q.planId,
              quantity: 1,
              unitPrice: amount,
              lineTotal: amount,
              planSnapshot: q.snapshot as Prisma.InputJsonValue,
            },
          },
          supplierFulfillment: {
            create: {
              reference: "oosta-checkout-" + q.id,
              supplier: selected.supplier,
              externalId: selected.externalId,
              variantKey: q.signature,
              fingerprint: selected.fingerprint,
              quoteId: selected.quoteId,
              maximumCost: selected.maximumCost,
              currency: selected.currency,
              expiresAt: q.expiresAt,
              state: "AWAITING_PAYMENT",
            },
          },
        },
      });
      await tx.supplierCheckoutQuote.update({ where: { id: q.id }, data: { orderId: order.id } });
      if (adapter.capabilities.walletExposure) {
        const job = await tx.supplierFulfillment.findUniqueOrThrow({
          where: { orderId: order.id },
        });
        await reserveWallet(tx, job);
      }
      return { id: order.id, created: true };
    });
    if (!reserved.created || method === "card_to_card") return response(reserved.id);
    if (!provider) throw unavailable();
    const order = await prisma.order.findUniqueOrThrow({ where: { id: reserved.id } });
    try {
      const payment = await provider.createPayment({
        orderId: order.id,
        amount: Number(order.totalAmount),
        currency: order.currency,
        description: "Oosta order " + order.id,
        callbackUrl: env.WEB_BASE_URL + "/checkout/callback",
      });
      if (payment.provider !== provider.name) throw new Error("Provider identity mismatch");
      const url = new URL(payment.redirectUrl);
      if (!["https:", ...(!env.isProduction ? ["http:"] : [])].includes(url.protocol))
        throw new Error("Invalid payment redirect");
      await prisma.order.update({
        where: { id: order.id },
        data: {
          paymentAuthority: payment.authority,
          paymentMetadata: {
            purpose: "SUPPLIER_CHECKOUT",
            quoteId,
            redirectUrl: payment.redirectUrl,
            verificationContext: (payment.verificationContext ?? null) as Prisma.InputJsonValue,
          },
        },
      });
    } catch {
      await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "FAILED" } });
      throw new AppError(
        502,
        "PAYMENT_INITIALIZATION_FAILED",
        "Payment could not be initialized; no supplier purchase was sent",
      );
    }
    return response(order.id);
  }
  async function recover(orderId: string) {
    const job = await prisma.supplierFulfillment.findUnique({ where: { orderId } });
    if (!job) return;
    try {
      if (job.state === "READY") await processSupplierFulfillment(job.id, registry);
      else if (["SENDING", "PENDING", "UNCERTAIN"].includes(job.state))
        await reconcileSupplierFulfillment(job.id, registry);
    } catch {
      console.error("[supplier-checkout] recovery pending", job.id);
    } finally {
      // A failed lookup must move behind other paid jobs instead of monopolizing the batch.
      try {
        await prisma.supplierFulfillment.updateMany({
          where: { id: job.id, state: { in: ["READY", "SENDING", "PENDING", "UNCERTAIN"] } },
          data: { updatedAt: new Date() },
        });
      } catch {
        console.error("[supplier-checkout] recovery attempt not recorded", job.id);
      }
    }
  }
  async function verify(authority: string, status: string) {
    const initial = await prisma.order.findUnique({
      where: { paymentAuthority: authority },
      include: { supplierCheckoutQuote: { select: { id: true } } },
    });
    if (!initial?.supplierCheckoutQuote) return null;
    const result = async () => {
      const current = await prisma.order.findUniqueOrThrow({ where: { id: initial.id } });
      return {
        status:
          current.paymentStatus === "PAID"
            ? ("paid" as const)
            : current.paidAt
              ? ("pending" as const)
              : ("failed" as const),
        orderId: current.id,
      };
    };
    if (initial.paymentStatus === "PAID") return result();
    if (["REFUNDED", "EXPIRED"].includes(initial.paymentStatus))
      throw new AppError(409, "ORDER_CLOSED", "Order is closed");
    if (initial.paymentStatus === "PAID_PENDING_FULFILLMENT" && initial.paidAt) {
      await recover(initial.id);
      return result();
    }
    const context = initial.paymentMetadata as Record<string, Prisma.JsonValue> | null;
    const verified =
      status === "OK"
        ? await getPaymentProviderForOrder(initial.paymentProvider).verifyPayment({
            authority,
            amount: Number(initial.totalAmount),
            currency: initial.currency,
            verificationContext: context?.verificationContext,
          })
        : { success: false, refId: null };
    await prisma.$transaction(async (tx) => {
      await lockOrder(tx, initial.id);
      const current = await tx.order.findUniqueOrThrow({ where: { id: initial.id } });
      if (current.paidAt || ["PAID", "REFUNDED", "EXPIRED"].includes(current.paymentStatus)) return;
      if (!verified.success || !verified.refId) {
        await tx.order.update({ where: { id: current.id }, data: { paymentStatus: "FAILED" } });
        return;
      }
      await tx.order.update({
        where: { id: current.id },
        data: {
          paymentStatus: "PAID_PENDING_FULFILLMENT",
          paidAt: new Date(),
          paymentRefId: verified.refId,
        },
      });
      await tx.supplierFulfillment.updateMany({
        where: { orderId: current.id, state: "AWAITING_PAYMENT" },
        data: { state: "READY" },
      });
    });
    await recover(initial.id);
    return result();
  }
  async function sweep() {
    if (!available) return 0;
    const abandoned = await prisma.supplierFulfillment.findMany({
      where: {
        state: "AWAITING_PAYMENT",
        walletExposure: { not: null },
        expiresAt: { lte: new Date() },
      },
      select: { id: true, orderId: true },
      take: 20,
    });
    for (const row of abandoned)
      await prisma.$transaction(async (tx) => {
        await lockOrder(tx, row.orderId);
        const job = await tx.supplierFulfillment.findUniqueOrThrow({ where: { id: row.id } });
        const order = await tx.order.findUniqueOrThrow({
          where: { id: row.orderId },
          include: { bluBankClaim: true },
        });
        if (job.state !== "AWAITING_PAYMENT" || order.paidAt || order.bluBankClaim) return;
        if (
          order.bluInvoiceKey &&
          (await tx.bluBankObservation.findFirst({
            where: {
              invoiceKey: order.bluInvoiceKey,
              occurredAt: { gte: order.createdAt, lt: job.expiresAt },
            },
            select: { transactionDigest: true },
          }))
        )
          return;
        await settleWallet(tx, job, "0");
        await tx.supplierFulfillment.update({
          where: { id: job.id },
          data: { state: "NO_CHARGE" },
        });
      });
    const jobs = await prisma.supplierFulfillment.findMany({
      where: {
        state: { in: ["READY", "SENDING", "PENDING", "UNCERTAIN"] },
        order: {
          paymentStatus: "PAID_PENDING_FULFILLMENT",
          paidAt: { not: null },
          supplierCheckoutQuote: { isNot: null },
        },
      },
      select: { orderId: true },
      orderBy: { updatedAt: "asc" },
      take: 5,
    });
    for (const job of jobs) await recover(job.orderId);
    return jobs.length;
  }
  function start() {
    if (!available) return () => {};
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        await sweep();
      } catch {
        console.error("[supplier-checkout] sweep pending");
      } finally {
        running = false;
      }
    };
    void run();
    const timer = setInterval(() => {
      void run();
    }, 15000);
    timer.unref();
    return () => clearInterval(timer);
  }
  return { available, quote, create, verify, sweep, start };
}
export type SupplierCheckout = ReturnType<typeof createSupplierCheckout>;
export function supplierCheckoutRouter(checkout: SupplierCheckout) {
  const router = Router();
  router.use(authenticate);
  router.post(
    "/quotes",
    validate({
      body: z
        .object({ planId: z.string().min(1).max(100), quantity: z.literal(1).optional() })
        .strict(),
    }),
    async (req, res) =>
      res.status(201).json({ quote: await checkout.quote(req.user!.id, req.body.planId) }),
  );
  router.post(
    "/orders",
    validate({
      body: z
        .object({
          quoteId: z.string().min(1).max(100),
          method: z.enum(["online", "card_to_card"]).default("online"),
        })
        .strict(),
    }),
    async (req, res) =>
      res.status(201).json(await checkout.create(req.user!.id, req.body.quoteId, req.body.method)),
  );
  return router;
}
