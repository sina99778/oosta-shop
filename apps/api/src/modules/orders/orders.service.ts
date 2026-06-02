// Orders + the instant-delivery engine.
//
// Overselling is prevented by claiming inventory atomically at delivery time inside
// a single transaction using `SELECT ... FOR UPDATE SKIP LOCKED`: two concurrent paid
// orders can never be assigned the same unit. Delivery is idempotent (re-verifying a
// PAID order is a no-op).

import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { AppError } from "../../utils/httpError";
import { getPaymentProvider } from "../payments/provider";
import type { CreateOrderInput } from "./orders.schemas";

type OrderWithItems = Prisma.OrderGetPayload<{
  include: {
    items: { include: { product: true; plan: true; fulfilledItems: true } };
    receipts: true;
  };
}>;
type FulfilledItem = OrderWithItems["items"][number]["fulfilledItems"][number];

// Destination card shown to the buyer for a manual card-to-card transfer.
function cardToCardInfo() {
  return {
    number: env.CARD_NUMBER ?? "",
    holder: env.CARD_HOLDER ?? "",
    bank: env.CARD_BANK ?? "",
  };
}

function credentialOf(item: FulfilledItem) {
  return {
    id: item.id,
    type: item.type,
    accountEmail: item.accountEmail,
    accountPassword: item.accountPassword,
    licenseKey: item.licenseKey,
    giftCardCode: item.giftCardCode,
  };
}

function serializeOrderDetail(order: OrderWithItems) {
  const paid = order.paymentStatus === "PAID";
  return {
    id: order.id,
    totalAmount: Number(order.totalAmount),
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    paymentProvider: order.paymentProvider,
    paymentRefId: order.paymentRefId,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    items: order.items.map((item) => ({
      id: item.id,
      product: {
        id: item.product.id,
        name: item.product.name,
        slug: item.product.slug,
        type: item.product.type,
      },
      plan: { id: item.plan.id, label: item.plan.label },
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
      // The account vault: delivered credentials, exposed only for paid orders.
      credentials: paid ? item.fulfilledItems.map(credentialOf) : [],
    })),
    // Card-to-card receipts the buyer uploaded (metadata only — image fetched separately).
    receipts: order.receipts.map((r) => ({
      id: r.id,
      status: r.status,
      reference: r.reference,
      reviewerNote: r.reviewerNote,
      createdAt: r.createdAt,
      reviewedAt: r.reviewedAt,
    })),
    // For an unpaid card-to-card order, surface the destination card so the buyer can pay.
    cardToCard:
      order.paymentProvider === "CARD_TO_CARD" && order.paymentStatus !== "PAID"
        ? cardToCardInfo()
        : null,
  };
}

export async function createOrder(userId: string, input: CreateOrderInput) {
  const planIds = [...new Set(input.items.map((i) => i.planId))];
  const plans = await prisma.productPlan.findMany({
    where: { id: { in: planIds }, isActive: true },
    include: { product: true },
  });
  const planMap = new Map(plans.map((p) => [p.id, p]));

  for (const item of input.items) {
    const plan = planMap.get(item.planId);
    if (!plan || !plan.product.isActive) {
      throw new AppError(404, "NOT_FOUND", `Plan not found: ${item.planId}`);
    }
  }

  // Best-effort stock pre-check; the authoritative claim is atomic at delivery time.
  const availRows = await prisma.inventoryItem.groupBy({
    by: ["planId"],
    where: { status: "AVAILABLE", planId: { in: planIds } },
    _count: { _all: true },
  });
  const availMap = new Map(availRows.map((r) => [r.planId, r._count._all]));
  const requested = new Map<string, number>();
  for (const item of input.items) {
    requested.set(item.planId, (requested.get(item.planId) ?? 0) + item.quantity);
  }
  for (const [planId, qty] of requested) {
    if ((availMap.get(planId) ?? 0) < qty) {
      const plan = planMap.get(planId)!;
      throw new AppError(
        409,
        "OUT_OF_STOCK",
        `Insufficient stock for ${plan.product.name} — ${plan.label}`,
      );
    }
  }

  const currency = plans[0]?.currency ?? env.ZARINPAL_CURRENCY;
  let total = new Prisma.Decimal(0);
  const itemsData = input.items.map((item) => {
    const plan = planMap.get(item.planId)!;
    const lineTotal = plan.price.mul(item.quantity);
    total = total.add(lineTotal);
    return {
      productId: plan.productId,
      planId: plan.id,
      quantity: item.quantity,
      unitPrice: plan.price,
      lineTotal,
    };
  });

  // --- Card-to-card: create a PENDING order and return the destination card. -----
  // No gateway is involved; the buyer transfers manually then uploads a receipt.
  if (input.method === "card_to_card") {
    if (!env.CARD_TO_CARD_ENABLED) {
      throw new AppError(400, "METHOD_UNAVAILABLE", "Card-to-card payment is not available");
    }
    const order = await prisma.order.create({
      data: {
        userId,
        totalAmount: total,
        currency,
        paymentStatus: "PENDING",
        paymentProvider: "CARD_TO_CARD",
        items: { create: itemsData },
      },
    });
    return {
      order: {
        id: order.id,
        totalAmount: Number(total),
        currency,
        paymentStatus: order.paymentStatus,
      },
      cardToCard: { ...cardToCardInfo(), amount: Number(total), currency },
    };
  }

  // --- Online: open a payment-gateway session and return the redirect URL. -------
  const provider = getPaymentProvider();
  const order = await prisma.order.create({
    data: {
      userId,
      totalAmount: total,
      currency,
      paymentStatus: "PENDING",
      paymentProvider: provider.name,
      items: { create: itemsData },
    },
  });

  const payment = await provider.createPayment({
    orderId: order.id,
    amount: Number(total),
    description: `Order ${order.id}`,
    callbackUrl: `${env.WEB_BASE_URL}/checkout/callback`,
  });

  await prisma.order.update({
    where: { id: order.id },
    data: { paymentAuthority: payment.authority },
  });

  return {
    order: {
      id: order.id,
      totalAmount: Number(total),
      currency,
      paymentStatus: order.paymentStatus,
    },
    payment: { authority: payment.authority, redirectUrl: payment.redirectUrl },
  };
}

