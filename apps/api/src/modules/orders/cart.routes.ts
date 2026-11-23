import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { authenticate } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { AppError } from "../../utils/httpError";
import { getPublicCartPlans } from "../catalog/catalog.service";
import { quote } from "../suppliers/suppliers.service";
import type { SupplierCheckout } from "../suppliers/checkout";
import { getPaymentConfig } from "./orders.service";
import { recordStorefrontStep } from "../analytics/analytics.service";
import { cartPlanPrice, createInternalCartOrder } from "./cart-checkout";
import { assertRenewalCartPlan } from "./renewals";
import {
  CART_LIFETIME,
  cartChanged,
  cartNotice,
  cartRevision,
  cartSignature,
  discountFor,
  discountPercentFor,
  isCartPlanAvailable,
  lockCartLine,
  releaseCartLine,
  releaseExpiredCart,
} from "./cart-state";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const CART_LIMIT = 10;
const guestPreviewQuery = z.object({
  planIds: z.string().max(CART_LIMIT * 101).transform((value) => value.split(",")).pipe(
    z.array(id).min(1).max(CART_LIMIT).refine((ids) => new Set(ids).size === ids.length),
  ),
}).strict();
const params = z.object({ id });
const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{1,48}$/)
  .optional();
const amount = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);
const extraIds = z
  .array(id)
  .max(9)
  .refine((ids) => new Set(ids).size === ids.length)
  .optional();
const notFound = () => new AppError(404, "NOT_FOUND", "Cart item not found");
const unavailable = () => new AppError(409, "OUT_OF_STOCK", "Product is no longer available");
const planInclude = { product: { select: { name: true, slug: true, isActive: true } } } as const;
const cartInclude = {
  plan: { include: planInclude },
  _count: { select: { inventory: true } },
} as const;
type Line = Prisma.CartLineGetPayload<{ include: typeof cartInclude }>;

async function readLine(userId: string, lineId: string) {
  const line = await prisma.cartLine.findFirst({
    where: { id: lineId, userId, orderId: null },
    include: cartInclude,
  });
  if (!line || line.expiresAt <= new Date()) throw notFound();
  return line;
}
async function availablePlans(lines: Line[]) {
  const planIds = lines
    .filter((line) => line.plan.source !== "SUPPLIER" && line._count.inventory !== 1)
    .map((line) => line.planId);
  if (!planIds.length) return new Set<string>();
  const stock = await prisma.inventoryItem.groupBy({
    by: ["planId"],
    where: { planId: { in: planIds }, status: "AVAILABLE" },
  });
  return new Set(stock.flatMap(({ planId }) => planId ?? []));
}

function hasInternalStock(line: Line, available: Set<string>) {
  return line._count.inventory === 1 || available.has(line.planId);
}

