import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { env } from "../../config/env";
import { lockOrder } from "../../lib/orderLock";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/httpError";
import { readManualSupplier } from "./manual-payment";
import { queueOrderEmail } from "../../lib/mailer";

export const supplierAmount = z
  .string()
  .regex(/^\d{1,8}(\.\d{1,6})?$/)
  .refine((value) => new Prisma.Decimal(value).gt(0));
export async function requireManualAdmin(tx: Pick<Prisma.TransactionClient, "user">, id: string) {
  if (
    !env.SUPPLIER_MANUAL_APPROVAL ||
    (await tx.user.findUnique({ where: { id }, select: { role: true } }))?.role !== "ADMIN"
  )
    throw new AppError(403, "FORBIDDEN", "Administrator required");
}

export async function manualSupplierJobs(orderId?: string, id?: string) {
  if (!env.SUPPLIER_MANUAL_APPROVAL) return [];
  const rows = await prisma.supplierFulfillment.findMany({
    where: { id, orderId, order: { paymentMetadata: { path: ["manualSupplier"], equals: true } } },
    select: {
      id: true,
      orderId: true,
      supplier: true,
      state: true,
      currency: true,
      maximumCost: true,
      order: {
        select: {
          totalAmount: true,
          items: {
            select: { product: { select: { name: true } }, plan: { select: { label: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const budgets = await prisma.supplierWalletBudget.findMany({
    select: { supplier: true, remainingAmount: true },
  });
  return rows.map(({ order, ...job }) => ({
    ...job,
    amount: order.totalAmount.toString(),
    product: order.items[0]?.product.name,
    plan: order.items[0]?.plan.label,
    remaining:
      budgets.find((budget) => budget.supplier === job.supplier)?.remainingAmount.toString() ?? "0",
  }));
}

export async function manualSupplierPendingCount() {
  if (!env.SUPPLIER_MANUAL_APPROVAL) return { enabled: false, count: 0 };
  const count = await prisma.supplierFulfillment.count({
    where: {
      state: { in: ["AWAITING_PAYMENT", "AWAITING_FUNDS", "REVIEW", "UNCERTAIN"] },
      order: {
        paymentStatus: { in: ["PENDING_REVIEW", "PAID_PENDING_FULFILLMENT"] },
        paymentMetadata: { path: ["manualSupplier"], equals: true },
      },
    },
  });
  return { enabled: true, count };
}

export async function recordSupplierFunding(
  id: string,
  adminId: string,
  amount: string,
  requestId: string,
) {
  const value = new Prisma.Decimal(supplierAmount.parse(amount));
  return prisma.$transaction(async (tx) => {
    await requireManualAdmin(tx, adminId);
    const job = await tx.supplierFulfillment.findUniqueOrThrow({
      where: { id },
      include: { order: true },
    });
    await lockOrder(tx, job.orderId);
    const current = await tx.supplierFulfillment.findUniqueOrThrow({
      where: { id },
      include: { order: true },
    });
    if (current.state !== "AWAITING_FUNDS" || !readManualSupplier(current.order.paymentMetadata))
      throw new AppError(409, "SUPPLIER_ORDER_INELIGIBLE", "Supplier order requires review");
    await tx.$queryRaw`SELECT supplier FROM supplier_wallet_budgets WHERE supplier = ${job.supplier} FOR UPDATE`;
    const budget = await tx.supplierWalletBudget.findUnique({ where: { supplier: job.supplier } });
    if (!budget || budget.activeReference || budget.currency !== job.currency)
      throw new AppError(
        409,
        "SUPPLIER_WALLET_UNAVAILABLE",
        "Supplier wallet is in use or unavailable",
      );
    const key = "supplierAudit.funding." + requestId;
    const evidence = JSON.stringify({ id, adminId, amount: value.toString() });
    const previous = await tx.siteSetting.findUnique({ where: { key } });
    if (previous) {
      if (previous.value !== evidence)
        throw new AppError(409, "FUNDING_CONFLICT", "Funding request already used");
      return { remaining: budget.remainingAmount.toString() };
    }
    await tx.siteSetting.create({ data: { key, value: evidence } });
    const saved = await tx.supplierWalletBudget.update({
      where: { supplier: job.supplier },
      data: {
        enabled: true,
        authorizedAmount: { increment: value },
        remainingAmount: { increment: value },
      },
    });
    return { remaining: saved.remainingAmount.toString() };
  });
}

export async function refundManualSupplier(id: string, adminId: string, tracking: string) {
  return prisma.$transaction(async (tx) => {
    await requireManualAdmin(tx, adminId);
    const pointer = await tx.supplierFulfillment.findUniqueOrThrow({
      where: { id },
      select: { orderId: true },
    });
    await lockOrder(tx, pointer.orderId);
    const job = await tx.supplierFulfillment.findUniqueOrThrow({
      where: { id },
      include: { order: true },
    });
    if (
      !readManualSupplier(job.order.paymentMetadata) ||
      job.order.paymentStatus !== "PAID_PENDING_FULFILLMENT" ||
      !["AWAITING_FUNDS", "NO_CHARGE"].includes(job.state) ||
      job.walletExposure ||
      job.chargedCost ||
      job.supplierOrderId
    )
      throw new AppError(
        409,
        "SUPPLIER_REFUND_UNAVAILABLE",
        "Supplier debit must be resolved first",
      );
    await tx.siteSetting.create({
      data: {
        key: "supplierAudit." + randomUUID(),
        value: JSON.stringify({ action: "refund", id, adminId, tracking }),
      },
    });
    await tx.order.update({ where: { id: job.orderId }, data: { paymentStatus: "REFUNDED" } });
    await tx.supplierFulfillment.update({ where: { id }, data: { state: "REFUNDED" } });
    await queueOrderEmail(tx, job.orderId, "ORDER_REFUNDED");
    return { state: "REFUNDED" };
  });
}
