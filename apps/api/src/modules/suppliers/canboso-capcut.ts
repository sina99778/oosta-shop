import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../utils/httpError";
import { fetchCatalog } from "./catalog";
import type { PurchaseResult } from "./vente-purchase";

export const capcutSelectionSchema = z
  .object({
    supplier: z.literal("canboso2"),
    productId: z.literal("6af6f5d60f58e2de02d433a4"),
    name: z.literal("CAPCUT 7D  7D warranty"),
    deliveryType: z.literal("stock"),
    maximumCostUsd: z.literal("0.46"),
    walletExposureUsd: z.literal("0.47"),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type CapcutSelection = z.infer<typeof capcutSelectionSchema>;

async function request(path: string, reference?: string) {
  const key = process.env.CANBOSO2_API_KEY?.trim();
  if (!key) throw new Error("Supplier not configured");
  const response = await fetch("https://canboso.com/api/v2/telegram-buyer/" + path, {
    method: reference ? "POST" : "GET",
    headers: {
      "x-buyer-key": key,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(reference ? { "Idempotency-Key": reference } : {}),
    },
    body: reference
      ? JSON.stringify({ key, product_id: "6af6f5d60f58e2de02d433a4", quantity: 1 })
      : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Supplier request unavailable");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing response");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 100000) {
      await reader.cancel();
      throw new Error("Oversized response");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

async function checkWallet() {
  const wallet = z
    .object({
      success: z.literal(true),
      walletCurrency: z.literal("USD"),
      balance: z.union([z.string(), z.number()]),
    })
    .parse(await request("balance"));
  const amount = new Prisma.Decimal(wallet.balance);
  if (!amount.isFinite() || amount.lt("0.46") || amount.gt("0.47"))
    throw new Error("Wallet outside authorization");
}

export async function preflightCapcut(input: CapcutSelection) {
  const selection = capcutSelectionSchema.parse(input);
  try {
    const catalog = await fetchCatalog("canboso2");
    const offer = catalog.offers.find((o) => o.externalId === selection.productId);
    if (
      !offer ||
      offer.name !== selection.name ||
      offer.fingerprint !== selection.fingerprint ||
      offer.currency !== "USD" ||
      !new Prisma.Decimal(offer.cost).eq("0.46") ||
      (offer.stock ?? 0) < 1 ||
      offer.onRequest ||
      offer.flags.length > 0
    )
      throw new Error("Offer changed");
    await checkWallet();
    return { cost: "0.46" };
  } catch {
    throw new AppError(
      409,
      "QA_WALLET_EXPOSURE_CHANGED",
      "The selected offer or wallet is outside the authorization",
    );
  }
}

export async function sendCapcut(
  reference: string,
  expectedCost: string,
  selection: CapcutSelection,
  retainResponse: (raw: unknown) => Promise<void>,
): Promise<PurchaseResult> {
  if (!/^oosta-qa-[a-f0-9-]{36}$/.test(reference) || expectedCost !== "0.46") {
    throw new AppError(409, "QA_WALLET_EXPOSURE_CHANGED", "Purchase reference is invalid");
  }
  await preflightCapcut(selection);
  try {
    const raw = await request("purchase", reference);
    await retainResponse(raw);
    const result = z
      .object({
        success: z.literal(true),
        order: z.object({
          orderCode: z.string().min(1).max(100),
          status: z.literal("completed"),
          productId: z.literal(selection.productId).optional(),
          productName: z.literal(selection.name),
          productType: z.literal("account"),
          quantity: z.literal(1),
          finalQuantity: z.literal(1),
          bonusQuantity: z.literal(0),
        }),
        payment: z.object({
          amount: z.number().finite().positive(),
          currency: z.literal("USD"),
          balance: z.number().finite().nonnegative(),
        }),
        delivery: z.object({
          accounts: z
            .array(
              z.object({
                user: z.string().min(1).max(1000),
                password: z.string().min(1).max(1000),
                verifyEmail: z.string().max(1000).nullish(),
                expiryText: z.string().max(1000).nullish(),
                otherInfo: z.string().max(6000).nullish(),
              }),
            )
            .length(1),
        }),
      })
      .parse(raw);
    if (
      !new Prisma.Decimal(result.payment.amount).eq(expectedCost) ||
      result.payment.balance > 0.47
    )
      throw new Error("Charge changed");
    const account = result.delivery.accounts[0];
    return {
      state: "DELIVERED",
      supplierOrderId: result.order.orderCode,
      charged: expectedCost,
      delivery: [JSON.stringify(account)],
    };
  } catch {
    // Retain the reserved exposure. A failed response cannot prove there was no debit.
    return { state: "UNCERTAIN", delivery: [] };
  }
}
