import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { getGatewayConfig } from "../../lib/gatewayConfig";
import { AppError } from "../../utils/httpError";
import { getPaymentProvider } from "../payments/provider";
import { reserveBluInvoice } from "./blu-invoice";
import { claimAvailableStock } from "./blu-stock";
import { bluStockVerifierReady, getPaymentConfig } from "./orders.service";
import { readVariant } from "../suppliers/variant";
import { assertNoWelcomeCheckout, isWelcomeCode } from "./welcome-gift";
import {
  CART_PAYMENT_WINDOW,
  cartChanged,
  cartRevision,
  cartSignature,
  checkedCartTotal,
  expireOnlineCartOrder,
  isCartPlanAvailable,
  lockCartLine,
  type CartPayment,
} from "./cart-state";

export function cartPlanPrice(plan: { price: Prisma.Decimal; salePrice: Prisma.Decimal | null }) {
  return plan.salePrice?.lt(plan.price) ? plan.salePrice : plan.price;
}

export async function createInternalCartOrder(
  userId: string,
  payment: CartPayment,
  method: "online" | "card_to_card",
) {
  const gateway = method === "card_to_card" ? await getGatewayConfig() : null;
  if (method === "online" && !(await getPaymentConfig()).online)
    throw new AppError(409, "METHOD_UNAVAILABLE", "Online payment is unavailable");
  const provider = method === "online" ? await getPaymentProvider() : null;
  if (
    gateway &&
    (!gateway.cardEnabled || !/^\d{16}$/.test(gateway.cardNumber) || !gateway.cardHolder.trim())
  )
    throw new AppError(409, "METHOD_UNAVAILABLE", "Card payment is unavailable");
  const created = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR NO KEY UPDATE`;
    if (
      (await tx.user.findUnique({ where: { id: userId }, select: { role: true } }))?.role !== "USER"
    )
      throw new AppError(403, "FORBIDDEN", "Customer account required");
    const ids = [payment.lineId, ...(payment.extraIds ?? [])].sort();
    const carts = [];
    for (const id of ids) carts.push(await lockCartLine(tx, userId, id));
    const orderId = carts[0].orderId;
    if (orderId) {
      if (carts.some((line) => line.orderId !== orderId)) throw cartChanged();
      const existing = await tx.order.findFirstOrThrow({ where: { id: orderId, userId } });
      const existingIds = (existing.paymentMetadata as Prisma.JsonObject).cartLineIds;
      if (JSON.stringify(existingIds) !== JSON.stringify(ids)) throw cartChanged();
      if ((existing.paymentProvider === "CARD_TO_CARD") !== (method === "card_to_card"))
        throw cartChanged();
      if (!["PENDING", "PENDING_REVIEW", "PAID"].includes(existing.paymentStatus))
        throw cartChanged();
      return { order: existing, start: false };
    }
    const currency = carts[0].currency;
    const plans = await tx.productPlan.findMany({
      where: { id: { in: carts.map((line) => line.planId) } },
      include: { product: { select: { isActive: true } } },
    });
    const items = await Promise.all(
      carts.map(async (line) => {
        const plan = plans.find((candidate) => candidate.id === line.planId);
        if (
          !plan ||
          !(await isCartPlanAvailable(tx, userId, plan)) ||
          (!plan.isActive && (method !== "card_to_card" || carts.length !== 1)) ||
          plan.source === "SUPPLIER" ||
          line.orderId ||
          line.expiresAt <= new Date() ||
          plan.currency !== currency ||
          cartSignature(plan) !== line.signature
        )
          throw cartChanged();
        return { line, plan, price: cartPlanPrice(plan) };
      }),
    );
    const subtotal = items.reduce((sum, item) => sum.add(item.price), new Prisma.Decimal(0));
    if (cartRevision(items) !== payment.revision) throw cartChanged();
    await assertNoWelcomeCheckout(tx, userId);
    const invoice = await checkedCartTotal(tx, userId, subtotal, payment);
    const useBlu = gateway && env.BLU_STOCK_CHECKOUT_ENABLED && bluStockVerifierReady();
    const blu = useBlu ? await reserveBluInvoice(tx, gateway, invoice.total, currency) : null;
    const amount = blu?.totalAmount ?? invoice.total;
    const expiresAt = blu
      ? new Date(blu.paymentMetadata.expiresAt)
      : new Date(Date.now() + CART_PAYMENT_WINDOW);
    const metadata = {
      cartStockHeld: true,
      cartExpiresAt: expiresAt.toISOString(),
      cartLineIds: ids,
      cartSubtotal: invoice.subtotal.toString(),
      cartDiscount: invoice.discount.toString(),
      ...(gateway && !blu
        ? {
            cartCard: {
              number: gateway.cardNumber,
              holder: gateway.cardHolder,
              bank: gateway.cardBank,
            },
          }
        : {}),
      ...(blu ? { ...blu.paymentMetadata, stockHeld: true } : {}),
    };
    let remaining = amount;
    let remainingSubtotal = subtotal;
    const order = await tx.order.create({
      data: {
        userId,
        welcomeGift: isWelcomeCode(payment.code),
        totalAmount: amount,
        currency,
        paymentStatus: "PENDING",
        paymentProvider: gateway ? "CARD_TO_CARD" : provider!.name,
        paymentMetadata: metadata,
        ...(blu ? { bluInvoiceKey: blu.bluInvoiceKey } : {}),
        items: {
          create: items.map(({ plan, price }) => {
            const lineTotal = remainingSubtotal.eq(price)
              ? remaining
              : remaining
                  .mul(price)
                  .div(remainingSubtotal)
                  .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
            remaining = remaining.sub(lineTotal);
            remainingSubtotal = remainingSubtotal.sub(price);
            return {
              productId: plan.productId,
              planId: plan.id,
              quantity: 1,
              unitPrice: lineTotal,
              lineTotal,
              planSnapshot: {
                label: plan.label,
                variant: readVariant(plan.variant),
                source: plan.source,
                durationDays: plan.durationDays,
              },
            };
          }),
        },
      },
      include: { items: { select: { id: true, planId: true } } },
    });
    for (const item of order.items) {
      const source = items.find(({ plan }) => plan.id === item.planId)!;
      const held = await tx.inventoryItem.updateMany({
        where: {
          cartLineId: source.line.id,
          status: "RESERVED",
          productId: source.plan.productId,
          planId: item.planId,
        },
        data: { cartLineId: null, orderItemId: item.id },
      });
      // A cart saved before this release may already own a reserved unit.
      if (held.count > 1) throw cartChanged();
      if (!held.count)
        await claimAvailableStock(
          tx,
          { ...item, quantity: 1, productId: source.plan.productId },
          "RESERVED",
        );
    }
    await tx.cartLine.updateMany({ where: { id: { in: ids } }, data: { orderId: order.id } });
    return { order, start: true };
  });
  const row = created.order;
  const order = {
    id: row.id,
    totalAmount: Number(row.totalAmount),
    currency: row.currency,
    paymentStatus: row.paymentStatus,
  };
  if (!provider) return { order };
  const metadata = row.paymentMetadata as Prisma.JsonObject;
  if (!created.start) {
    if (row.paymentStatus === "PAID") return { order };
    if (
      row.paymentAuthority &&
      typeof metadata.redirectUrl === "string" &&
      typeof metadata.cartExpiresAt === "string" &&
      Date.parse(metadata.cartExpiresAt) > Date.now()
    )
      return { order, payment: { redirectUrl: metadata.redirectUrl } };
    if (row.paymentAuthority)
      throw new AppError(
        409,
        "PAYMENT_WINDOW_CLOSED",
        "Check payment status before starting again",
      );
    throw new AppError(409, "PAYMENT_INITIALIZING", "Check the order before retrying payment");
  }
  let paymentSession;
  try {
    paymentSession = await provider.createPayment({
      orderId: order.id,
      amount: order.totalAmount,
      currency: order.currency,
      description: "Oosta order " + order.id,
      callbackUrl: env.WEB_BASE_URL + "/checkout/callback",
    });
  } catch (error) {
    // No authority or redirect has been handed to the buyer.
    await expireOnlineCartOrder(order.id, null);
    throw error;
  }
  const saved = await prisma.order.updateMany({
    where: { id: order.id, paymentStatus: "PENDING", paymentAuthority: null },
    data: {
      paymentAuthority: paymentSession.authority,
      paymentMetadata: {
        ...(paymentSession.verificationContext ?? {}),
        ...metadata,
        redirectUrl: paymentSession.redirectUrl,
      },
    },
  });
  if (saved.count !== 1)
    throw new AppError(409, "PAYMENT_WINDOW_CLOSED", "The payment session has expired");
  return { order, payment: { redirectUrl: paymentSession.redirectUrl } };
}