async function preview(line: Line, available: Set<string>) {
  if (
    !(await isCartPlanAvailable(prisma, line.userId, line.plan)) ||
    line.signature !== cartSignature(line.plan)
  )
    return { amount: null, notice: "UNAVAILABLE" };
  try {
    const current =
      line.plan.source === "SUPPLIER"
        ? new Prisma.Decimal((await quote(line.planId)).amount)
        : hasInternalStock(line, available)
          ? cartPlanPrice(line.plan)
          : null;
    return {
      amount: current?.toString() ?? null,
      notice: cartNotice(line.amount, current, line.currency),
    };
  } catch (error) {
    if (error instanceof AppError && ["NO_CURRENT_OFFER", "NOT_FOUND"].includes(error.code))
      return { amount: null, notice: "UNAVAILABLE" };
    return { amount: null, notice: "PRICE_UNAVAILABLE" };
  }
}
export const cartRouter = Router();
cartRouter.get("/guest-preview", validate({ query: guestPreviewQuery }), async (_req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const { planIds } = res.locals.query as z.output<typeof guestPreviewQuery>;
  res.json({ items: await getPublicCartPlans(planIds) });
});
cartRouter.use(authenticate, (req, _res, next) => {
  if (req.user?.role !== "USER" || req.authMethod === "api-key")
    throw new AppError(403, "FORBIDDEN", "Customer account required");
  next();
});
cartRouter.get("/count", async (req, res) => {
  const count = await prisma.cartLine.count({
    where: { userId: req.user!.id, orderId: null, expiresAt: { gt: new Date() } },
  });
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ count });
});
cartRouter.get("/", async (req, res) => {
  await releaseExpiredCart();
  const lines = await prisma.cartLine.findMany({
    where: { userId: req.user!.id, orderId: null, expiresAt: { gt: new Date() } },
    include: cartInclude,
    orderBy: { expiresAt: "asc" },
  });
  const available = await availablePlans(lines);
  res.json({
    lines: await Promise.all(
      lines.map(async (line) => ({
        id: line.id,
        expiresAt: line.expiresAt,
        currency: line.currency,
        savedAmount: line.amount.toString(),
        supplier: line.plan.source === "SUPPLIER",
        product: line.plan.product.name,
        slug: line.plan.product.slug,
        label: line.plan.label,
        ...(await preview(line, available)),
      })),
    ),
  });
});
cartRouter.post(
  "/items",
  validate({ body: z.object({
    planId: id,
    renewalOrderItemId: id.optional(),
    expectedCustomerId: id.optional(),
  }).strict() }),
  async (req, res) => {
    const userId = req.user!.id;
    const expectedCustomerId: string | undefined = req.body.expectedCustomerId;
    if (expectedCustomerId && expectedCustomerId !== userId)
      throw new AppError(403, "CART_SESSION_CHANGED", "Customer session changed");
    await releaseExpiredCart();
    const idOfPlan: string = req.body.planId;
    const renewalOrderItemId: string | undefined = req.body.renewalOrderItemId;
    if (renewalOrderItemId)
      await assertRenewalCartPlan(prisma, userId, renewalOrderItemId, idOfPlan);
    const current = await prisma.productPlan.findUnique({
      where: { id: idOfPlan },
      include: planInclude,
    });
    if (!current || (expectedCustomerId && !current.isActive) ||
      !(await isCartPlanAvailable(prisma, userId, current))) throw unavailable();
    const signature = cartSignature(current);
    const estimate = current.source === "SUPPLIER" ? await quote(current.id) : null;
    const line = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR NO KEY UPDATE`;
      if (
        (await tx.user.findUnique({ where: { id: userId }, select: { role: true } }))?.role !==
        "USER"
      )
        throw new AppError(403, "FORBIDDEN", "Customer account required");
      const plan = await tx.productPlan.findUnique({
        where: { id: idOfPlan },
        include: planInclude,
      });
      if (
        !plan ||
        (expectedCustomerId && !plan.isActive) ||
        !(await isCartPlanAvailable(tx, userId, plan)) ||
        signature !== cartSignature(plan)
      )
        throw cartChanged();
      if (renewalOrderItemId) await assertRenewalCartPlan(tx, userId, renewalOrderItemId, idOfPlan);
      const existing = await tx.cartLine.findUnique({
        where: { userId_planId: { userId, planId: idOfPlan } },
      });
      if (existing) {
        const locked = await lockCartLine(tx, userId, existing.id);
        if (locked.orderId) {
          const order = await tx.order.findFirst({
            where: { id: locked.orderId, userId },
            select: { paymentStatus: true },
          });
          if (!order || !["PAID", "EXPIRED", "REFUNDED"].includes(order.paymentStatus))
            throw new AppError(409, "ORDER_IN_PROGRESS", "This item already has an open order");
        }
        if (!locked.orderId && locked.expiresAt > new Date()) return locked;
        await releaseCartLine(tx, locked.id);
      }
      if ((await tx.cartLine.count({ where: { userId, orderId: null } })) >= CART_LIMIT)
        throw new AppError(409, "CART_FULL", "The cart supports up to ten items");
      if (
        plan.source !== "SUPPLIER" &&
        !(await tx.inventoryItem.findFirst({
          where: { planId: plan.id, productId: plan.productId, status: "AVAILABLE" },
          select: { id: true },
        }))
      )
        throw unavailable();
      return tx.cartLine.create({
        data: {
          userId,
          planId: idOfPlan,
          signature,
          expiresAt: new Date(Date.now() + CART_LIFETIME),
          currency: estimate?.currency ?? plan.currency,
          amount: estimate ? new Prisma.Decimal(estimate.amount) : cartPlanPrice(plan),
        },
      });
    });
    res.status(201).json({ id: line.id, expiresAt: line.expiresAt });
  },
);
cartRouter.delete("/items/:id", validate({ params }), async (req, res) => {
  await prisma.$transaction(async (tx) => {
    const line = await lockCartLine(tx, req.user!.id, String(req.params.id));
    if (line.orderId) throw cartChanged();
    await releaseCartLine(tx, line.id);
  });
  res.status(204).end();
});
cartRouter.post(
  "/items/:id/review",
  validate({ params, body: z.object({ code, extraIds }).strict() }),
  async (req, res) => {
    const line = await readLine(req.user!.id, String(req.params.id));
    const extras: string[] = req.body.extraIds ?? [];
    if (extras.includes(line.id)) throw cartChanged();
    const lines = [line, ...(await Promise.all(extras.map((id) => readLine(line.userId, id))))];
    const checkout = req.app.locals.supplierCheckout as SupplierCheckout;
    const supplier = line.plan.source === "SUPPLIER";
    const privateStock = lines.some((item) => !item.plan.isActive);
    const [availability, available] = await Promise.all([
      Promise.all(lines.map((item) => isCartPlanAvailable(prisma, line.userId, item.plan))),
      availablePlans(lines),
    ]);
    if (
      (privateStock && lines.length !== 1) ||
      availability.some((allowed) => !allowed) ||
      lines.some(
        (item) =>
          item.signature !== cartSignature(item.plan) ||
          item.currency !== line.currency ||
          (item.plan.source === "SUPPLIER" ? lines.length > 1 : !hasInternalStock(item, available)),
      )
    )
      throw unavailable();
    const discountPercent = await discountPercentFor(prisma, line.userId, req.body.code);
    const firm = supplier ? await checkout.quote(line.userId, line.planId) : null;
    const items = lines.map((line) => ({
      line,
      price: firm ? new Prisma.Decimal(firm.amount) : cartPlanPrice(line.plan),
    }));
    const subtotal = items.reduce((total, item) => total.add(item.price), new Prisma.Decimal(0));
    if (subtotal.gte("10000000000"))
      throw new AppError(409, "INVOICE_LIMIT", "Split the invoice into smaller orders");
    const discount = discountFor(subtotal, discountPercent);
    const methods = firm?.methods ?? (await getPaymentConfig());
    await recordStorefrontStep(
      "cart_invoice_reviewed",
      String(req.headers["user-agent"] ?? ""),
    ).catch(() => {});
    res.json({
      invoice: {
        id: line.id,
        currency: line.currency,
        items: items.map(({ line, price }) => ({
          id: line.id,
          product: line.plan.product.name,
          label: line.plan.label,
          amount: price.toString(),
          notice: cartNotice(line.amount, price, line.currency),
        })),
        subtotal: subtotal.toString(),
        discount: discount.toString(),
        total: subtotal.sub(discount).toString(),
        revision: firm ? undefined : cartRevision(items),
        quoteId: firm?.id,
        expiresAt: new Date(
          Math.min(
            ...lines.map((item) => item.expiresAt.getTime()),
            firm ? Date.parse(firm.expiresAt) : Infinity,
          ),
        ),
        methods: { online: !privateStock && methods.online, cardToCard: methods.cardToCard },
      },
    });
  },
);
cartRouter.post(
  "/items/:id/pay",
  validate({
    params,
    body: z
      .object({
        subtotal: amount,
        total: amount,
        code,
        quoteId: id.optional(),
        extraIds,
        revision: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
        method: z.enum(["online", "card_to_card"]),
      })
      .strict(),
  }),
  async (req, res) => {
    const userId = req.user!.id;
    const lineId = String(req.params.id);
    const line = await prisma.cartLine.findFirst({
      where: { id: lineId, userId },
      include: { plan: { select: { source: true } } },
    });
    if (!line || (!line.orderId && line.expiresAt <= new Date())) throw notFound();
    const extras: string[] = req.body.extraIds ?? [];
    if (extras.includes(lineId)) throw cartChanged();
    const payment = {
      lineId,
      extraIds: extras,
      revision: req.body.revision,
      subtotal: req.body.subtotal,
      total: req.body.total,
      code: req.body.code,
    };
    const { started, body } =
      line.plan.source === "SUPPLIER"
        ? await (() => {
            if (!req.body.quoteId || extras.length || payment.revision) throw cartChanged();
            const checkout = req.app.locals.supplierCheckout as SupplierCheckout;
            return checkout.createWithStatus(userId, req.body.quoteId, req.body.method, payment);
          })()
        : await (() => {
            if (req.body.quoteId || !payment.revision) throw cartChanged();
            return createInternalCartOrder(userId, payment, req.body.method);
          })();
    if (started) {
      await recordStorefrontStep(
        "cart_payment_started",
        String(req.headers["user-agent"] ?? ""),
      ).catch(() => {});
    }
    res.status(201).json(body);
  },
);
