import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../utils/httpError";

export const QA_PRODUCT_ID = 2147483000;
export const qaSelectionSchema = z
  .object({
    productId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    deliveryType: z.enum(["api_test", "stock"]),
    name: z.string().trim().min(1).max(300),
    walletExposureUsd: z.enum(["1.57", "1.17"]).optional(),
    holdForCheckout: z.literal(true).optional(),
    maximumCostUsd: z
      .string()
      .regex(/^\d{1,2}(\.\d{1,6})?$/)
      .refine((v) => new Prisma.Decimal(v).gt(0) && new Prisma.Decimal(v).lte(1)),
  })
  .strict()
  .refine((v) =>
    v.deliveryType === "api_test"
      ? v.productId === QA_PRODUCT_ID && new Prisma.Decimal(v.maximumCostUsd).lte("0.05")
      : v.productId !== QA_PRODUCT_ID,
  )
  .refine(
    (v) =>
      !v.holdForCheckout ||
      (v.productId === 39 &&
        v.deliveryType === "stock" &&
        v.name === "Microsoft Office 365 E3" &&
        v.maximumCostUsd === "0.5" &&
        v.walletExposureUsd === "1.17"),
  );
export type QaSelection = z.infer<typeof qaSelectionSchema>;
export const defaultQaSelection: QaSelection = {
  productId: QA_PRODUCT_ID,
  deliveryType: "api_test",
  name: "VenteBot API Test",
  maximumCostUsd: "0.05",
};
function requireBoundedPurchase(selection: QaSelection) {
  if (
    selection.deliveryType === "stock" &&
    !(
      selection.productId === 54 &&
      selection.name === "iLovePdf Premium 1Yr" &&
      selection.maximumCostUsd === "0.4" &&
      selection.walletExposureUsd === "1.57"
    ) &&
    !(
      selection.productId === 39 &&
      selection.name === "Microsoft Office 365 E3" &&
      selection.maximumCostUsd === "0.5" &&
      selection.walletExposureUsd === "1.17" &&
      selection.holdForCheckout === true
    )
  )
    throw new AppError(
      503,
      "QA_PRICE_LOCK_UNAVAILABLE",
      "Supplier stock purchase has no enforceable price lock",
    );
}
const origin = "https://web-production-1c7b1.up.railway.app";
export type PurchaseResult = {
  state: "DELIVERED" | "PENDING" | "UNCERTAIN" | "FAILED_NO_CHARGE";
  supplierOrderId?: string;
  charged?: string;
  delivery: string[];
};
const uncertain = (): PurchaseResult => ({ state: "UNCERTAIN", delivery: [] });
async function request(path: string, body?: unknown) {
  const key = process.env.VENTEBOT_API_KEY?.trim();
  if (!key) throw new AppError(503, "SUPPLIER_NOT_CONFIGURED", "Supplier access is not configured");
  try {
    const response = await fetch(origin + path, {
      method: body ? "POST" : "GET",
      headers: {
        "X-Reseller-Key": key,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 512000) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    return null;
  } // Neither upstream bodies nor URLs/credentials reach a client error.
}
export async function preflightVenteTest(selection: QaSelection = defaultQaSelection) {
  selection = qaSelectionSchema.parse(selection);
  requireBoundedPurchase(selection);
  const catalog = z
    .object({
      success: z.literal(true),
      products: z.array(
        z.object({
          id: z.number().int(),
          name: z.string().optional(),
          api_test: z.boolean().optional(),
          delivery_type: z.string(),
        }),
      ),
    })
    .safeParse(await request("/api/reseller/products"));
  const product = catalog.success
    ? catalog.data.products.find((p) => p.id === selection.productId)
    : null;
  if (
    !product ||
    product.delivery_type !== selection.deliveryType ||
    (selection.deliveryType === "api_test"
      ? !product.api_test
      : product.api_test === true || product.name !== selection.name)
  )
    throw new AppError(
      409,
      "TEST_PRODUCT_UNAVAILABLE",
      "Explicit supplier test product is unavailable",
    );
  const parsed = z
    .object({
      success: z.literal(true),
      quote: z.object({
        product_id: z.literal(selection.productId),
        quantity: z.literal(1),
        total: z.union([z.string(), z.number()]),
        delivery_type: z.literal(selection.deliveryType),
        stock: z.number().int().positive(),
      }),
      wallet_balance: z.union([z.string(), z.number()]),
    })
    .safeParse(
      await request("/api/reseller/quote", { product_id: selection.productId, quantity: 1 }),
    );
  if (!parsed.success)
    throw new AppError(502, "TEST_QUOTE_UNAVAILABLE", "Supplier test quote is unavailable");
  try {
    const cost = new Prisma.Decimal(parsed.data.quote.total),
      balance = new Prisma.Decimal(parsed.data.wallet_balance);
    if (
      !cost.isFinite() ||
      cost.lte(0) ||
      cost.gt(selection.maximumCostUsd) ||
      cost.decimalPlaces() > 6 ||
      !balance.isFinite() ||
      balance.lt(cost) ||
      (selection.walletExposureUsd !== undefined && balance.gt(selection.walletExposureUsd))
    )
      throw new Error();
    return { cost: cost.toString(), currency: "USD" as const };
  } catch {
    throw new AppError(
      409,
      "TEST_COST_UNAVAILABLE",
      "Test cost or wallet balance is outside the permitted range",
    );
  }
}
function parseOrder(
  raw: unknown,
  reference: string,
  expectedCost: string,
  selection: QaSelection,
): PurchaseResult {
  const parsed = z
    .object({
      // The supplier issues negative identifiers for its explicit API-test orders.
      id: z
        .number()
        .int()
        .min(Number.MIN_SAFE_INTEGER)
        .max(Number.MAX_SAFE_INTEGER)
        .refine((v) => (selection.deliveryType === "api_test" ? v !== 0 : v > 0)),
      delivery_type: z.literal(selection.deliveryType),
      status: z.string(),
      product_id: z.literal(selection.productId),
      quantity: z.literal(1),
      amount_usd: z.union([z.string(), z.number()]),
      idempotency_key: z.literal(reference),
      customer_reference: z.literal(reference),
      items: z.array(z.object({ account_data: z.string().min(1).max(10000) })).max(1),
    })
    .safeParse(raw);
  if (!parsed.success) return uncertain();
  const order = parsed.data;
  try {
    const cost = new Prisma.Decimal(order.amount_usd);
    if (
      !cost.isFinite() ||
      cost.lte(0) ||
      cost.gt(selection.maximumCostUsd) ||
      !cost.eq(expectedCost)
    )
      return uncertain();
  } catch {
    return uncertain();
  }
  const result = {
    supplierOrderId: String(order.id),
    charged: new Prisma.Decimal(order.amount_usd).toString(),
    delivery: order.items.map((i) => i.account_data),
  };
  if (order.status === "COMPLETED" && result.delivery.length === 1)
    return { state: "DELIVERED", ...result };
  if (
    [
      "COMPLETED",
      "PAID_PENDING_DELIVERY",
      "AWAITING_ACTIVATION_INFO",
      "AWAITING_ACTIVATION",
    ].includes(order.status)
  )
    return { state: "PENDING", ...result, delivery: [] };
  return uncertain();
}
export async function sendVenteTest(
  reference: string,
  expectedCost = "0.01",
  selection: QaSelection = defaultQaSelection,
): Promise<PurchaseResult> {
  selection = qaSelectionSchema.parse(selection);
  requireBoundedPurchase(selection);
  if (selection.deliveryType === "stock") {
    const wallet = z
      .object({ success: z.literal(true), wallet_balance: z.union([z.string(), z.number()]) })
      .safeParse(await request("/api/reseller/me"));
    let valid = false;
    if (wallet.success) {
      try {
        const balance = new Prisma.Decimal(wallet.data.wallet_balance);
        valid =
          balance.isFinite() &&
          balance.gte(expectedCost) &&
          balance.lte(selection.walletExposureUsd!);
      } catch {
        /* Invalid wallet blocks dispatch. */
      }
    }
    if (!valid)
      throw new AppError(
        409,
        "QA_WALLET_EXPOSURE_CHANGED",
        "Wallet exposure differs from the explicit authorization",
      );
  }
  const body = await request("/api/reseller/orders", {
    product_id: selection.productId,
    quantity: 1,
    idempotency_key: reference,
    customer_reference: reference,
  });
  const parsed = z.object({ success: z.literal(true), order: z.unknown() }).safeParse(body);
  return parsed.success
    ? parseOrder(parsed.data.order, reference, expectedCost, selection)
    : uncertain();
}
export async function lookupVenteTest(
  reference: string,
  expectedCost = "0.01",
  selection: QaSelection = defaultQaSelection,
): Promise<PurchaseResult> {
  selection = qaSelectionSchema.parse(selection);
  const body = await request(
    "/api/reseller/orders/lookup?idempotency_key=" + encodeURIComponent(reference),
  );
  const parsed = z
    .object({
      success: z.literal(true),
      results: z
        .array(
          z.object({
            request_status: z.string(),
            idempotency_key: z.string(),
            customer_reference: z.string(),
            order: z.unknown().nullable(),
          }),
        )
        .max(1),
    })
    .safeParse(body);
  if (!parsed.success || parsed.data.results.length !== 1) return uncertain();
  const record = parsed.data.results[0];
  if (record.idempotency_key !== reference || record.customer_reference !== reference)
    return uncertain();
  if (record.request_status === "failed_no_charge" && record.order === null)
    return { state: "FAILED_NO_CHARGE", delivery: [] };
  if (record.request_status === "completed")
    return parseOrder(record.order, reference, expectedCost, selection);
  return uncertain();
}
