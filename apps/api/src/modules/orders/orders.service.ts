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
import { getPaymentProvider, getPaymentProviderForOrder } from "../payments/provider";
import { getGatewayConfig } from "../../lib/gatewayConfig";
import { notifyAdmin } from "../../bot";
import { decryptSecret } from "../../lib/secretBox";
import type { CreateOrderInput } from "./orders.schemas";

type OrderWithItems = Prisma.OrderGetPayload<{
  include: {
    items: { include: { product: true; plan: true; fulfilledItems: true } };
    receipts: true;
  };
}>;
type FulfilledItem = OrderWithItems["items"][number]["fulfilledItems"][number];

// Destination card shown to the buyer for a manual card-to-card transfer
// (runtime gateway config: editable from the admin panel / bot / agent).
async function cardToCardInfo() {
  const gw = await getGatewayConfig();
  return { number: gw.cardNumber, holder: gw.cardHolder, bank: gw.cardBank };
}

function credentialOf(item: FulfilledItem) {
  return {
    id: item.id,
    type: item.type,
    accountEmail: item.accountEmail,
    accountPassword: decryptSecret(item.accountPassword),
    licenseKey: decryptSecret(item.licenseKey),
    giftCardCode: decryptSecret(item.giftCardCode),
  };
}

async function serializeOrderDetail(order: OrderWithItems) {
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
        ? await cardToCardInfo()
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

  // All line items must share one currency — summing across currencies (and
  // stamping the order with plans[0]) would charge a wrong total.
  const currencies = new Set(input.items.map((i) => planMap.get(i.planId)!.currency));
  if (currencies.size > 1) {
    throw new AppError(400, "MIXED_CURRENCY", "All items in an order must use the same currency");
  }
  const currency = planMap.get(input.items[0].planId)?.currency ?? env.ZARINPAL_CURRENCY;
  let total = new Prisma.Decimal(0);
  const itemsData = input.items.map((item) => {
    const plan = planMap.get(item.planId)!;
    // Charge the sale price when it is set and genuinely lower than the regular price.
    const unitPrice =
      plan.salePrice != null && plan.salePrice.lt(plan.price) ? plan.salePrice : plan.price;
    const lineTotal = unitPrice.mul(item.quantity);
    total = total.add(lineTotal);
    return {
      productId: plan.productId,
      planId: plan.id,
      quantity: item.quantity,
      unitPrice,
      lineTotal,
    };
  });

  // --- Card-to-card: create a PENDING order and return the destination card. -----
  // No gateway is involved; the buyer transfers manually then uploads a receipt.
  if (input.method === "card_to_card") {
    const gw = await getGatewayConfig();
    if (!gw.cardEnabled) {
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
      cardToCard: { ...(await cardToCardInfo()), amount: Number(total), currency },
    };
  }

  // --- Online: open a payment-gateway session and return the redirect URL. -------
  const provider = await getPaymentProvider();
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

  let payment;
  try {
    payment = await provider.createPayment({
      orderId: order.id,
      amount: Number(total),
      currency: order.currency,
      description: `Order ${order.id}`,
      callbackUrl: `${env.WEB_BASE_URL}/checkout/callback`,
    });
  } catch (error) {
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: "FAILED" },
    });
    throw error;
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentAuthority: payment.authority,
      ...(payment.verificationContext ? { paymentMetadata: payment.verificationContext } : {}),
    },
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

type Tx = Prisma.TransactionClient;

// Deliver a paid order: claim one inventory unit per quantity and mark it PAID,
// all in one transaction. Returns true when THIS call delivered the order and
// false when it was already PAID (idempotent no-op).
//
// The order row is locked with SELECT ... FOR UPDATE before its status is read.
// Without that lock two concurrent calls (parallel /payments/verify requests, or
// a double-clicked receipt approval) both saw PENDING, SKIP LOCKED handed each a
// DIFFERENT set of units, and one payment received N times the credentials.
// `onDelivered` runs inside the same transaction (e.g. to mark the receipt).
export async function deliverOrder(
  orderId: string,
  refId: string | null,
  onDelivered?: (tx: Tx) => Promise<void>,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ paymentStatus: string }[]>`
      SELECT "paymentStatus" FROM orders WHERE id = ${orderId} FOR UPDATE`;
    if (locked.length === 0) throw new AppError(404, "NOT_FOUND", "Order not found");
    if (locked[0].paymentStatus === "PAID") return false; // idempotent

    const items = await tx.orderItem.findMany({ where: { orderId } });
    for (const item of items) {
      // Claim available units; SKIP LOCKED keeps different orders from blocking
      // each other while never handing the same unit to two orders.
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
    if (onDelivered) await onDelivered(tx);
    return true;
  });
}

// Statuses a gateway callback may still move an order out of. Anything else
// (PAID, NEEDS_REFUND, REFUNDED, ...) is final as far as the callback goes.
const OPEN_ONLINE_STATUSES = ["PENDING", "FAILED", "EXPIRED"] as const;

