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
  include: { items: { include: { product: true; plan: true; fulfilledItems: true } } };
}>;
type FulfilledItem = OrderWithItems["items"][number]["fulfilledItems"][number];

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

async function deliverOrder(orderId: string, refId: string | null): Promise<void> {
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
    include: { items: { include: { product: true, plan: true, fulfilledItems: true } } },
  });
  if (!order) throw new AppError(404, "NOT_FOUND", "Order not found");
  return serializeOrderDetail(order);
}
