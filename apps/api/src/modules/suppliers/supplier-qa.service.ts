import { Prisma, type SupplierQaAttempt } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/httpError";
import {
  lookupVenteTest,
  qaSelectionSchema,
  defaultQaSelection,
  type QaSelection,
  preflightVenteTest,
  sendVenteTest,
  type PurchaseResult,
} from "./vente-purchase";
import { variantSchema } from "./variant";
import {
  capcutSelectionSchema,
  preflightCapcut,
  sendCapcut,
  type CapcutSelection,
} from "./canboso-capcut";

const purchaseSelectionSchema = z.union([qaSelectionSchema, capcutSelectionSchema]);
type PurchaseSelection = QaSelection | CapcutSelection;
function isCapcut(selection: PurchaseSelection): selection is CapcutSelection {
  return "supplier" in selection && selection.supplier === "canboso2";
}

const authorizationKey = "suppliers.qa.authorization";
const authorizationSchema = z
  .object({
    authorizationId: z.string().uuid(),
    enabled: z.boolean(),
    userId: z.string().min(1).max(100),
    budgetUsd: z.string().regex(/^\d{1,4}(\.\d{1,6})?$/),
    campaignCapUsd: z.literal("2.41").optional(),
    expiresAt: z.string().datetime(),
    selection: purchaseSelectionSchema.optional(),
  })
  .strict();
