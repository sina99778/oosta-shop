// Orders + the instant-delivery engine.
//
// Stock lifecycle: creating an order RESERVES its units (SELECT … FOR UPDATE SKIP
// LOCKED, so two buyers can never hold the same unit); payment turns them SOLD;
// a failed/expired/rejected order releases them back to AVAILABLE. Delivery locks
// the order row first, so concurrent callbacks/approvals serialize and only the
// first one delivers (re-delivering a PAID order is a no-op).

import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { AppError } from "../../utils/httpError";
import { getPaymentProvider, getPaymentProviderForOrder } from "../payments/provider";
import { getGatewayConfig } from "../../lib/gatewayConfig";
import { openCredentials } from "../../lib/credentials";
import { notifyAdmin } from "../../bot";
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
  const open = openCredentials(item);
  return {
    id: item.id,
    type: item.type,
    accountEmail: open.accountEmail,
    accountPassword: open.accountPassword,
    licenseKey: open.licenseKey,
    giftCardCode: open.giftCardCode,
  };
}

type Tx = Prisma.TransactionClient;

// Row-lock an order for the rest of the transaction and return its current status.
// Every path that changes an order's payment state takes this lock first, so
// concurrent callbacks / approvals / the expiry sweeper serialize on it.
export async function lockOrder(tx: Tx, orderId: string) {
  const rows = await tx.$queryRaw<{ paymentStatus: string }[]>`
    SELECT "paymentStatus" FROM orders WHERE id = ${orderId} FOR UPDATE`;
  if (rows.length === 0) throw new AppError(404, "NOT_FOUND", "Order not found");
  return rows[0].paymentStatus as Prisma.OrderGetPayload<object>["paymentStatus"];
}

