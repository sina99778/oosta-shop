import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/httpError";
import { authenticate, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { catalogs, matchingOffers } from "../suppliers/suppliers.service";

const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const alertParams = z.object({ planId: identifier });
const alertInput = z.object({ locale: z.enum(["fa", "en"]) }).strict();
const readInput = z.object({ id: identifier.optional() }).strict();
const planSelect = {
  id: true,
  source: true,
  durationDays: true,
  variant: true,
  supplierMappings: true,
  product: { select: { id: true, slug: true, name: true } },
} satisfies Prisma.ProductPlanSelect;
const active = { isActive: true, product: { isActive: true } };
const noteSelect = {
  id: true,
  kind: true,
  title: true,
  body: true,
  href: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.UserNotificationSelect;
type Plan = Prisma.ProductPlanGetPayload<{ select: typeof planSelect }>;
type StockClient = Pick<Prisma.TransactionClient, "inventoryItem" | "siteSetting">;

async function stock(
  client: StockClient,
  plan: Plan,
  snapshots?: Awaited<ReturnType<typeof catalogs>>,
) {
  if (plan.source === "SUPPLIER") {
    const offers = matchingOffers(plan, snapshots ?? (await catalogs(client)));
    return {
      available: offers.some(({ offer }) => (offer.stock ?? 0) > 0),
      requestOnly: offers.length > 0,
    };
  }
  const row = await client.inventoryItem.findFirst({
    where: { planId: plan.id, productId: plan.product.id, status: "AVAILABLE" },
    select: { id: true },
  });
  return { available: Boolean(row), requestOnly: false };
}

export const stockAlertsRouter = Router();
const customer = [authenticate, requireRole("USER")];

stockAlertsRouter.get(
  "/stock-alerts/:planId",
  ...customer,
  validate({ params: alertParams }),
  async (req, res) => {
    const row = await prisma.stockAlert.findFirst({
      where: { userId: req.user!.id, planId: String(req.params.planId), plan: active },
      select: { id: true },
    });
    res.json({ active: Boolean(row) });
  },
);

stockAlertsRouter.post(
  "/stock-alerts/:planId",
  ...customer,
  validate({ params: alertParams, body: alertInput }),
  async (req, res) => {
    const userId = req.user!.id;
    const planId = String(req.params.planId);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR NO KEY UPDATE`;
      const role = (await tx.user.findUnique({ where: { id: userId }, select: { role: true } }))
        ?.role;
      if (role !== "USER") throw new AppError(403, "FORBIDDEN", "Customer account required");
      const plan = await tx.productPlan.findFirst({
        where: { id: planId, ...active },
        select: planSelect,
      });
      if (!plan) throw new AppError(404, "NOT_FOUND", "Plan not found");
      const where = { userId, planId };
      if (await tx.stockAlert.findUnique({ where: { userId_planId: where } })) return;
      const state = await stock(tx, plan);
      if (state.available || state.requestOnly)
        throw new AppError(409, "STOCK_ALERT_NOT_NEEDED", "This choice is currently available");
      if ((await tx.stockAlert.count({ where: { userId, plan: active } })) >= 20)
        throw new AppError(409, "STOCK_ALERT_LIMIT", "You can watch up to twenty plans");
      await tx.stockAlert.create({ data: { ...where, locale: req.body.locale } });
    });
    res.json({ active: true });
  },
);

stockAlertsRouter.delete(
  "/stock-alerts/:planId",
  ...customer,
  validate({ params: alertParams }),
  async (req, res) => {
    await prisma.stockAlert.deleteMany({
      where: { userId: req.user!.id, planId: String(req.params.planId) },
    });
    res.sendStatus(204);
  },
);

stockAlertsRouter.get("/notifications", ...customer, async (req, res) => {
  const userId = req.user!.id;
  const [notifications, unreadCount] = await prisma.$transaction(
    [
      prisma.userNotification.findMany({
        where: { userId },
        select: noteSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50,
      }),
      prisma.userNotification.count({ where: { userId, readAt: null } }),
    ],
    { isolationLevel: "RepeatableRead" },
  );
  res.json({ notifications, unreadCount });
});

stockAlertsRouter.get("/notifications/count", ...customer, async (req, res) => {
  const count = await prisma.userNotification.count({
    where: { userId: req.user!.id, readAt: null },
  });
  res.json({ count });
});

stockAlertsRouter.patch(
  "/notifications/read",
  ...customer,
  validate({ body: readInput }),
  async (req, res) => {
    const userId = req.user!.id;
    const id = req.body.id as string | undefined;
    const result = await prisma.userNotification.updateMany({
      where: { userId, id, readAt: null },
      data: { readAt: new Date() },
    });
    if (
      id &&
      !result.count &&
      !(await prisma.userNotification.findFirst({ where: { id, userId }, select: { id: true } }))
    )
      throw new AppError(404, "NOT_FOUND", "Notification not found");
    res.sendStatus(204);
  },
);

const pageSize = 80;
export async function sweepStockAlerts(after: string | null): Promise<string | null> {
  const alerts = await prisma.stockAlert.findMany({
    where: { ...(after ? { id: { gt: after } } : {}), plan: active },
    orderBy: { id: "asc" },
    take: pageSize,
    select: { id: true, userId: true, locale: true, plan: { select: planSelect } },
  });
  if (!alerts.length) return null;
  const snapshots = alerts.some(({ plan }) => plan.source === "SUPPLIER")
    ? await catalogs()
    : undefined;
  const ready = new Map<string, boolean>();
  for (const alert of alerts) {
    if (!ready.has(alert.plan.id))
      ready.set(alert.plan.id, (await stock(prisma, alert.plan, snapshots)).available);
    if (!ready.get(alert.plan.id)) continue;
    await prisma.$transaction(async (tx) => {
      const removed = await tx.stockAlert.deleteMany({
        where: { id: alert.id, plan: active },
      });
      if (!removed.count) return;
      const user = await tx.user.findUnique({
        where: { id: alert.userId },
        select: { role: true, email: true, verifiedRecoveryEmail: true },
      });
      if (user?.role !== "USER") return;
      const fa = alert.locale === "fa";
      const kind = "STOCK_AVAILABLE";
      const note = await tx.userNotification.create({
        data: {
          userId: alert.userId,
          kind,
          key: `stock:${alert.id}`,
          locale: alert.locale,
          title: fa ? "پلن موردنظرت موجود شد" : "Your plan is back in stock",
          body: alert.plan.product.name,
          href: `/${alert.locale}/products/${encodeURIComponent(alert.plan.product.slug)}?plan=${encodeURIComponent(alert.plan.id)}`,
        },
        select: { id: true },
      });
      if (user.email && user.email === user.verifiedRecoveryEmail)
        await tx.emailOutbox.create({ data: { orderId: note.id, kind, to: user.email } });
    });
  }
  return alerts.length === pageSize ? alerts.at(-1)!.id : null;
}

export function startStockAlerts() {
  let after: string | null = null;
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      after = await sweepStockAlerts(after);
    } catch {
      console.error("[stock-alerts] sweep failed");
    } finally {
      running = false;
    }
  }, 15000);
  timer.unref();
  return () => clearInterval(timer);
}
