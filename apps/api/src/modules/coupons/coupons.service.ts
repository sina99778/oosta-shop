// Discount codes. A coupon takes a percentage off an order's item subtotal.
//
// Uses are not kept in a counter: a coupon is "in use" by every order that holds
// it and is still pending or paid. An expired/failed/rejected order therefore
// gives its use back with no extra bookkeeping. Checkout locks the coupon row
// (FOR UPDATE) before counting, so two buyers can't both take the last use.

import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/httpError";

type Db = Prisma.TransactionClient | typeof prisma;

// Orders in these states hold a use of their coupon.
const HOLDING = ["PENDING", "PENDING_REVIEW", "PAID", "PAID_UNFULFILLED"] as const;

export const normalizeCode = (code: string) => code.trim().toUpperCase();

const invalid = (code: string, message: string, details?: unknown) =>
  new AppError(400, code, message, details);

// Validates `rawCode` for this buyer and subtotal and returns the coupon and the
// amount it takes off (rounded down to a whole unit). With `lock`, the coupon row
// is locked for the rest of the transaction — pass it when creating the order.
export async function applyCoupon(
  db: Db,
  rawCode: string,
  userId: string,
  subtotal: Prisma.Decimal,
  options: { lock?: boolean } = {},
) {
  const code = normalizeCode(rawCode);
  if (options.lock) {
    await db.$queryRaw`SELECT id FROM coupons WHERE code = ${code} FOR UPDATE`;
  }
  const coupon = await db.coupon.findUnique({ where: { code } });
  if (!coupon || !coupon.isActive) {
    throw invalid("COUPON_NOT_FOUND", "This discount code is not valid");
  }
  if (coupon.expiresAt && coupon.expiresAt <= new Date()) {
    throw invalid("COUPON_EXPIRED", "This discount code has expired");
  }
  if (coupon.botOnly && !(await db.telegramLink.count({ where: { userId } }))) {
    throw invalid("COUPON_BOT_ONLY", "This code is for customers who connected the Telegram bot");
  }
  if (coupon.minAmount && subtotal.lt(coupon.minAmount)) {
    throw invalid("COUPON_MIN_AMOUNT", "The order is below this code's minimum amount", {
      minAmount: Number(coupon.minAmount),
    });
  }
  const holding = { couponId: coupon.id, paymentStatus: { in: [...HOLDING] } };
  if (await db.order.count({ where: { ...holding, userId } })) {
    throw invalid("COUPON_ALREADY_USED", "You have already used this discount code");
  }
  if (coupon.maxUses != null && (await db.order.count({ where: holding })) >= coupon.maxUses) {
    throw invalid("COUPON_USED_UP", "This discount code has been fully used");
  }
  const discount = subtotal.mul(coupon.percent).div(100).floor();
  return { coupon, discount };
}

// ── Admin ────────────────────────────────────────────────────────────

export type CouponInput = {
  code: string;
  percent: number;
  maxUses?: number | null;
  minAmount?: number | null;
  expiresAt?: Date | null;
  isActive?: boolean;
  botOnly?: boolean;
};

export async function listCoupons() {
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
  const used = await prisma.order.groupBy({
    by: ["couponId"],
    where: { couponId: { in: coupons.map((c) => c.id) }, paymentStatus: { in: [...HOLDING] } },
    _count: { _all: true },
  });
  const usedBy = new Map(used.map((u) => [u.couponId, u._count._all]));
  return coupons.map((c) => ({
    id: c.id,
    code: c.code,
    percent: c.percent,
    maxUses: c.maxUses,
    minAmount: c.minAmount == null ? null : Number(c.minAmount),
    expiresAt: c.expiresAt,
    isActive: c.isActive,
    botOnly: c.botOnly,
    used: usedBy.get(c.id) ?? 0,
    createdAt: c.createdAt,
  }));
}

export async function createCoupon(input: CouponInput) {
  const code = normalizeCode(input.code);
  if (await prisma.coupon.findUnique({ where: { code } })) {
    throw new AppError(409, "CONFLICT", "A coupon with this code already exists");
  }
  return prisma.coupon.create({ data: { ...input, code } });
}

export async function updateCoupon(id: string, input: Partial<CouponInput>) {
  const data = { ...input, ...(input.code ? { code: normalizeCode(input.code) } : {}) };
  try {
    return await prisma.coupon.update({ where: { id }, data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") throw new AppError(404, "NOT_FOUND", "Coupon not found");
      if (error.code === "P2002") {
        throw new AppError(409, "CONFLICT", "A coupon with this code already exists");
      }
    }
    throw error;
  }
}

// Orders keep their discount amount; their link to the coupon is cleared.
export async function deleteCoupon(id: string) {
  const result = await prisma.coupon.deleteMany({ where: { id } });
  if (result.count === 0) throw new AppError(404, "NOT_FOUND", "Coupon not found");
}
