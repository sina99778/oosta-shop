import type { SupplierId } from "./catalog";
import { randomUUID } from "node:crypto";
import { Prisma, type SupplierFulfillment } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { lockOrder } from "../../lib/orderLock";
import { AppError } from "../../utils/httpError";
import { catalogs, getPricing, matchingOffers } from "./suppliers.service";
import { quotePricing } from "./fx.service";
import { indicativePrice } from "./pricing";
import { readVariant, variantKey } from "./variant";

type PurchaseInput = {
  reference: string;
  externalId: string;
  quantity: 1;
  quoteId: string;
  maximumCost: string;
  currency: "USD" | "USDT";
};
export type SupplierAdapter = {
  capabilities: { priceCeiling: boolean; idempotency: boolean; lookup: boolean };
  quote(input: Omit<PurchaseInput, "reference" | "quoteId">): Promise<unknown>;
  purchase(input: PurchaseInput): Promise<unknown>;
  lookup(input: {
    reference: string;
    externalId: string;
    supplierOrderId?: string;
  }): Promise<unknown>;
};
// No current vendor contract establishes all three guarantees. Only trusted internal callers
// may supply an adapter; no HTTP body, setting or test switch can register one.
type Registry = ReadonlyMap<SupplierId, SupplierAdapter>;
const live: Registry = new Map();
const supported = (a: SupplierAdapter | undefined): a is SupplierAdapter =>
  !!a &&
  a.capabilities.priceCeiling === true &&
  a.capabilities.idempotency === true &&
  a.capabilities.lookup === true;
const positive = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,6})?$/)
  .refine((s) => new Prisma.Decimal(s).gt(0));
const identifier = z.string().min(1).max(120);
const quoteSchema = z
  .object({
    quoteId: identifier,
    externalId: identifier,
    quantity: z.literal(1),
    currency: z.enum(["USD", "USDT"]),
    cost: positive,
    expiresAt: z.iso.datetime(),
  })
  .strict();
const credentialSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("ACCOUNT"),
      accountEmail: z.string().min(1).max(1000),
      accountPassword: z.string().min(1).max(10000),
    })
    .strict(),
  z.object({ type: z.literal("LICENSE"), licenseKey: z.string().min(1).max(10000) }).strict(),
  z.object({ type: z.literal("GIFTCARD"), giftCardCode: z.string().min(1).max(10000) }).strict(),
]);
const identity = { reference: identifier, externalId: identifier };
const paid = {
  ...identity,
  quantity: z.literal(1),
  currency: z.enum(["USD", "USDT"]),
  amount: positive,
  supplierOrderId: identifier,
};
const resultSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("COMPLETE"), ...paid, credential: credentialSchema }).strict(),
  z.object({ state: z.literal("PENDING"), ...paid }).strict(),
  z.object({ state: z.literal("NO_CHARGE"), ...identity }).strict(),
  z.object({ state: z.literal("NOT_FOUND") }).strict(),
]);
function summary(job: SupplierFulfillment) {
  return { id: job.id, state: job.state, chargedCost: job.chargedCost?.toString() ?? null };
}
function denied() {
  return new AppError(409, "SUPPLIER_ORDER_INELIGIBLE", "Paid supplier order requires review");
}
async function eligible(tx: Pick<Prisma.TransactionClient, "order">, orderId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { role: true } },
      items: {
        include: {
          plan: true,
          product: { select: { type: true, isActive: true } },
          fulfilledItems: { select: { id: true } },
        },
      },
    },
  });
  if (
    !order ||
    order.paymentStatus !== "PAID_PENDING_FULFILLMENT" ||
    !order.paidAt ||
    !order.paymentRefId?.trim() ||
    order.user.role !== "USER" ||
    order.currency !== "IRR" ||
    order.items.length !== 1
  )
    throw denied();
  const item = order.items[0],
    variant = readVariant(item.plan.variant);
  const snapshot =
    item.planSnapshot && typeof item.planSnapshot === "object" && !Array.isArray(item.planSnapshot)
      ? item.planSnapshot
      : null;
  const previous = readVariant(snapshot?.variant);
  if (
    item.quantity !== 1 ||
    item.fulfilledItems.length ||
    !item.product.isActive ||
    !item.plan.isActive ||
    item.plan.source !== "SUPPLIER" ||
    !variant ||
    !previous ||
    variant.delivery !== "AUTOMATIC" ||
    !["ACCOUNT", "CODE"].includes(variant.fulfillment) ||
    snapshot?.source !== "SUPPLIER" ||
    variantKey(variant, item.plan.durationDays) !==
      variantKey(
        previous,
        typeof snapshot?.durationDays === "number" ? snapshot.durationDays : null,
      ) ||
    !item.unitPrice.eq(item.lineTotal) ||
    !item.lineTotal.eq(order.totalAmount) ||
    order.totalAmount.lte(0)
  )
    throw denied();
  return { order, item, signature: variantKey(variant, item.plan.durationDays) };
}