export async function deliverOrder(orderId: string, refId: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new AppError(404, "NOT_FOUND", "Order not found");
    if (order.paymentStatus === "PAID") return; // idempotent

    for (const item of order.items) {
      // Lock and claim available units; SKIP LOCKED makes concurrent claims race-safe.
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM inventory_items
        WHERE "planId" = ${item.planId} AND status = 'AVAILABLE'
        ORDER BY "createdAt" ASC
        LIMIT ${item.quantity}
        FOR UPDATE SKIP LOCKED`;
      if (rows.length < item.quantity) {
        throw new AppError(409, "OUT_OF_STOCK", "Items went out of stock during fulfillment");
      }
      await tx.inventoryItem.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { status: "SOLD", orderItemId: item.id, soldAt: new Date() },
      });
    }

    await tx.order.update({
      where: { id: orderId },
      data: { paymentStatus: "PAID", paidAt: new Date(), paymentRefId: refId },
    });
  });
}

export async function verifyAndDeliver(authority: string, status: string) {
  const order = await prisma.order.findUnique({ where: { paymentAuthority: authority } });
  if (!order) throw new AppError(404, "NOT_FOUND", "No order found for this payment");

  if (order.paymentStatus === "PAID") {
    return { status: "paid" as const, order: await getOrderDetail(order.userId, order.id) };
  }

  if (status !== "OK") {
    await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "FAILED" } });
    return { status: "failed" as const };
  }

  const provider = getPaymentProvider();
  const verification = await provider.verifyPayment({
    authority,
    amount: Number(order.totalAmount),
  });
  if (!verification.success) {
    await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "FAILED" } });
    return { status: "failed" as const };
  }

  try {
    await deliverOrder(order.id, verification.refId);
  } catch (error) {
    if (error instanceof AppError && error.code === "OUT_OF_STOCK") {
      await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "FAILED" } });
      // A real gateway would trigger a refund here.
      throw new AppError(
        409,
        "OUT_OF_STOCK",
        "Payment captured but stock was exhausted; order failed and must be refunded",
      );
    }
    throw error;
  }

  return { status: "paid" as const, order: await getOrderDetail(order.userId, order.id) };
}

export async function listOrders(userId: string) {
  const orders = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { items: true } } },
  });
  return orders.map((order) => ({
    id: order.id,
    totalAmount: Number(order.totalAmount),
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    itemCount: order._count.items,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
  }));
}

export async function getOrderDetail(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: {
      items: { include: { product: true, plan: true, fulfilledItems: true } },
      receipts: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!order) throw new AppError(404, "NOT_FOUND", "Order not found");
  return serializeOrderDetail(order);
}

// Buyer uploads a card-to-card transfer receipt. The image is stored in the DB so it
// is included in backups and is NEVER deleted. The order moves to PENDING_REVIEW.
const ALLOWED_RECEIPT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

export async function uploadReceipt(
  userId: string,
  orderId: string,
  file: { buffer: Buffer; mimetype: string } | undefined,
  reference?: string,
) {
  if (!file) throw new AppError(400, "NO_FILE", "A receipt image is required");
  if (!ALLOWED_RECEIPT_TYPES.has(file.mimetype)) {
    throw new AppError(400, "BAD_FILE_TYPE", "Receipt must be an image (JPG/PNG/WebP) or PDF");
  }

  const order = await prisma.order.findFirst({ where: { id: orderId, userId } });
  if (!order) throw new AppError(404, "NOT_FOUND", "Order not found");
  if (order.paymentProvider !== "CARD_TO_CARD") {
    throw new AppError(400, "NOT_CARD_TO_CARD", "This order is not a card-to-card order");
  }
  if (order.paymentStatus === "PAID") {
    throw new AppError(400, "ALREADY_PAID", "This order is already paid");
  }

  const receipt = await prisma.receipt.create({
    data: {
      orderId: order.id,
      imageData: new Uint8Array(file.buffer),
      mimeType: file.mimetype,
      reference: reference?.trim() || null,
      status: "PENDING",
    },
  });
  await prisma.order.update({
    where: { id: order.id },
    data: { paymentStatus: "PENDING_REVIEW" },
  });

  return { ok: true, receiptId: receipt.id, paymentStatus: "PENDING_REVIEW" as const };
}

// Public payment configuration the storefront uses to decide which methods to offer.
export function getPaymentConfig() {
  return {
    online: true,
    cardToCard: env.CARD_TO_CARD_ENABLED,
    card: env.CARD_TO_CARD_ENABLED ? cardToCardInfo() : null,
  };
}
