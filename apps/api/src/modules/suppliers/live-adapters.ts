import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { fetchCatalog, supplierEndpoints, type SupplierId } from "./catalog";
import type { SupplierAdapter, SupplierRegistry } from "./fulfillment";
import { reservedWallet, walletAllowance } from "./wallet-budget";

type LiveSupplier = "canboso" | "canboso2" | "ventebot";
const missing = () => ({ state: "NOT_FOUND" as const });
const money = z
  .union([z.string().regex(/^\d{1,12}(\.\d{1,6})?$/), z.number().finite().nonnegative()])
  .transform((v) => new Prisma.Decimal(v))
  .refine((v) => v.isFinite() && v.gte(0) && v.decimalPlaces() <= 6);
const text = z.string().min(1).max(10000);
async function request(supplier: LiveSupplier, path: string, body?: unknown, reference?: string) {
  const config = supplierEndpoints[supplier];
  const key = process.env[config.env]?.trim();
  if (!key) throw new Error("Supplier unavailable");
  const origin = new URL(config.url).origin;
  const response = await fetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: {
      [config.header]: key,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(reference ? { "Idempotency-Key": reference } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Supplier unavailable");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Supplier unavailable");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 512000) {
      await reader.cancel();
      throw new Error("Supplier unavailable");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
async function balance(supplier: LiveSupplier) {
  const raw = await request(
    supplier,
    supplier === "ventebot" ? "/api/reseller/me" : "/api/v2/telegram-buyer/balance",
  );
  return supplier === "ventebot"
    ? z.object({ success: z.literal(true), wallet_balance: money }).parse(raw).wallet_balance
    : z
        .object({ success: z.literal(true), walletCurrency: z.literal("USD"), balance: money })
        .parse(raw).balance;
}
async function currentOffer(supplier: LiveSupplier, externalId: string) {
  const offer = (await fetchCatalog(supplier)).offers.find((o) => o.externalId === externalId);
  if (
    !offer ||
    offer.currency !== "USD" ||
    (offer.stock ?? 0) < 1 ||
    offer.onRequest ||
    offer.flags.length
  )
    throw new Error("Offer unavailable");
  return offer;
}
async function currentPrice(supplier: LiveSupplier, externalId: string, catalogCost: string) {
  if (supplier !== "ventebot")
    return { cost: new Prisma.Decimal(catalogCost), wallet: await balance(supplier) };
  const data = z
    .object({
      success: z.literal(true),
      quote: z.object({
        product_id: z.number().int().positive().safe(),
        quantity: z.literal(1),
        total: money.refine((v) => v.gt(0)),
        delivery_type: z.literal("stock"),
        stock: z.number().int().positive(),
      }),
      wallet_balance: money,
    })
    .parse(await request(supplier, "/api/reseller/quote", { product_id: externalId, quantity: 1 }));
  if (String(data.quote.product_id) !== externalId) throw new Error("Quote identity mismatch");
  return { cost: data.quote.total, wallet: data.wallet_balance };
}
function credential(line: string, type: "ACCOUNT" | "LICENSE" | "GIFTCARD") {
  if (type === "LICENSE") return { type, licenseKey: text.parse(line) };
  if (type === "GIFTCARD") return { type, giftCardCode: text.parse(line) };
  const separator = line.includes("|") ? "|" : ":";
  const at = line.indexOf(separator);
  if (at <= 0) throw new Error("Unsupported account delivery");
  const rest = line.slice(at + 1).split(separator === "|" ? "|" : "\n");
  return {
    type,
    accountEmail: text.parse(line.slice(0, at).trim()),
    accountPassword: text.parse(rest[0]),
    ...(rest.length > 1 ? { deliveryInstructions: rest.slice(1).join("\n") } : {}),
  };
}
async function jobFor(reference: string, supplier: string, externalId: string) {
  const job = await prisma.supplierFulfillment.findUnique({
    where: { reference },
    include: { order: { include: { items: { include: { product: true } } } } },
  });
  if (
    !job ||
    job.supplier !== supplier ||
    job.externalId !== externalId ||
    job.order.items.length !== 1
  )
    throw new Error("Purchase unavailable");
  return job;
}
async function retain(reference: string, raw: unknown) {
  await prisma.supplierFulfillment.update({
    where: { reference },
    data: { result: { upstreamResponse: raw } as Prisma.InputJsonValue },
  });
}
function venteResult(
  raw: unknown,
  input: { reference: string; externalId: string },
  type: "ACCOUNT" | "LICENSE" | "GIFTCARD",
) {
  const order = z
    .object({
      id: z.number().int().positive().safe(),
      product_id: z.number().int().positive().safe(),
      quantity: z.literal(1),
      delivery_type: z.literal("stock"),
      idempotency_key: z.literal(input.reference),
      customer_reference: z.literal(input.reference),
      amount_usd: money.refine((v) => v.gt(0)),
      status: z.enum(["COMPLETED", "PAID_PENDING_DELIVERY"]),
      items: z.array(z.object({ account_data: text })).max(1),
    })
    .parse(raw);
  if (String(order.product_id) !== input.externalId) throw new Error("Purchase identity mismatch");
  const paid = {
    ...input,
    quantity: 1,
    currency: "USD",
    amount: order.amount_usd.toString(),
    supplierOrderId: String(order.id),
  };
  if (order.status === "PAID_PENDING_DELIVERY") return { state: "PENDING", ...paid };
  if (order.items.length !== 1) throw new Error("Delivery unavailable");
  return { state: "COMPLETE", ...paid, credential: credential(order.items[0].account_data, type) };
}
function canbosoResult(raw: unknown, input: { reference: string; externalId: string }) {
  const data = z
    .object({
      success: z.literal(true),
      order: z.object({
        orderCode: text,
        productId: z.literal(input.externalId),
        productType: z.literal("account"),
        status: z.literal("completed"),
        quantity: z.literal(1),
        finalQuantity: z.literal(1),
        bonusQuantity: z.literal(0),
      }),
      payment: z.object({ currency: z.literal("USD"), amount: money.refine((v) => v.gt(0)) }),
      delivery: z.object({
        accounts: z
          .array(
            z.object({
              user: text,
              password: text,
              verifyEmail: z.string().max(1000).nullish(),
              expiryText: z.string().max(1000).nullish(),
              otherInfo: z.string().max(6000).nullish(),
            }),
          )
          .length(1),
      }),
    })
    .parse(raw);
  const account = data.delivery.accounts[0];
  const notes = [
    account.verifyEmail ? "ایمیل بازیابی: " + account.verifyEmail : null,
    account.expiryText ? "انقضا: " + account.expiryText : null,
    account.otherInfo,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    state: "COMPLETE",
    ...input,
    quantity: 1,
    currency: "USD",
    amount: data.payment.amount.toString(),
    supplierOrderId: data.order.orderCode,
    credential: {
      type: "ACCOUNT",
      accountEmail: account.user,
      accountPassword: account.password,
      ...(notes ? { deliveryInstructions: notes } : {}),
    },
  };
}
export function walletAdapter(supplier: LiveSupplier): SupplierAdapter {
  return {
    capabilities: { priceCeiling: false, walletExposure: true, idempotency: true, lookup: true },
    async quote(input) {
      if (input.currency !== "USD" || (supplier !== "ventebot" && input.productType !== "ACCOUNT"))
        throw new Error("Unsupported product");
      const limit = await walletAllowance(supplier, input.currency);
      const offer = await currentOffer(supplier, input.externalId);
      const { wallet, cost } = await currentPrice(supplier, input.externalId, offer.cost);
      if (cost.lte(0) || cost.gt(input.maximumCost) || wallet.lt(cost) || wallet.gt(limit))
        throw new Error("Wallet unavailable");
      // Local customer price validity, not an upstream price lock.
      return {
        quoteId: randomUUID(),
        externalId: input.externalId,
        quantity: 1,
        currency: "USD",
        cost: cost.toString(),
        expiresAt: new Date(Date.now() + 900000).toISOString(),
      };
    },
    async purchase(input) {
      const identity = { reference: input.reference, externalId: input.externalId };
      let type: "ACCOUNT" | "LICENSE" | "GIFTCARD";
      try {
        const job = await jobFor(input.reference, supplier, input.externalId);
        if (
          job.state !== "SENDING" ||
          job.currency !== input.currency ||
          !job.maximumCost.eq(input.maximumCost) ||
          job.quoteId !== input.quoteId
        )
          throw new Error("Purchase unavailable");
        type = job.order.items[0].product.type;
        if (supplier !== "ventebot" && type !== "ACCOUNT") throw new Error("Unsupported product");
        const limit = await reservedWallet(job);
        const offer = await currentOffer(supplier, input.externalId);
        const { wallet, cost } = await currentPrice(supplier, input.externalId, offer.cost);
        if (
          offer.fingerprint !== job.fingerprint ||
          cost.gt(job.maximumCost) ||
          wallet.gt(limit) ||
          wallet.lt(cost) ||
          job.expiresAt.getTime() <= Date.now()
        )
          throw new Error("Purchase unavailable");
      } catch {
        // No purchase endpoint has been called; returning the reservation is safe.
        return { state: "NO_CHARGE", ...identity };
      }
      try {
        if (supplier === "ventebot") {
          const response = await request(supplier, "/api/reseller/orders", {
            product_id: input.externalId,
            quantity: 1,
            idempotency_key: input.reference,
            customer_reference: input.reference,
          });
          await retain(input.reference, response);
          const raw = z.object({ success: z.literal(true), order: z.unknown() }).parse(response);
          return venteResult(raw.order, identity, type);
        }
        const raw = await request(
          supplier,
          "/api/v2/telegram-buyer/purchase",
          {
            key: process.env[supplierEndpoints[supplier].env]!.trim(),
            product_id: input.externalId,
            quantity: 1,
          },
          input.reference,
        );
        await retain(input.reference, raw);
        return canbosoResult(raw, identity);
      } catch {
        return missing();
      } // No new reference or vendor fallback after an ambiguous debit.
    },
    async lookup(input) {
      try {
        const job = await jobFor(input.reference, supplier, input.externalId);
        if (supplier !== "ventebot") {
          // Recover a retained response without replaying the purchase; lost responses require manual review.
          const saved = z.object({ upstreamResponse: z.unknown() }).safeParse(job.result);
          return saved.success
            ? canbosoResult(saved.data.upstreamResponse, {
                reference: input.reference,
                externalId: input.externalId,
              })
            : missing();
        }
        const data = z
          .object({
            success: z.literal(true),
            results: z
              .array(
                z.object({
                  idempotency_key: z.literal(input.reference),
                  customer_reference: z.literal(input.reference),
                  request_status: z.string(),
                  order: z.unknown().nullable(),
                }),
              )
              .max(1),
          })
          .parse(
            await request(
              supplier,
              "/api/reseller/orders/lookup?idempotency_key=" + encodeURIComponent(input.reference),
            ),
          );
        if (data.results.length !== 1) return missing();
        const row = data.results[0];
        if (row.request_status === "failed_no_charge" && row.order === null)
          return { state: "NO_CHARGE", reference: input.reference, externalId: input.externalId };
        if (row.request_status !== "completed") return missing();
        return venteResult(
          row.order,
          { reference: input.reference, externalId: input.externalId },
          job.order.items[0].product.type,
        );
      } catch {
        return missing();
      }
    },
  };
}
export function liveSupplierRegistry(): SupplierRegistry {
  const registry = new Map<SupplierId, SupplierAdapter>();
  if (process.env.OOSTA_SUPPLIER_WALLET_PURCHASES !== "true") return registry;
  for (const supplier of ["canboso", "canboso2", "ventebot"] as const) {
    if (process.env[supplierEndpoints[supplier].env]?.trim())
      registry.set(supplier, walletAdapter(supplier));
  }
  return registry;
}
