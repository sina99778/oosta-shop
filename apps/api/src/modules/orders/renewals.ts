import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/httpError";
import { readVariant, variantKey } from "../suppliers/variant";
import { cartChanged } from "./cart-state";
import { addOrderNotification } from "./order-notifications";

const day = 86_400_000;
const reminderLeadDays = 3;
const reminderLead = reminderLeadDays * day;
export const renewalEmailPrefix = "SUBSCRIPTION_RENEWAL:";

const orderSelect = {
  id: true,
  paymentStatus: true,
  paymentMetadata: true,
  createdAt: true,
  paidAt: true,
  user: { select: { role: true } },
} satisfies Prisma.OrderSelect;
const reminderOrderSelect = {
  ...orderSelect,
  userId: true,
  user: { select: { role: true, email: true, verifiedRecoveryEmail: true } },
} satisfies Prisma.OrderSelect;
const itemSelect = {
  id: true,
  productId: true,
  quantity: true,
  planSnapshot: true,
  plan: {
    select: {
      id: true,
      productId: true,
      label: true,
      source: true,
      variant: true,
      durationDays: true,
      isActive: true,
    },
  },
  product: { select: { type: true, isActive: true } },
  fulfilledItems: { select: { status: true, soldAt: true } },
} satisfies Prisma.OrderItemSelect;
type RenewalOrder = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;
type ReminderOrder = Prisma.OrderGetPayload<{ select: typeof reminderOrderSelect }>;
type RenewalItem = Prisma.OrderItemGetPayload<{ select: typeof itemSelect }>;