export async function verifyAndDeliver(authority: string, status: string) {
  const order = await prisma.order.findUnique({ where: { paymentAuthority: authority } });
  if (!order) throw new AppError(404, "NOT_FOUND", "No order found for this payment");

  // This endpoint is public (the gateway redirects the browser here with the
  // authority in the URL), so it must NEVER return the order's credentials —
  // only the status. The buyer reads the vault via the authenticated GET /orders/:id.
  if (order.paymentStatus === "PAID") {
    return { status: "paid" as const, orderId: order.id };
  }
  if (order.paymentStatus === "NEEDS_REFUND") {
    throw new AppError(
      409,
      "OUT_OF_STOCK",
      "Payment captured but stock was exhausted; the order will be refunded",
    );
  }
  if (!(OPEN_ONLINE_STATUSES as readonly string[]).includes(order.paymentStatus)) {
    return { status: "failed" as const };
  }

  // Conditional writes: a failure report must never overwrite a concurrent success.
  const markFailed = () =>
    prisma.order.updateMany({
      where: { id: order.id, paymentStatus: "PENDING" },
      data: { paymentStatus: "FAILED" },
    });

  if (status !== "OK") {
    await markFailed();
    return { status: "failed" as const };
  }

  const provider = getPaymentProviderForOrder(order.paymentProvider);
  const verification = await provider.verifyPayment({
    authority,
    amount: Number(order.totalAmount),
    currency: order.currency,
    verificationContext: order.paymentMetadata,
  });
  if (!verification.success) {
    await markFailed();
    return { status: "failed" as const };
  }

  let delivered: boolean;
  try {
    delivered = await deliverOrder(order.id, verification.refId);
  } catch (error) {
    if (error instanceof AppError && error.code === "OUT_OF_STOCK") {
      // The money WAS captured, so this is not a plain failure: park it in its
      // own status so the admin can refund it (or restock and fulfil manually).
      const parked = await prisma.order.updateMany({
        where: { id: order.id, paymentStatus: { in: [...OPEN_ONLINE_STATUSES] } },
        data: { paymentStatus: "NEEDS_REFUND", paymentRefId: verification.refId },
      });
      if (parked.count > 0) {
        void notifyAdmin(
          `🚨 *کمبود موجودی در حین پرداخت*\n\n` +
            `سفارش *#${order.id.slice(-8)}* با مبلغ ${Number(order.totalAmount)} ${order.currency} پرداخت شد (کد پیگیری: ${verification.refId ?? "—"})، اما موجودی محصول تمام شده بود.\n` +
            `وضعیت سفارش: NEEDS_REFUND. لطفا وجه را بازگردانید یا انبار را شارژ و سفارش را دستی تحویل دهید.`,
        ).catch(() => {});
      }
      throw new AppError(
        409,
        "OUT_OF_STOCK",
        "Payment captured but stock was exhausted; the order will be refunded",
      );
    }
    throw error;
  }

  // Tell the admin about the sale (and any plan that just ran low) — once.
  if (delivered) void notifySale(order.id).catch(() => {});

  return { status: "paid" as const, orderId: order.id };
}

const LOW_STOCK_ALERT = 5;

// "⚠️ low stock" lines for the plans in an order, or null when nothing is low.
// Exported so the card-to-card approval path can warn too.
export async function lowStockWarning(orderId: string): Promise<string | null> {
  const items = await prisma.orderItem.findMany({
    where: { orderId },
    include: { product: { select: { name: true } } },
  });
  if (items.length === 0) return null;

  const planIds = [...new Set(items.map((i) => i.planId))];
  const remaining = await prisma.inventoryItem.groupBy({
    by: ["planId"],
    where: { planId: { in: planIds }, status: "AVAILABLE" },
    _count: { _all: true },
  });
  const remainMap = new Map(remaining.map((r) => [r.planId, r._count._all]));
  const low = items
    .map((i) => ({ name: i.product.name, left: remainMap.get(i.planId) ?? 0 }))
    .filter((p) => p.left <= LOW_STOCK_ALERT);
  if (low.length === 0) return null;
  return ["⚠️ موجودی رو به اتمام:", ...low.map((p) => `• ${p.name} — ${p.left} عدد مانده`)].join(
    "\n",
  );
}

// Telegram notification for a successful online sale + low-stock warnings.
async function notifySale(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { name: true, email: true, phone: true } },
      items: { include: { product: { select: { name: true } } } },
    },
  });
  if (!order) return;

  const who = order.user.email ?? order.user.phone ?? order.user.name;
  const lines = [
    "💰 فروش جدید!",
    "",
    `سفارش #${order.id.slice(-8)} — ${Number(order.totalAmount)} ${order.currency}`,
    `خریدار: ${order.user.name} (${who})`,
    ...order.items.map((i) => `• ${i.product.name} × ${i.quantity}`),
  ];
  const low = await lowStockWarning(orderId);
  if (low) lines.push("", low);

  await notifyAdmin(lines.join("\n"));
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
export async function getPaymentConfig() {
  const gw = await getGatewayConfig();
  return {
    online: true,
    cardToCard: gw.cardEnabled,
    card: gw.cardEnabled ? await cardToCardInfo() : null,
  };
}