const qaVariant = variantSchema.parse({
  plan: "API_TEST",
  access: "PERSONAL",
  fulfillment: "CODE",
  delivery: "AUTOMATIC",
  warranty: { kind: "NONE" },
  region: "GLOBAL",
  quota: "SYNTHETIC_TEST",
});
async function authorization(tx: Prisma.TransactionClient = prisma) {
  const row = await tx.siteSetting.findUnique({ where: { key: authorizationKey } });
  if (!row) return null;
  try {
    return authorizationSchema.parse(JSON.parse(row.value));
  } catch {
    return null;
  }
}
async function requireAdmin(userId: string, tx: Prisma.TransactionClient = prisma) {
  if (
    (await tx.user.findUnique({ where: { id: userId }, select: { role: true } }))?.role !== "ADMIN"
  )
    throw new AppError(403, "FORBIDDEN", "Administrator access is required");
}
function attemptSelection(value: Prisma.JsonValue | null): PurchaseSelection {
  if (value === null) return defaultQaSelection;
  const parsed = purchaseSelectionSchema.safeParse(value);
  if (!parsed.success)
    throw new AppError(503, "QA_SELECTION_INVALID", "The saved purchase selection requires review");
  return parsed.data;
}
async function reservedCampaignUsd(tx: Prisma.TransactionClient = prisma) {
  const rows = await tx.supplierQaAttempt.findMany({
    where: { state: { not: "FAILED_NO_CHARGE" } },
    select: { expectedCost: true, chargedCost: true, selection: true },
  });
  return rows.reduce(
    (sum, row) =>
      sum.add(
        row.chargedCost ?? attemptSelection(row.selection).walletExposureUsd ?? row.expectedCost,
      ),
    new Prisma.Decimal(0),
  );
}
function summary(a: SupplierQaAttempt) {
  return {
    id: a.id,
    requestKey: a.requestKey,
    authorizationId: a.authorizationId,
    selection: attemptSelection(a.selection),
    state: a.state,
    userId: a.userId,
    expectedCost: a.expectedCost.toString(),
    chargedCost: a.chargedCost?.toString() ?? null,
    currency: a.currency,
    supplier: isCapcut(attemptSelection(a.selection)) ? "canboso2" : "ventebot",
    supplierOrderId: a.supplierOrderId,
    orderId: a.orderId,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}
export async function qaStatus() {
  const policy = await authorization();
  const attempts = await prisma.supplierQaAttempt.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const profile = policy
    ? await prisma.user.findUnique({
        where: { id: policy.userId },
        select: { id: true, name: true, email: true, role: true },
      })
    : null;
  return {
    authorizationId: policy?.authorizationId ?? null,
    configured: !!process.env.VENTEBOT_API_KEY?.trim(),
    enabled: !!policy?.enabled && Date.parse(policy.expiresAt) > Date.now(),
    budgetUsd: policy?.budgetUsd ?? null,
    selection: policy?.selection ?? defaultQaSelection,
    campaignCapUsd: policy?.campaignCapUsd ?? "1.58",
    campaignReservedUsd: (await reservedCampaignUsd()).toString(),
    expiresAt: policy?.expiresAt ?? null,
    profile,
    attempts: attempts.map(summary),
  };
}
function requireEnabled(policy: Awaited<ReturnType<typeof authorization>>) {
  if (
    !policy?.enabled ||
    Date.parse(policy.expiresAt) <= Date.now() ||
    new Prisma.Decimal(policy.budgetUsd).lte(0)
  )
    throw new AppError(
      403,
      "QA_NOT_AUTHORIZED",
      "A bounded operator authorization is required before spending",
    );
  return policy;
}
export async function beginQaPurchase(adminId: string, requestKey: string) {
  await requireAdmin(adminId);
  const policy = requireEnabled(await authorization());
  const old = await prisma.supplierQaAttempt.findUnique({ where: { requestKey } });
  if (old) {
    if (old.authorizationId !== policy.authorizationId || old.userId !== policy.userId)
      throw new AppError(
        409,
        "QA_REFERENCE_CONFLICT",
        "Purchase reference belongs to a different authorization",
      );
    return summary(old);
  }
  const selection = policy.selection ?? defaultQaSelection;
  const preflight = isCapcut(selection)
    ? await preflightCapcut(selection)
    : await preflightVenteTest(selection);
  const reserved = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${authorizationKey}))`;
    await requireAdmin(adminId, tx);
    const current = requireEnabled(await authorization(tx));
    if (
      current.authorizationId !== policy.authorizationId ||
      current.userId !== policy.userId ||
      JSON.stringify(current.selection ?? defaultQaSelection) !== JSON.stringify(selection)
    )
      throw new AppError(
        409,
        "QA_AUTHORIZATION_CHANGED",
        "Operator authorization changed during quote",
      );
    const repeated = await tx.supplierQaAttempt.findUnique({ where: { requestKey } });
    if (repeated) {
      if (
        repeated.authorizationId !== current.authorizationId ||
        repeated.userId !== current.userId
      )
        throw new AppError(409, "QA_REFERENCE_CONFLICT", "Purchase reference conflicts");
      return { attempt: repeated, send: false };
    }
    if (
      await tx.supplierQaAttempt.findFirst({
        where: { authorizationId: current.authorizationId, state: { not: "FAILED_NO_CHARGE" } },
      })
    )
      throw new AppError(409, "QA_ATTEMPT_EXISTS", "Another purchase is already reserved");
    if (
      await tx.supplierQaAttempt.findFirst({
        where: { state: { in: ["SENDING", "UNCERTAIN", "REVIEW"] } },
      })
    )
      throw new AppError(
        409,
        "QA_CAMPAIGN_REQUIRES_REVIEW",
        "An unresolved debit blocks further campaign spending",
      );
    const user = await tx.user.findUnique({
      where: { id: current.userId },
      select: { role: true },
    });
    if (user?.role !== "USER")
      throw new AppError(
        409,
        "QA_PROFILE_REQUIRED",
        "A dedicated ordinary test profile is required",
      );
    if (new Prisma.Decimal(selection.walletExposureUsd ?? preflight.cost).gt(current.budgetUsd))
      throw new AppError(409, "QA_BUDGET_EXCEEDED", "Test cost exceeds the authorized total");
    if (
      (await reservedCampaignUsd(tx))
        .add(selection.walletExposureUsd ?? preflight.cost)
        .gt(current.campaignCapUsd ?? "1.58")
    )
      throw new AppError(
        409,
        "QA_CAMPAIGN_BUDGET_EXCEEDED",
        "The cumulative authorized test budget would be exceeded",
      );
    const attempt = await tx.supplierQaAttempt.create({
      data: {
        authorizationId: current.authorizationId,
        requestKey,
        reference: "oosta-qa-" + requestKey,
        userId: current.userId,
        requestedById: adminId,
        expectedCost: preflight.cost,
        selection,
        state: "SENDING",
      },
    });
    return { attempt, send: true };
  });
  if (!reserved.send) return summary(reserved.attempt);
  let result: PurchaseResult;
  try {
    result = isCapcut(selection)
      ? await sendCapcut(
          reserved.attempt.reference,
          reserved.attempt.expectedCost.toString(),
          selection,
          async (raw) => {
            await prisma.siteSetting.create({
              data: {
                key: "suppliers.qa.response." + reserved.attempt.id,
                value: JSON.stringify(raw),
              },
            });
          },
        )
      : await sendVenteTest(
          reserved.attempt.reference,
          reserved.attempt.expectedCost.toString(),
          selection,
        );
  } catch (error) {
    result = {
      state:
        error instanceof AppError && error.code === "QA_WALLET_EXPOSURE_CHANGED"
          ? "FAILED_NO_CHARGE"
          : "UNCERTAIN",
      delivery: [],
    };
  }
  return applyResult(reserved.attempt.id, result);
}
export async function reconcileQaPurchase(adminId: string, id: string) {
  await requireAdmin(adminId);
  const attempt = await prisma.supplierQaAttempt.findUnique({ where: { id } });
  if (!attempt) throw new AppError(404, "NOT_FOUND", "Test purchase not found");
  if (
    ["DELIVERED", "FAILED_NO_CHARGE", "REVIEW", "STOCK_READY", "AWAITING_PAYMENT"].includes(
      attempt.state,
    )
  )
    return summary(attempt);
  if (isCapcut(attemptSelection(attempt.selection))) {
    throw new AppError(
      409,
      "QA_MANUAL_REVIEW",
      "The original supplier purchase requires review; no new purchase was sent",
    );
  }
  const result = await lookupVenteTest(
    attempt.reference,
    attempt.expectedCost.toString(),
    attemptSelection(attempt.selection) as QaSelection,
  );
  return applyResult(id, result);
}
async function applyResult(id: string, result: PurchaseResult) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM supplier_qa_attempts WHERE id=${id} FOR UPDATE`;
    const attempt = await tx.supplierQaAttempt.findUniqueOrThrow({ where: { id } });
    if (
      ["DELIVERED", "FAILED_NO_CHARGE", "REVIEW", "STOCK_READY", "AWAITING_PAYMENT"].includes(
        attempt.state,
      )
    )
      return summary(attempt);
    if (result.state === "UNCERTAIN") {
      if (attempt.state === "PENDING") return summary(attempt);
      return summary(
        await tx.supplierQaAttempt.update({ where: { id }, data: { state: "UNCERTAIN" } }),
      );
    }
    if (result.state === "FAILED_NO_CHARGE")
      return summary(
        await tx.supplierQaAttempt.update({
          where: { id },
          data: { state: attempt.chargedCost ? "REVIEW" : "FAILED_NO_CHARGE" },
        }),
      );
    if (
      !result.charged ||
      !result.supplierOrderId ||
      (attempt.supplierOrderId && attempt.supplierOrderId !== result.supplierOrderId)
    )
      return summary(
        await tx.supplierQaAttempt.update({ where: { id }, data: { state: "REVIEW" } }),
      );
    const heldSelection = attemptSelection(attempt.selection);
    if (
      "holdForCheckout" in heldSelection &&
      heldSelection.holdForCheckout &&
      result.state === "DELIVERED"
    ) {
      const category = await tx.category.upsert({
        where: { slug: "internal-supplier-qa" },
        create: { slug: "internal-supplier-qa", name: "Internal supplier QA" },
        update: {},
      });
      const product = await tx.product.create({
        data: {
          name: heldSelection.name + " — آزمون خصوصی کارت‌به‌کارت",
          slug: "internal-held-qa-" + attempt.id,
          type: "LICENSE",
          categoryId: category.id,
          description: "Operator-funded inventory for a private checkout test.",
          isActive: false,
        },
      });
      const plan = await tx.productPlan.create({
        data: {
          id: "internal-held-qa-plan-" + attempt.id,
          productId: product.id,
          label: heldSelection.name,
          source: "INTERNAL",
          price: 10050,
          currency: "IRR",
          isActive: false,
        },
      });
      await tx.inventoryItem.create({
        data: {
          type: "LICENSE",
          status: "AVAILABLE",
          productId: product.id,
          planId: plan.id,
          licenseKey: result.delivery[0],
        },
      });
      return summary(
        await tx.supplierQaAttempt.update({
          where: { id },
          data: {
            state: "STOCK_READY",
            chargedCost: result.charged,
            supplierOrderId: result.supplierOrderId,
          },
        }),
      );
    }
    let order = attempt.orderId
      ? await tx.order.findUniqueOrThrow({
          where: { id: attempt.orderId },
          include: { items: true },
        })
      : null;
    if (order) {
      // Serializes reconciliation with cancellation/refund and protects a closed customer vault.
      await tx.$queryRaw`SELECT id FROM orders WHERE id=${order.id} FOR UPDATE`;
      order = await tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: true },
      });
      if (order.userId !== attempt.userId || ["REFUNDED", "EXPIRED"].includes(order.paymentStatus))
        return summary(
          await tx.supplierQaAttempt.update({ where: { id }, data: { state: "REVIEW" } }),
        );
    }
    const selection = attemptSelection(attempt.selection);
    const realStock = selection.deliveryType === "stock";
    const productSlug = realStock
      ? "internal-supplier-qa-stock-" + selection.productId
      : "internal-supplier-qa";
    const planId = realStock
      ? "internal-supplier-qa-stock-plan-" + selection.productId
      : "internal-supplier-qa-plan";
    if (!order) {
      const category = await tx.category.upsert({
        where: { slug: "internal-supplier-qa" },
        create: { name: "Internal supplier QA", slug: "internal-supplier-qa" },
        update: {},
      });
      const product = await tx.product.upsert({
        where: { slug: productSlug },
        create: {
          name: realStock
            ? selection.name + " — خرید آزمایشی"
            : "آزمایش اتصال تأمین‌کننده — اشتراک واقعی نیست",
          slug: productSlug,
          type: isCapcut(selection) ? "ACCOUNT" : "LICENSE",
          description: realStock
            ? "Operator-funded real-stock test; no customer payment."
            : "Operator-funded API test; no customer payment.",
          categoryId: category.id,
          isActive: false,
        },
        update: {},
      });
      const plan = await tx.productPlan.upsert({
        where: { id: planId },
        create: {
          id: planId,
          productId: product.id,
          label: selection.name,
          source: "SUPPLIER",
          variant: realStock ? Prisma.DbNull : qaVariant,
          price: 0,
          isActive: false,
        },
        update: {},
      });
      order = await tx.order.create({
        data: {
          userId: attempt.userId,
          totalAmount: 0,
          currency: "IRR",
          paymentStatus: "PAID_PENDING_FULFILLMENT",
          paidAt: new Date(),
          paymentMetadata: {
            purpose: "SUPPLIER_QA",
            fundedBy: "OPERATOR_SUPPLIER_WALLET",
            supplierAttemptId: id,
            qaProductKind: realStock ? "REAL_STOCK" : "API_TEST",
            supplierProductId: selection.productId,
          },
          items: {
            create: {
              productId: product.id,
              planId: plan.id,
              quantity: 1,
              unitPrice: 0,
              lineTotal: 0,
              planSnapshot: {
                label: plan.label,
                durationDays: null,
                variant: realStock ? null : qaVariant,
                source: "SUPPLIER",
              },
            },
          },
        },
        include: { items: true },
      });
    }
    if (result.state === "DELIVERED") {
      const account = isCapcut(selection)
        ? (JSON.parse(result.delivery[0]) as {
            user: string;
            password: string;
            verifyEmail?: string | null;
            expiryText?: string | null;
            otherInfo?: string | null;
          })
        : null;
      await tx.inventoryItem.create({
        data: {
          type: account ? "ACCOUNT" : "LICENSE",
          status: "SOLD",
          productId: order.items[0].productId,
          planId: order.items[0].planId,
          orderItemId: order.items[0].id,
          soldAt: new Date(),
          accountEmail: account?.user,
          accountPassword: account?.password,
          licenseKey: account
            ? [account.verifyEmail, account.expiryText, account.otherInfo]
                .filter(Boolean)
                .join("\n") || null
            : result.delivery[0],
        },
      });
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "PAID" } });
    }
    return summary(
      await tx.supplierQaAttempt.update({
        where: { id },
        data: {
          state: result.state,
          chargedCost: result.charged,
          supplierOrderId: result.supplierOrderId,
          orderId: order.id,
        },
      }),
    );
  });
}