function asObject(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

export function renewalEstimate(order: RenewalOrder, item: RenewalItem, now = new Date()) {
  const metadata = asObject(order.paymentMetadata);
  const snapshot = asObject(item.planSnapshot);
  const duration = snapshot?.durationDays;
  if (
    order.user.role !== "USER" ||
    order.paymentStatus !== "PAID" ||
    metadata?.purpose === "SUPPLIER_QA" ||
    metadata?.qaCampaign ||
    metadata?.privateStockQa === true ||
    item.product.type === "GIFTCARD" ||
    typeof duration !== "number" ||
    !Number.isSafeInteger(duration) ||
    duration < 1 ||
    item.quantity < 1 ||
    item.fulfilledItems.length !== item.quantity ||
    item.fulfilledItems.some((stock) => stock.status !== "SOLD")
  ) {
    return null;
  }

  const deliveryDates = item.fulfilledItems.flatMap(({ soldAt }) => (soldAt ? [soldAt] : []));
  // A delayed supplier delivery cannot be dated using the original payment.
  const startedAt =
    deliveryDates.length === item.quantity
      ? Math.max(...deliveryDates.map((date) => date.getTime()))
      : deliveryDates.length === 0 && snapshot?.source === "INTERNAL"
        ? order.paidAt?.getTime()
        : undefined;
  if (startedAt === undefined || startedAt < order.createdAt.getTime() || startedAt > +now)
    return null;
  const estimatedEndAt = new Date(startedAt + duration * day);
  if (!Number.isFinite(+estimatedEndAt)) return null;

  const priorVariant = readVariant(snapshot?.variant);
  const currentVariant = readVariant(item.plan.variant);
  const sameVariant =
    snapshot?.variant == null && item.plan.variant == null
      ? snapshot?.label === item.plan.label
      : !!priorVariant &&
        !!currentVariant &&
        variantKey(priorVariant, duration) === variantKey(currentVariant, duration);
  const planId =
    item.product.isActive &&
    item.plan.isActive &&
    item.plan.productId === item.productId &&
    snapshot?.source === item.plan.source &&
    item.plan.durationDays === duration &&
    sameVariant
      ? item.plan.id
      : null;
  const daysRemaining = Math.max(0, Math.ceil((+estimatedEndAt - +now) / day));
  return { estimatedEndAt, daysRemaining, planId };
}

function reminderDue(order: ReminderOrder, item: RenewalItem, now: Date) {
  const renewal = renewalEstimate(order, item, now);
  return (
    !!order.user.email &&
    order.user.verifiedRecoveryEmail === order.user.email &&
    !!renewal?.planId &&
    (item.plan.durationDays ?? 0) > reminderLeadDays &&
    +renewal.estimatedEndAt > +now &&
    +renewal.estimatedEndAt - reminderLead <= +now
  );
}

export async function assertRenewalCartPlan(
  client: Pick<Prisma.TransactionClient, "orderItem">,
  userId: string,
  itemId: string,
  planId: string,
) {
  const item = await client.orderItem.findFirst({
    where: { id: itemId, order: { userId } },
    select: { ...itemSelect, order: { select: orderSelect } },
  });
  if (!item) throw new AppError(404, "NOT_FOUND", "Order item not found");
  if (renewalEstimate(item.order, item)?.planId !== planId) throw cartChanged();
}

export async function queueRenewalReminders(now = new Date()) {
  let cursor: string | undefined;
  for (;;) {
    // A matching current plan has the purchased duration. Bound both possible
    // start dates in SQL, then verify the complete delivery and snapshot below.
    const candidates = await prisma.$queryRaw<{ id: string }[]>`
      SELECT i.id
      FROM order_items i
      JOIN orders o ON o.id = i."orderId"
      JOIN users u ON u.id = o."userId"
      JOIN product_plans p ON p.id = i."planId" AND p."productId" = i."productId"
      JOIN products product ON product.id = i."productId"
      CROSS JOIN LATERAL (
        SELECT ${now.getTime() / 1000}::double precision -
          p."durationDays"::double precision * ${day / 1000}::double precision
          AS "startAfter"
      ) due
      WHERE o."paymentStatus" = 'PAID'
        AND u.role = 'USER' AND u."verifiedRecoveryEmail" = u.email
        AND p."isActive" AND p."durationDays" > ${reminderLeadDays}
        AND product."isActive" AND product.type <> 'GIFTCARD'
        AND i."planSnapshot" IS NOT NULL
        AND (
          (p.source = 'INTERNAL' AND EXTRACT(EPOCH FROM o."paidAt") > due."startAfter"
            AND EXTRACT(EPOCH FROM o."paidAt") <= due."startAfter" + ${reminderLead / 1000})
          OR EXISTS (
            SELECT 1 FROM inventory_items unit
            WHERE unit."orderItemId" = i.id AND unit.status = 'SOLD'
              AND EXTRACT(EPOCH FROM unit."soldAt") > due."startAfter"
              AND EXTRACT(EPOCH FROM unit."soldAt") <= due."startAfter" + ${reminderLead / 1000}
          )
        )
        AND NOT EXISTS (
          SELECT 1 FROM email_outbox e
          WHERE e."orderId" = o.id AND e.kind = ${renewalEmailPrefix} || i.id
        )
        ${cursor ? Prisma.sql`AND i.id > ${cursor}` : Prisma.empty}
      ORDER BY i.id
      LIMIT 100
    `;
    if (!candidates.length) return;
    const items = await prisma.orderItem.findMany({
      where: { id: { in: candidates.map(({ id }) => id) } },
      select: { ...itemSelect, order: { select: reminderOrderSelect } },
      orderBy: { id: "asc" },
    });
    const jobs = items.flatMap((item) =>
      reminderDue(item.order, item, now) && item.order.user.email
        ? [{ item, to: item.order.user.email }]
        : [],
    );
    if (jobs.length)
      await prisma.$transaction(async (tx) => {
        await tx.emailOutbox.createMany({
          data: jobs.map(({ item, to }) => ({
            orderId: item.order.id,
            kind: renewalEmailPrefix + item.id,
            to,
            nextAt: now,
          })),
          skipDuplicates: true,
        });
        for (const { item } of jobs)
          await addOrderNotification(
            tx,
            item.order.userId,
            item.order.id,
            "SUBSCRIPTION_RENEWAL",
            item.id,
          );
      });
    if (candidates.length < 100) return;
    cursor = candidates[candidates.length - 1].id;
  }
}

export async function isRenewalReminderDue(
  orderId: string,
  kind: string,
  recipient: string,
  now: Date,
) {
  const item = await prisma.orderItem.findFirst({
    where: { id: kind.slice(renewalEmailPrefix.length), orderId },
    select: { ...itemSelect, order: { select: reminderOrderSelect } },
  });
  return !!item && item.order.user.email === recipient && reminderDue(item.order, item, now);
}
