import { Prisma, type SupplierFulfillment } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/httpError";

const blocked = () =>
  new AppError(503, "SUPPLIER_WALLET_UNAVAILABLE", "Authorized supplier wallet is unavailable");
export async function walletAllowance(supplier: string, currency: string) {
  const budget = await prisma.supplierWalletBudget.findUnique({ where: { supplier } });
  if (
    !budget?.enabled ||
    budget.currency !== currency ||
    budget.activeReference ||
    budget.remainingAmount.lte(0)
  )
    throw blocked();
  return budget.remainingAmount;
}
export async function reserveWallet(tx: Prisma.TransactionClient, job: SupplierFulfillment) {
  await tx.$queryRaw`SELECT supplier FROM supplier_wallet_budgets WHERE supplier = ${job.supplier} FOR UPDATE`;
  const budget = await tx.supplierWalletBudget.findUnique({ where: { supplier: job.supplier } });
  if (!budget?.enabled || budget.currency !== job.currency) throw blocked();
  if (job.walletExposure) {
    if (budget.activeReference !== job.reference) throw blocked();
    return job;
  }
  if (budget.activeReference || budget.remainingAmount.lt(job.maximumCost)) throw blocked();
  const reserved = await tx.supplierFulfillment.update({
    where: { id: job.id },
    data: { walletExposure: budget.remainingAmount },
  });
  await tx.supplierWalletBudget.update({
    where: { supplier: job.supplier },
    data: { activeReference: job.reference, remainingAmount: 0 },
  });
  return reserved;
}
export async function reservedWallet(
  job: Pick<SupplierFulfillment, "reference" | "supplier" | "currency" | "walletExposure">,
) {
  const budget = await prisma.supplierWalletBudget.findUnique({
    where: { supplier: job.supplier },
  });
  if (
    !budget?.enabled ||
    budget.currency !== job.currency ||
    budget.activeReference !== job.reference ||
    !job.walletExposure
  )
    throw blocked();
  return job.walletExposure;
}
// Called in the same order-locked transaction as the terminal job transition.
export async function settleWallet(
  tx: Prisma.TransactionClient,
  job: SupplierFulfillment,
  charged: string,
) {
  if (!job.walletExposure) return;
  await tx.$queryRaw`SELECT supplier FROM supplier_wallet_budgets WHERE supplier = ${job.supplier} FOR UPDATE`;
  const budget = await tx.supplierWalletBudget.findUnique({ where: { supplier: job.supplier } });
  const amount = new Prisma.Decimal(charged);
  if (
    !budget ||
    budget.activeReference !== job.reference ||
    !amount.isFinite() ||
    amount.lt(0) ||
    amount.gt(job.walletExposure)
  )
    throw blocked();
  await tx.supplierWalletBudget.update({
    where: { supplier: job.supplier },
    data: { activeReference: null, remainingAmount: job.walletExposure.sub(amount) },
  });
}
