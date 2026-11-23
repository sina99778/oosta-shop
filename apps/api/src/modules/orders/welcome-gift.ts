import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/httpError";

const prefix = "WELCOME-";
export const WELCOME_PERCENT = 15;
export const newWelcomeCode = () => prefix + randomBytes(12).toString("hex").toUpperCase();
export const isWelcomeCode = (code?: string) => code?.startsWith(prefix) === true;
type Reader = Pick<Prisma.TransactionClient, "welcomeGift" | "order">;
const pending: Prisma.OrderWhereInput = {
  paidAt: null,
  OR: [
    { paymentStatus: { in: ["PENDING", "PENDING_REVIEW", "REJECTED"] } },
    { paymentStatus: "FAILED", OR: [{ paymentAuthority: { not: null } }, { welcomeGift: true }] },
  ],
};

async function giftState(client: Reader, userId: string) {
  const settled = ["PAID", "PAID_PENDING_FULFILLMENT", "REFUNDED"] as const;
  const orders = await client.order.groupBy({
    by: ["paymentStatus"],
    where: {
      userId,
      OR: [{ paidAt: { not: null } }, { paymentStatus: { in: [...settled] } }, pending],
    },
    _max: { paidAt: true },
  });
  if (
    orders.some(
      (order) => order._max.paidAt || settled.some((status) => status === order.paymentStatus),
    )
  )
    return "USED" as const;
  return orders.length ? ("RESERVED" as const) : ("AVAILABLE" as const);
}

export async function getWelcomeGift(userId: string) {
  const gift = await prisma.welcomeGift.findUnique({ where: { userId }, select: { code: true } });
  if (!gift) return null;
  return { code: gift.code, percent: WELCOME_PERCENT, state: await giftState(prisma, userId) };
}

export async function welcomePercentFor(client: Reader, userId: string, code: string) {
  const gift = await client.welcomeGift.findUnique({ where: { userId }, select: { code: true } });
  if (code !== gift?.code)
    throw new AppError(400, "INVALID_DISCOUNT_CODE", "Discount code is invalid");
  const state = await giftState(client, userId);
  if (state === "USED")
    throw new AppError(409, "WELCOME_GIFT_USED", "The first purchase has already been paid");
  if (state === "RESERVED") throw welcomePending();
  return WELCOME_PERCENT;
}

const welcomePending = () =>
  new AppError(
    409,
    "WELCOME_GIFT_PENDING",
    "An existing payment must be resolved before using the welcome gift",
  );

// Call after locking the buyer row and before inserting a new order.
export async function assertNoWelcomeCheckout(tx: Prisma.TransactionClient, userId: string) {
  const openGift = await tx.order.findFirst({
    where: { userId, welcomeGift: true, ...pending },
    select: { id: true },
  });
  if (openGift) throw welcomePending();
}