// Claim up to `quantity` AVAILABLE units of a plan (skipping rows other
// transactions hold) — returns their ids.
async function claimAvailable(tx: Tx, planId: string, quantity: number): Promise<string[]> {
  if (quantity <= 0) return [];
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM inventory_items
    WHERE "planId" = ${planId} AND status = 'AVAILABLE'
    ORDER BY "createdAt" ASC
    LIMIT ${quantity}
    FOR UPDATE SKIP LOCKED`;
  return rows.map((r) => r.id);
}

// Return an order's RESERVED units to the shelf (SOLD/REVOKED units are untouched).
export async function releaseReservations(tx: Tx, orderId: string): Promise<number> {
  const result = await tx.inventoryItem.updateMany({
    where: { status: "RESERVED", orderItem: { orderId } },
    data: { status: "AVAILABLE", orderItemId: null },
  });
  return result.count;
}

// Statuses in which an order holds no money and no stock — a late successful
// gateway callback or a receipt approval may still revive it.
const RELEASABLE = new Set(["PENDING", "PENDING_REVIEW"]);

// Mark an unpaid order with a terminal status and free its stock (no-op once paid).
export async function closeUnpaidOrder(
  orderId: string,
  status: "FAILED" | "EXPIRED" | "REJECTED",
  options: { onlyFrom?: string[] } = {},
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const current = await lockOrder(tx, orderId);
    const allowed = options.onlyFrom ?? [...RELEASABLE];
    if (!allowed.includes(current)) return false;
    await tx.order.update({ where: { id: orderId }, data: { paymentStatus: status } });
    await releaseReservations(tx, orderId);
    return true;
  });
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
    // Stock is held for the buyer until this moment (PENDING orders only).
    expiresAt: order.paymentStatus === "PENDING" ? order.expiresAt : null,
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
      credentials: paid
        ? item.fulfilledItems.filter((f) => f.status === "SOLD").map(credentialOf)
        : [],
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
      order.paymentProvider === "CARD_TO_CARD" && canUploadReceipt(order.paymentStatus)
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

  // Each unpaid order holds stock, so cap how many a user can have open at once
  // (otherwise one account could reserve the whole shelf).
  const openOrders = await prisma.order.count({
    where: {
      userId,
      paymentStatus: { in: ["PENDING", "PENDING_REVIEW"] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  if (openOrders >= env.MAX_OPEN_ORDERS_PER_USER) {
    throw new AppError(
      429,
      "TOO_MANY_OPEN_ORDERS",
      "You have too many unpaid orders; pay or wait for them to expire first",
    );
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

  const isCard = input.method === "card_to_card";
  if (isCard) {
    const gw = await getGatewayConfig();
    if (!gw.cardEnabled) {
      throw new AppError(400, "METHOD_UNAVAILABLE", "Card-to-card payment is not available");
    }
  }
  // Resolve (and safety-check) the online gateway BEFORE reserving stock.
  const provider = isCard ? null : await getPaymentProvider();
  const expiryMinutes = isCard ? env.ORDER_EXPIRY_MINUTES_CARD : env.ORDER_EXPIRY_MINUTES_ONLINE;
  const expiresAt = new Date(Date.now() + expiryMinutes * 60_000);

  // Create the order and RESERVE its units atomically: if any line can't be
  // fully reserved the whole transaction rolls back and nothing is held.
  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        userId,
        totalAmount: total,
        currency,
        paymentStatus: "PENDING",
        paymentProvider: isCard ? "CARD_TO_CARD" : provider!.name,
        expiresAt,
        items: { create: itemsData },
      },
      include: { items: true },
    });
    for (const item of created.items) {
      const ids = await claimAvailable(tx, item.planId, item.quantity);
      if (ids.length < item.quantity) {
        const plan = planMap.get(item.planId)!;
        throw new AppError(
          409,
          "OUT_OF_STOCK",
          `Insufficient stock for ${plan.product.name} — ${plan.label}`,
        );
      }
      await tx.inventoryItem.updateMany({
        where: { id: { in: ids } },
        data: { status: "RESERVED", orderItemId: item.id },
      });
    }
    return created;
  });

  const orderSummary = {
    id: order.id,
    totalAmount: Number(total),
    currency,
    paymentStatus: order.paymentStatus,
    expiresAt,
  };

  // --- Card-to-card: the buyer transfers manually, then uploads a receipt. ------
  if (isCard) {
    return {
      order: orderSummary,
      cardToCard: { ...(await cardToCardInfo()), amount: Number(total), currency },
    };
  }

  // --- Online: open a payment-gateway session and return the redirect URL. -------
  let payment;
  try {
    payment = await provider!.createPayment({
      orderId: order.id,
      amount: Number(total),
      currency: order.currency,
      description: `Order ${order.id}`,
      callbackUrl: `${env.WEB_BASE_URL}${input.locale ? `/${input.locale}` : ""}/checkout/callback`,
    });
  } catch (error) {
    await closeUnpaidOrder(order.id, "FAILED");
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
    order: orderSummary,
    payment: { authority: payment.authority, redirectUrl: payment.redirectUrl },
  };
}

// Turns an order's units SOLD and marks it PAID. Uses the units RESERVED at
// checkout first, then claims AVAILABLE ones for any shortfall (an order that
// expired before the late payment arrived). Returns false when the order was
// already PAID (a concurrent caller won) — callers must not re-notify/re-act.
// `onDelivered` runs inside the same transaction (e.g. to approve the receipt).
export async function deliverOrder(
  orderId: string,
  refId: string | null,
  onDelivered?: (tx: Tx) => Promise<void>,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const status = await lockOrder(tx, orderId);
    if (status === "PAID") return false; // idempotent
    if (status === "REFUNDED") {
      throw new AppError(409, "ORDER_REFUNDED", "This order was refunded and cannot be delivered");
    }

    const items = await tx.orderItem.findMany({ where: { orderId } });
    for (const item of items) {
      const reserved = await tx.inventoryItem.findMany({
        where: { orderItemId: item.id, status: "RESERVED" },
        select: { id: true },
      });
      const extra = await claimAvailable(tx, item.planId, item.quantity - reserved.length);
      const ids = [...reserved.map((r) => r.id), ...extra];
      if (ids.length < item.quantity) {
        throw new AppError(409, "OUT_OF_STOCK", "Items went out of stock during fulfillment");
      }
      await tx.inventoryItem.updateMany({
        where: { id: { in: ids } },
        data: { status: "SOLD", orderItemId: item.id, soldAt: new Date() },
      });
    }

    await tx.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: "PAID",
        paidAt: new Date(),
        ...(refId !== null ? { paymentRefId: refId } : {}),
      },
    });
    if (onDelivered) await onDelivered(tx);
    return true;
  });
}

// Money was captured but stock could not be delivered: keep the record honest
// (PAID_UNFULFILLED, with the gateway ref) so the admin restocks + fulfills or refunds.
async function markPaidUnfulfilled(orderId: string, refId: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const status = await lockOrder(tx, orderId);
    if (status === "PAID") return;
    await tx.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: "PAID_UNFULFILLED",
        paidAt: new Date(),
        ...(refId !== null ? { paymentRefId: refId } : {}),
      },
    });
    await releaseReservations(tx, orderId);
  });
}

export async function verifyAndDeliver(authority: string, status: string) {
  const order = await prisma.order.findUnique({ where: { paymentAuthority: authority } });
  if (!order) throw new AppError(404, "NOT_FOUND", "No order found for this payment");

  // This endpoint is public (the gateway redirects the browser here with the
  // authority in the URL), so it must NEVER return the order's credentials —
  // only the status. The buyer reads the vault via the authenticated GET /orders/:id.
  if (order.paymentStatus === "PAID") {
    return { status: "paid" as const, orderId: order.id };
  }
  if (order.paymentStatus === "PAID_UNFULFILLED") {
    return { status: "unfulfilled" as const, orderId: order.id };
  }
  if (order.paymentStatus === "REFUNDED") {
    return { status: "failed" as const, orderId: order.id };
  }

  if (status !== "OK") {
    // Cancelled on the gateway page: free the reserved stock right away.
    await closeUnpaidOrder(order.id, "FAILED", { onlyFrom: ["PENDING"] });
    return { status: "failed" as const, orderId: order.id };
  }

  const provider = getPaymentProviderForOrder(order.paymentProvider);
  const verification = await provider.verifyPayment({
    authority,
    amount: Number(order.totalAmount),
    currency: order.currency,
    verificationContext: order.paymentMetadata,
  });
  if (!verification.success) {
    await closeUnpaidOrder(order.id, "FAILED", { onlyFrom: ["PENDING"] });
    return { status: "failed" as const, orderId: order.id };
  }

  let delivered: boolean;
  try {
    delivered = await deliverOrder(order.id, verification.refId);
  } catch (error) {
    if (error instanceof AppError && error.code === "OUT_OF_STOCK") {
      await markPaidUnfulfilled(order.id, verification.refId);
      void notifyAdmin(
        [
          "⚠️ پرداخت موفق، اما موجودی تمام شده بود",
          "",
          `سفارش #${order.id.slice(-8)} — ${Number(order.totalAmount)} ${order.currency}`,
          `کد پیگیری درگاه: ${verification.refId ?? "—"}`,
          "",
          "وضعیت: PAID_UNFULFILLED. انبار را شارژ کن و «تحویل سفارش» را بزن، یا وجه را برگردان.",
        ].join("\n"),
        [{ text: "📦 تحویل سفارش (بعد از شارژ انبار)", data: `ful_${order.id}` }],
      ).catch(() => {});
      return { status: "unfulfilled" as const, orderId: order.id };
    }
    throw error;
  }

  // Tell the admin about the sale (and any plan that just ran low) — once.
  if (delivered) void notifySale(order.id).catch(() => {});

  return { status: "paid" as const, orderId: order.id };
}