export async function prepareSupplierFulfillment(orderId: string, registry: Registry = live) {
  const previous = await prisma.supplierFulfillment.findUnique({ where: { orderId } });
  if (previous) return summary(previous);
  const initial = await eligible(prisma, orderId);
  const policy = await getPricing();
  if (!policy?.enabled)
    throw new AppError(503, "PRICING_UNAVAILABLE", "Fresh supplier pricing required");
  const resolved = await quotePricing(policy);
  const candidates = matchingOffers(initial.item.plan, await catalogs())
    .flatMap((candidate) => {
      if (!supported(registry.get(candidate.offer.supplier))) return [];
      try {
        const price = indicativePrice(
          candidate.offer.cost,
          candidate.offer.currency,
          resolved.policy,
        );
        return [{ ...candidate, price }];
      } catch (error) {
        if (error instanceof AppError && error.code === "PRICING_UNAVAILABLE") return [];
        throw error;
      }
    })
    .sort((a, b) => a.price.cmp(b.price) || a.offer.supplier.localeCompare(b.offer.supplier));
  const locked: Array<{
    offer: (typeof candidates)[number]["offer"];
    quote: z.infer<typeof quoteSchema>;
    expiry: number;
    price: Prisma.Decimal;
  }> = [];
  for (const candidate of candidates) {
    const { offer } = candidate,
      adapter = registry.get(offer.supplier)!;
    let quote: z.infer<typeof quoteSchema>;
    try {
      quote = quoteSchema.parse(
        await adapter.quote({
          externalId: offer.externalId,
          quantity: 1,
          maximumCost: offer.cost,
          currency: offer.currency,
        }),
      );
    } catch {
      continue;
    }
    const expiry = Math.min(
      Date.parse(quote.expiresAt),
      candidate.expiresAt,
      resolved.rateExpiresAt,
      Date.now() + 60000,
    );
    if (
      quote.externalId !== offer.externalId ||
      quote.currency !== offer.currency ||
      new Prisma.Decimal(quote.cost).gt(offer.cost) ||
      expiry <= Date.now()
    )
      continue;
    locked.push({
      offer,
      quote,
      expiry,
      price: indicativePrice(quote.cost, quote.currency, resolved.policy),
    });
  }
  const selected = locked
    .filter((q) => q.expiry > Date.now() && q.price.lte(initial.order.totalAmount))
    .sort((a, b) => a.price.cmp(b.price) || a.offer.supplier.localeCompare(b.offer.supplier))[0];
  if (!selected)
    throw new AppError(
      503,
      "SUPPLIER_PURCHASE_UNSUPPORTED",
      "No bounded matching supplier purchase is available",
    );
  const { offer, quote, expiry } = selected;
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const existing = await tx.supplierFulfillment.findUnique({ where: { orderId } });
    if (existing) return summary(existing);
    const current = await eligible(tx, orderId);
    if (
      expiry <= Date.now() ||
      current.item.id !== initial.item.id ||
      current.item.planId !== initial.item.planId ||
      current.signature !== initial.signature ||
      !current.order.totalAmount.eq(initial.order.totalAmount)
    )
      throw denied();
    return summary(
      await tx.supplierFulfillment.create({
        data: {
          orderId,
          reference: "oosta-supplier-" + randomUUID(),
          supplier: offer.supplier,
          externalId: offer.externalId,
          variantKey: current.signature,
          fingerprint: offer.fingerprint,
          quoteId: quote.quoteId,
          maximumCost: quote.cost,
          currency: quote.currency,
          expiresAt: new Date(expiry),
        },
      }),
    );
  });
}

