import { readVariant } from "../suppliers/variant";
// Orders + the instant-delivery engine.
//
// Overselling is prevented by claiming inventory atomically at delivery time inside
// a single transaction using `SELECT ... FOR UPDATE SKIP LOCKED`: two concurrent paid
// orders can never be assigned the same unit. Delivery is idempotent (re-verifying a
// PAID order is a no-op).

import { Prisma } from "@prisma/client";
import { createPublicKey } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { AppError } from "../../utils/httpError";
import { getPaymentProvider, getPaymentProviderForOrder } from "../payments/provider";
import { getGatewayConfig, isOnlinePaymentBlocked } from "../../lib/gatewayConfig";
import { lockOrder } from "../../lib/orderLock";
import { notifyAdmin, notifySupplierReceipt } from "../../bot";
import { readManualSupplier } from "../suppliers/manual-payment";
import { readCartCard } from "./cart-state";
import { assertNoWelcomeCheckout } from "./welcome-gift";
import type { CreateOrderInput } from "./orders.schemas";
import { readBluInvoice, reserveBluInvoice } from "./blu-invoice";
import { claimAvailableStock, releaseExpiredBluStock } from "./blu-stock";
import { canDeliverPrivateBluStock } from "./blu-private-stock";
import { renewalEstimate } from "./renewals";
import { addOrderNotification } from "./order-notifications";

export function bluStockVerifierReady() {
  try {
    const key = createPublicKey({
      key: Buffer.from(env.BLU_EVENT_PUBLIC_KEY ?? "", "base64"),
      format: "der",
      type: "spki",
    });
    return (
      key.asymmetricKeyType === "ed25519" &&
      Buffer.from(env.BLU_TRACKING_HMAC_KEY ?? "", "base64").length === 32
    );
  } catch {
    return false;
  }
}

type OrderWithItems = Prisma.OrderGetPayload<{
  include: {
    items: { include: { product: true; plan: true; fulfilledItems: true } };
    receipts: true;
    user: { select: { role: true } };
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
    accountPassword: item.accountPassword,
    licenseKey: item.licenseKey,
    giftCardCode: item.giftCardCode,
    deliveryInstructions: item.deliveryInstructions,
  };
}

async function serializeOrderDetail(order: OrderWithItems) {
  const paid = order.paymentStatus === "PAID";
  const invoice = order.bluInvoiceKey ? readBluInvoice(order.paymentMetadata) : null;
  const manual = readManualSupplier(order.paymentMetadata);
  const cart = readCartCard(order.paymentMetadata);
  const remainingMs = invoice ? Math.max(0, Date.parse(invoice.expiresAt) - Date.now()) : 0;
  const expired = !!invoice && remainingMs === 0;
  const now = new Date();
  return {
    bluInvoice: invoice
      ? {
          baseAmount: invoice.baseAmount,
          discount: invoice.discount,
          expiresAt: invoice.expiresAt,
          expired,
          remainingMs,
          qaOnly: !!invoice.qaCampaign,
          stockHeld: !!invoice.stockHeld,
          privateStockQa: !!invoice.privateStockQa,
          supplierCheckout: !!invoice.supplierCheckout,
        }
      : null,
    id: order.id,
    isSupplierQa:
      !!order.paymentMetadata &&
      typeof order.paymentMetadata === "object" &&
      !Array.isArray(order.paymentMetadata) &&
      order.paymentMetadata.purpose === "SUPPLIER_QA",
    supplierQaKind:
      order.paymentMetadata &&
      typeof order.paymentMetadata === "object" &&
      !Array.isArray(order.paymentMetadata) &&
      order.paymentMetadata.purpose === "SUPPLIER_QA"
        ? order.paymentMetadata.qaProductKind === "REAL_STOCK"
          ? "REAL_STOCK"
          : "API_TEST"
        : null,
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
      plan: {
        id: item.plan.id,
        ...(savedPlan(item.planSnapshot) ?? {
          label: item.plan.label,
          variant: readVariant(item.plan.variant),
          durationDays: item.plan.durationDays,
        }),
      },
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
      renewal: renewalEstimate(order, item, now),
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
    manualSupplier: manual
      ? {
          expiresAt: manual.expiresAt,
          remainingMs: Math.max(0, Date.parse(manual.expiresAt) - Date.now()),
          deliveryHours: env.SUPPLIER_MANUAL_DELIVERY_HOURS || null,
        }
      : null,
    cartPayment: cart
      ? {
          expiresAt: cart.cartExpiresAt,
          remainingMs: Math.max(0, Date.parse(cart.cartExpiresAt) - Date.now()),
        }
      : null,
    cardToCard:
      order.paymentProvider === "CARD_TO_CARD" &&
      ["PENDING", "PENDING_REVIEW", "REJECTED"].includes(order.paymentStatus)
        ? order.bluInvoiceKey
          ? invoice && !expired
            ? { number: invoice.number, holder: invoice.holder, bank: invoice.bank }
            : null
          : manual
            ? Date.parse(manual.expiresAt) > Date.now() && order.paymentStatus === "PENDING"
              ? { number: manual.number, holder: manual.holder, bank: manual.bank }
              : null
            : cart
              ? Date.parse(cart.cartExpiresAt) > Date.now()
                ? cart.cartCard
                : null
              : await cardToCardInfo()
        : null,
  };
}