// Admin: deliver a PAID_UNFULFILLED order after restocking.
export async function fulfillPaidOrder(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError(404, "NOT_FOUND", "Order not found");
  if (order.paymentStatus !== "PAID_UNFULFILLED") {
    throw new AppError(409, "NOT_UNFULFILLED", "Only PAID_UNFULFILLED orders can be fulfilled");
  }
  const delivered = await deliverOrder(order.id, null);
  if (delivered) void notifySale(order.id).catch(() => {});
  return { ok: true, orderId: order.id, paymentStatus: "PAID" as const };
}

// Background job: expire unpaid orders whose reservation window has passed and
// return their stock. PENDING_REVIEW orders (receipt uploaded) keep their stock
// until the admin decides.
export async function expireStaleOrders(): Promise<number> {
  const stale = await prisma.order.findMany({
    where: { paymentStatus: "PENDING", expiresAt: { lt: new Date() } },
    select: { id: true },
    take: 200,
  });
  let expired = 0;
  for (const { id } of stale) {
    if (await closeUnpaidOrder(id, "EXPIRED", { onlyFrom: ["PENDING"] })) expired++;
  }
  return expired;
}

let expiryTimer: ReturnType<typeof setInterval> | undefined;
export function startOrderExpirySweeper(intervalMs = 60_000): () => void {
  const tick = () => {
    expireStaleOrders().catch((error) => console.error("[orders] expiry sweep failed", error));
  };
  tick();
  expiryTimer = setInterval(tick, intervalMs);
  expiryTimer.unref();
  return () => {
    if (expiryTimer) clearInterval(expiryTimer);
  };
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
    include: {
      _count: { select: { items: true } },
      // First few products, so the dashboard can draw each order's stamps.
      items: {
        take: 3,
        select: { product: { select: { name: true, slug: true, type: true } } },
      },
    },
  });
  return orders.map((order) => ({
    id: order.id,
    totalAmount: Number(order.totalAmount),
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    paymentProvider: order.paymentProvider,
    itemCount: order._count.items,
    products: order.items.map((item) => item.product),
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    expiresAt: order.paymentStatus === "PENDING" ? order.expiresAt : null,
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
// is included in backups and is NEVER deleted. The order moves to PENDING_REVIEW
// (an EXPIRED/REJECTED order may be revived: the buyer may genuinely have paid).
const MAX_RECEIPTS_PER_ORDER = 5;

function canUploadReceipt(status: string): boolean {
  return ["PENDING", "PENDING_REVIEW", "EXPIRED", "REJECTED", "FAILED"].includes(status);
}

// The declared multipart content-type is client-controlled — trust the bytes.
function sniffReceiptType(buffer: Buffer): string | null {
  const head = buffer.subarray(0, 12);
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (
    head.subarray(0, 4).toString("latin1") === "RIFF" &&
    head.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  if (head.subarray(0, 4).toString("latin1") === "GIF8") return "image/gif";
  if (head.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  return null;
}

export async function uploadReceipt(
  userId: string,
  orderId: string,
  file: { buffer: Buffer; mimetype: string } | undefined,
  reference?: string,
) {
  if (!file) throw new AppError(400, "NO_FILE", "A receipt image is required");
  const mimeType = sniffReceiptType(file.buffer);
  if (!mimeType) {
    throw new AppError(400, "BAD_FILE_TYPE", "Receipt must be an image (JPG/PNG/WebP) or PDF");
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: { _count: { select: { receipts: true } } },
  });
  if (!order) throw new AppError(404, "NOT_FOUND", "Order not found");
  if (order.paymentProvider !== "CARD_TO_CARD") {
    throw new AppError(400, "NOT_CARD_TO_CARD", "This order is not a card-to-card order");
  }
  if (!canUploadReceipt(order.paymentStatus)) {
    throw new AppError(400, "ALREADY_PAID", "This order is already paid");
  }
  if (order._count.receipts >= MAX_RECEIPTS_PER_ORDER) {
    throw new AppError(
      429,
      "TOO_MANY_RECEIPTS",
      "Too many receipts for this order; please contact support",
    );
  }

  const receipt = await prisma.$transaction(async (tx) => {
    const status = await lockOrder(tx, order.id);
    if (!canUploadReceipt(status)) {
      throw new AppError(400, "ALREADY_PAID", "This order is already paid");
    }
    const created = await tx.receipt.create({
      data: {
        orderId: order.id,
        imageData: new Uint8Array(file.buffer),
        mimeType,
        reference: reference?.trim() || null,
        status: "PENDING",
      },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: "PENDING_REVIEW" },
    });
    return created;
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