async function applyResult(id: string, raw: unknown) {
  const found = await prisma.supplierFulfillment.findUniqueOrThrow({ where: { id } });
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, found.orderId);
    const job = await tx.supplierFulfillment.findUniqueOrThrow({ where: { id } });
    if (!["SENDING", "PENDING", "UNCERTAIN"].includes(job.state)) return summary(job);
    const parsed = resultSchema.safeParse(raw);
    if (!parsed.success)
      return summary(
        await tx.supplierFulfillment.update({ where: { id }, data: { state: "REVIEW" } }),
      );
    const result = parsed.data;
    if (result.state === "NOT_FOUND")
      return summary(
        await tx.supplierFulfillment.update({ where: { id }, data: { state: "UNCERTAIN" } }),
      );
    if (result.reference !== job.reference || result.externalId !== job.externalId)
      return summary(
        await tx.supplierFulfillment.update({ where: { id }, data: { state: "REVIEW" } }),
      );
    if (result.state === "NO_CHARGE") {
      // Once an earlier response reported a debit, a later rejection cannot erase it.
      return summary(
        await tx.supplierFulfillment.update({
          where: { id },
          data: { state: job.chargedCost ? "REVIEW" : "NO_CHARGE" },
        }),
      );
    }
    const data = {
      chargedCost: result.amount,
      supplierOrderId: result.supplierOrderId,
      result: result as Prisma.InputJsonValue,
    };
    if (
      result.currency !== job.currency ||
      new Prisma.Decimal(result.amount).gt(job.maximumCost) ||
      (job.supplierOrderId && job.supplierOrderId !== result.supplierOrderId) ||
      (job.chargedCost && !job.chargedCost.eq(result.amount))
    )
      return summary(
        await tx.supplierFulfillment.update({
          where: { id },
          data: { state: "REVIEW", result: result as Prisma.InputJsonValue },
        }),
      );
    let current: Awaited<ReturnType<typeof eligible>>;
    try {
      current = await eligible(tx, job.orderId);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      return summary(
        await tx.supplierFulfillment.update({ where: { id }, data: { ...data, state: "REVIEW" } }),
      );
    }
    if (
      current.signature !== job.variantKey ||
      (result.state === "COMPLETE" && result.credential.type !== current.item.product.type)
    )
      return summary(
        await tx.supplierFulfillment.update({ where: { id }, data: { ...data, state: "REVIEW" } }),
      );
    if (result.state === "PENDING")
      return summary(
        await tx.supplierFulfillment.update({ where: { id }, data: { ...data, state: "PENDING" } }),
      );
    const { type, ...payload } = result.credential;
    await tx.inventoryItem.create({
      data: {
        type,
        ...payload,
        productId: current.item.productId,
        planId: current.item.planId,
        orderItemId: current.item.id,
        status: "SOLD",
        soldAt: new Date(),
      },
    });
    await tx.order.update({ where: { id: job.orderId }, data: { paymentStatus: "PAID" } });
    return summary(
      await tx.supplierFulfillment.update({ where: { id }, data: { ...data, state: "DELIVERED" } }),
    );
  });
}

export async function processSupplierFulfillment(id: string, registry: Registry = live) {
  const found = await prisma.supplierFulfillment.findUniqueOrThrow({ where: { id } });
  const reservation = await prisma.$transaction(async (tx) => {
    await lockOrder(tx, found.orderId);
    const job = await tx.supplierFulfillment.findUniqueOrThrow({ where: { id } });
    if (job.state !== "READY") return { job, send: false };
    if (!supported(registry.get(job.supplier as SupplierId)))
      throw new AppError(503, "SUPPLIER_PURCHASE_UNSUPPORTED", "Bounded supplier adapter required");
    let valid = job.expiresAt.getTime() > Date.now();
    try {
      const current = await eligible(tx, job.orderId);
      valid =
        valid &&
        current.signature === job.variantKey &&
        matchingOffers(current.item.plan, await catalogs(tx)).some(
          ({ offer }) =>
            offer.supplier === job.supplier &&
            offer.externalId === job.externalId &&
            offer.fingerprint === job.fingerprint,
        );
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      valid = false;
    }
    if (!valid)
      return {
        job: await tx.supplierFulfillment.update({ where: { id }, data: { state: "REVIEW" } }),
        send: false,
      };
    return {
      job: await tx.supplierFulfillment.update({ where: { id }, data: { state: "SENDING" } }),
      send: true,
    };
  });
  if (!reservation.send) return summary(reservation.job);
  const job = reservation.job;
  let response: unknown;
  try {
    response = await registry.get(job.supplier as SupplierId)!.purchase({
      reference: job.reference,
      externalId: job.externalId,
      quantity: 1,
      quoteId: job.quoteId,
      maximumCost: job.maximumCost.toString(),
      currency: job.currency as "USD" | "USDT",
    });
  } catch {
    return applyResult(id, { state: "NOT_FOUND" });
  }
  return applyResult(id, response);
}

export async function reconcileSupplierFulfillment(id: string, registry: Registry = live) {
  const job = await prisma.supplierFulfillment.findUniqueOrThrow({ where: { id } });
  if (!["SENDING", "PENDING", "UNCERTAIN"].includes(job.state)) return summary(job);
  const adapter = registry.get(job.supplier as SupplierId);
  if (!supported(adapter))
    throw new AppError(503, "SUPPLIER_PURCHASE_UNSUPPORTED", "Supplier lookup unavailable");
  let response: unknown;
  try {
    response = await adapter.lookup({
      reference: job.reference,
      externalId: job.externalId,
      ...(job.supplierOrderId ? { supplierOrderId: job.supplierOrderId } : {}),
    });
  } catch {
    return summary(job);
  }
  return applyResult(id, response);
}