function savedPlan(value: Prisma.JsonValue | null) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof value.label !== "string"
  )
    return null;
  return {
    label: value.label,
    variant: readVariant(value.variant),
    durationDays: typeof value.durationDays === "number" ? value.durationDays : null,
  };
}

export async function createOrder(userId: string, input: CreateOrderInput) {
  const holdBluStock = env.BLU_STOCK_CHECKOUT_ENABLED && input.method === "card_to_card";
  if (holdBluStock) {
    if (!bluStockVerifierReady())
      throw new AppError(
        503,
        "BLU_VERIFICATION_UNAVAILABLE",
        "Blu payment verification is unavailable",
      );
    if (input.items.length !== 1 || input.items[0].quantity !== 1)
      throw new AppError(400, "BLU_SINGLE_ITEM_REQUIRED", "Use one item per Blu checkout");
    await releaseExpiredBluStock();
  }
  const planIds = [...new Set(input.items.map((i) => i.planId))];
  const plans = await prisma.productPlan.findMany({
    where: { id: { in: planIds }, isActive: true },
    include: { product: true },
  });
  const planMap = new Map(plans.map((p) => [p.id, p]));

  for (const item of input.items) {
    const plan = planMap.get(item.planId);
    if (plan?.source === "SUPPLIER")
      throw new AppError(
        503,
        "SUPPLIER_CHECKOUT_DISABLED",
        "Supplier orders are not enabled; no payment has been created",
      );
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
      planSnapshot: {
        label: plan.label,
        durationDays: plan.durationDays,
        variant: readVariant(plan.variant),
        source: plan.source,
      },
    };
  });

  // --- Card-to-card: create a PENDING order and return the destination card. -----
  // No gateway is involved; the buyer transfers manually then uploads a receipt.
  if (input.method === "card_to_card") {
    const gw = await getGatewayConfig();
    if (!gw.cardEnabled) {
      throw new AppError(400, "METHOD_UNAVAILABLE", "Card-to-card payment is not available");
    }
    const data = {
      userId,
      totalAmount: total,
      currency,
      paymentStatus: "PENDING" as const,
      paymentProvider: "CARD_TO_CARD" as const,
      items: { create: itemsData },
    };
    const order = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR NO KEY UPDATE`;
      await assertNoWelcomeCheckout(tx, userId);
      if (!holdBluStock && userId !== env.BLU_INVOICE_QA_USER_ID) return tx.order.create({ data });
      if (holdBluStock) {
        const open = await tx.order.count({
          where: {
            userId,
            paymentStatus: { in: ["PENDING", "REJECTED", "PENDING_REVIEW"] },
            items: { some: { fulfilledItems: { some: { status: "RESERVED" } } } },
          },
        });
        if (open > 0)
          throw new AppError(409, "BLU_STOCK_ORDER_OPEN", "An existing order is holding stock");
      }
      const invoice = await reserveBluInvoice(tx, gw, total, currency);
      const created = await tx.order.create({
        data: {
          ...data,
          ...invoice,
          paymentMetadata: holdBluStock
            ? { ...invoice.paymentMetadata, stockHeld: true }
            : invoice.paymentMetadata,
        },
        include: { items: true },
      });
      if (holdBluStock)
        for (const item of created.items) await claimAvailableStock(tx, item, "RESERVED");
      return created;
    });
    const amount = Number(order.totalAmount);
    return {
      order: { id: order.id, totalAmount: amount, currency, paymentStatus: order.paymentStatus },
      cardToCard: {
        number: gw.cardNumber,
        holder: gw.cardHolder,
        bank: gw.cardBank,
        amount,
        currency,
      },
    };
  }

  // --- Online: open a payment-gateway session and return the redirect URL. -------
  const provider = await getPaymentProvider();
  const order = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR NO KEY UPDATE`;
    await assertNoWelcomeCheckout(tx, userId);
    return tx.order.create({
      data: {
        userId,
        totalAmount: total,
        currency,
        paymentStatus: "PENDING",
        paymentProvider: provider.name,
        items: { create: itemsData },
      },
    });
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

export async function deliverOrder(orderId: string, refId: string | null): Promise<boolean> {
  return prisma.$transaction((tx) => deliverOrderInTransaction(tx, orderId, refId));
}

export async function deliverOrderInTransaction(
  tx: Prisma.TransactionClient,
  orderId: string,
  refId: string | null,
): Promise<boolean> {
  await lockOrder(tx, orderId);
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw new AppError(404, "NOT_FOUND", "Order not found");
  if (order.paymentStatus === "PAID") return false;
  const invoice = readBluInvoice(order.paymentMetadata);
  const privateStockQa = await canDeliverPrivateBluStock(tx, order, invoice);
  if (
    order.bluInvoiceKey &&
    (order.items.length === 0 || (invoice?.qaCampaign && !privateStockQa))
  ) {
    throw new AppError(
      409,
      "BLU_QA_NO_FULFILLMENT",
      "Blu payment-only QA invoices do not deliver products",
    );
  }
  if (order.paymentStatus === "REFUNDED" || order.paymentStatus === "EXPIRED") {
    throw new AppError(409, "ORDER_CLOSED", "This order can no longer be fulfilled");
  }

  for (const item of order.items) {
    const held = await tx.inventoryItem.updateMany({
      where: { orderItemId: item.id, status: "RESERVED" },
      data: { status: "SOLD", soldAt: new Date() },
    });
    if (held.count > item.quantity)
      throw new AppError(409, "INVALID_STOCK_HOLD", "The reserved stock requires review");
    if (held.count < item.quantity)
      await claimAvailableStock(tx, { ...item, quantity: item.quantity - held.count }, "SOLD");
  }

  await tx.order.update({
    where: { id: orderId },
    data: { paymentStatus: "PAID", paidAt: new Date(), paymentRefId: refId },
  });
  if (!privateStockQa) await addOrderNotification(tx, order.userId, orderId, "ORDER_DELIVERED");
  if (privateStockQa)
    await tx.supplierQaAttempt.updateMany({
      where: { orderId, state: "AWAITING_PAYMENT" },
      data: { state: "DELIVERED" },
    });
  return true;
}

async function recordVerificationFailure(orderId: string) {
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.paymentStatus === "PAID") return { status: "paid" as const, orderId };
    if (order.paymentStatus === "PAID_PENDING_FULFILLMENT") {
      return { status: "pending" as const, orderId };
    }
    await tx.order.updateMany({
      where: { id: orderId, paymentStatus: { in: ["PENDING", "FAILED"] } },
      data: { paymentStatus: "FAILED" },
    });
    return { status: "failed" as const, orderId };
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
  const metadata = order.paymentMetadata as Prisma.JsonObject | null;
  if (order.paymentStatus === "PAID_PENDING_FULFILLMENT" && metadata?.lateCartPayment === true)
    return { status: "pending" as const, orderId: order.id };
  if (order.paymentStatus === "EXPIRED" && order.paymentProvider === "MANUAL")
    return { status: "failed" as const, orderId: order.id };

  if (status !== "OK") {
    return recordVerificationFailure(order.id);
  }

  const provider = getPaymentProviderForOrder(order.paymentProvider);
  const verification = await provider.verifyPayment({
    authority,
    amount: Number(order.totalAmount),
    currency: order.currency,
    verificationContext: order.paymentMetadata,
  });
  if (!verification.success) {
    return recordVerificationFailure(order.id);
  }

  let delivered: boolean;
  try {
    delivered = await deliverOrder(order.id, verification.refId);
  } catch (error) {
    if (
      error instanceof AppError &&
      error.code === "ORDER_CLOSED" &&
      order.paymentProvider === "ZARINPAL" &&
      metadata?.cartStockHeld === true
    ) {
      // A positively verified late charge must remain visible for reconciliation.
      const saved = await prisma.order.updateMany({
        where: { id: order.id, paymentStatus: "EXPIRED" },
        data: {
          paymentStatus: "PAID_PENDING_FULFILLMENT",
          paymentRefId: verification.refId,
          paidAt: new Date(),
          paymentMetadata: { ...metadata, lateCartPayment: true },
        },
      });
      if (saved.count) {
        void notifyAdmin(
          `پرداخت آنلاین سفارش #${order.id.slice(-8)} پس از انقضای فاکتور تأیید شد. سفارش برای بررسی و تحویل یا بازپرداخت در انتظار است.`,
        ).catch(() => {});
        return { status: "pending" as const, orderId: order.id };
      }
      const closed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      if (closed.paymentStatus === "PAID_PENDING_FULFILLMENT")
        return { status: "pending" as const, orderId: order.id };
    }
    if (error instanceof AppError && error.code === "OUT_OF_STOCK") {
      const recorded = await prisma.order.updateMany({
        where: {
          id: order.id,
          paidAt: null,
          paymentStatus: { in: ["PENDING", "FAILED", "PAID_PENDING_FULFILLMENT"] },
        },
        data: {
          paymentStatus: "PAID_PENDING_FULFILLMENT",
          paymentRefId: verification.refId,
          paidAt: new Date(),
        },
      });
      if (!recorded.count) {
        const current = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
        if (current.paymentStatus === "PAID") return { status: "paid" as const, orderId: order.id };
        return { status: "pending" as const, orderId: order.id };
      }

      // Notify admin about stock exhaustion and manual refund requirement
      void notifyAdmin(
        `⚠️ *کمبود موجودی در حین پرداخت*\n\n` +
          `سفارش *#${order.id.slice(-8)}* با مبلغ ${Number(order.totalAmount)} ${order.currency} پرداخت شد، اما موجودی محصول به اتمام رسیده بود.\n` +
          `پرداخت ثبت شده و سفارش منتظر تأمین موجودی است. لطفا نسبت به بازگردانی وجه کاربر یا شارژ مجدد انبار اقدام نمایید.`,
      ).catch(() => {});

      return { status: "pending" as const, orderId: order.id };
    }
    throw error;
  }

  // Tell the admin about the sale (and any plan that just ran low) — fire & forget.
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
    select: {
      id: true,
      totalAmount: true,
      currency: true,
      paymentStatus: true,
      createdAt: true,
      paidAt: true,
      _count: { select: { items: true } },
      items: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 1,
        select: { product: { select: { name: true } } },
      },
    },
  });
  return orders.map((order) => ({
    id: order.id,
    totalAmount: Number(order.totalAmount),
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    itemCount: order._count.items,
    firstProductName: order.items[0]?.product.name ?? null,
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
      user: { select: { role: true } },
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
  const mimeType = file.mimetype.toLowerCase();
  if (!ALLOWED_RECEIPT_TYPES.has(mimeType)) {
    throw new AppError(400, "BAD_FILE_TYPE", "Receipt must be an image (JPG/PNG/WebP) or PDF");
  }

  const saved = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    await lockOrder(tx, orderId);
    const order = await tx.order.findFirst({ where: { id: orderId, userId } });
    if (!order) throw new AppError(404, "NOT_FOUND", "Order not found");
    if (order.paymentProvider !== "CARD_TO_CARD") {
      throw new AppError(400, "NOT_CARD_TO_CARD", "This order is not a card-to-card order");
    }
    if (!["PENDING", "PENDING_REVIEW", "REJECTED"].includes(order.paymentStatus)) {
      throw new AppError(400, "ALREADY_PAID", "This order is already paid");
    }
    const normalized = reference
      ?.trim()
      .replace(/[۰-۹٠-٩]/g, (digit) => String(digit.charCodeAt(0) % 16));
    const invoice = readBluInvoice(order.paymentMetadata);
    const manual = readManualSupplier(order.paymentMetadata);
    const cart = readCartCard(order.paymentMetadata);
    if (cart && order.paymentStatus === "PENDING" && Date.parse(cart.cartExpiresAt) <= Date.now())
      throw new AppError(409, "ORDER_CLOSED", "This payment window has expired");
    if (manual && order.paymentStatus === "REJECTED")
      throw new AppError(409, "ALREADY_REVIEWED", "Request a new supplier order");
    if (
      (cart || manual || invoice?.stockHeld || invoice?.supplierCheckout) &&
      !/^\d{4,30}$/.test(normalized ?? "")
    )
      throw new AppError(
        400,
        "BLU_REFERENCE_REQUIRED",
        "Enter the bank tracking or reference number",
      );

    const count = await tx.receipt.count({ where: { orderId } });
    const recent = await tx.receipt.count({
      where: { order: { userId }, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    if (count >= 5 || recent >= 20) {
      throw new AppError(
        429,
        "RECEIPT_LIMIT",
        "Receipt upload limit reached; please contact support",
      );
    }
    const receipt = await tx.receipt.create({
      data: {
        orderId: order.id,
        imageData: new Uint8Array(file.buffer),
        mimeType,
        reference: (manual || cart ? normalized : reference?.trim()) || null,
        status: "PENDING",
      },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: "PENDING_REVIEW" },
    });

    return {
      ok: true,
      receiptId: receipt.id,
      paymentStatus: "PENDING_REVIEW" as const,
      manual: !!manual,
    };
  });
  const { manual, ...response } = saved;
  if (manual) void notifySupplierReceipt(saved.receiptId, orderId);
  return response;
}

// Public payment configuration the storefront uses to decide which methods to offer.
export async function getPaymentConfig() {
  const gw = await getGatewayConfig();
  return {
    online: !(env.isProduction && gw.provider === "mock") && !isOnlinePaymentBlocked(gw),
    cardToCard: gw.cardEnabled,
    card: gw.cardEnabled ? await cardToCardInfo() : null,
  };
}
