import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../utils/httpError";
import { supplierIds } from "./variant";

export type SupplierId = (typeof supplierIds)[number];
export const supplierEndpoints: Record<
  SupplierId,
  { url: string; header: string; env: string; label: string }
> = {
  toolsmarket: {
    url: "https://toolsmarket.online/api/v1/products",
    header: "X-API-Key",
    env: "TOOLSMARKET_API_KEY",
    label: "ToolsMarket",
  },
  aitoolify: {
    url: "https://bot.aitoolifystudio.io/api/reseller/v1/products",
    header: "X-API-Key",
    env: "AITOOLIFY_API_KEY",
    label: "AItoolify",
  },
  canboso: {
    url: "https://canboso.com/api/v2/telegram-buyer/products",
    header: "x-buyer-key",
    env: "CANBOSO_API_KEY",
    label: "shop_cron191_en_bot",
  },
  canboso2: {
    url: "https://canboso.com/api/v2/telegram-buyer/products",
    header: "x-buyer-key",
    env: "CANBOSO2_API_KEY",
    label: "PremiKeyBot",
  },
  ventebot: {
    url: "https://web-production-1c7b1.up.railway.app/api/reseller/products",
    header: "X-Reseller-Key",
    env: "VENTEBOT_API_KEY",
    label: "VenteBot",
  },
};
export const offerSchema = z
  .object({
    supplier: z.enum(supplierIds),
    externalId: z.string().min(1).max(100),
    name: z.string().min(1).max(300),
    description: z.string().max(4000),
    cost: z.string().regex(/^\d+(\.\d{1,6})?$/),
    currency: z.enum(["USD", "USDT"]),
    stock: z.number().int().min(0).max(10000000).nullable(),
    onRequest: z.boolean(),
    delivery: z.enum(["AUTOMATIC", "MANUAL", "UNVERIFIED"]),
    warranty: z.object({
      kind: z.enum(["NONE", "WARRANTED"]),
      days: z.number().int().min(0).max(3650),
    }),
    flags: z.array(z.string()).max(10),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type Offer = z.infer<typeof offerSchema>;
export function isReviewedPremiKeyPlus(offer: Offer) {
  return (
    offer.supplier === "canboso2" &&
    offer.externalId === "6a7347f6b1446d1a93c12cdf" &&
    offer.fingerprint === "4aa7403e67eac18477ea506ddbfd8210138c4c2b82caf7ff45ae323e4c29b3c2"
  );
}

export function blocksAutomaticPurchase(offer: Offer) {
  return offer.flags.some((flag) => flag !== "WARRANTY_CONFLICT" || !isReviewedPremiKeyPlus(offer));
}
export const catalogSchema = z.object({
  supplier: z.enum(supplierIds),
  fetchedAt: z.string().datetime(),
  offers: z.array(offerSchema).max(5000),
  rejected: z.number().int().min(0),
});
export type Catalog = z.infer<typeof catalogSchema>;
const record = z.record(z.string(), z.unknown());
function obj(v: unknown): Record<string, unknown> {
  return record.safeParse(v).data ?? {};
}
function clean(v: unknown, max: number): string {
  let s =
    typeof v === "string"
      ? // Strip non-printing upstream characters before storing/displaying descriptions.
        // eslint-disable-next-line no-control-regex
        v.slice(0, max).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      : "";
  for (const config of Object.values(supplierEndpoints)) {
    const key = process.env[config.env]?.trim();
    if (key) s = s.replaceAll(key, "[redacted]");
  }
  return s;
}
export function normalizeCatalog(supplier: SupplierId, body: unknown, now = new Date()): Catalog {
  const data = obj(body);
  if (
    (data.success !== true && data.ok !== true) ||
    !Array.isArray(data.products) ||
    data.products.length > 5000
  )
    throw new AppError(502, "SUPPLIER_RESPONSE_INVALID", "Supplier catalog format is invalid");
  const offers: Offer[] = [];
  let rejected = 0;
  const seen = new Set<string>();
  for (const entry of data.products) {
    try {
      const p = obj(entry);
      if (
        typeof p.name !== "string" ||
        p.name.length > 300 ||
        (typeof p.description === "string" && p.description.length > 4000)
      )
        throw new Error();
      const rawId = p.product_id ?? p.productId ?? p.id;
      if (typeof rawId !== "string" && !(typeof rawId === "number" && Number.isSafeInteger(rawId)))
        throw new Error();
      const externalId = String(rawId);
      if (seen.has(externalId)) throw new Error();
      const price = obj(p.price);
      const available = obj(p.availability);
      const amount =
        supplier === "aitoolify"
          ? p.your_cost
          : supplier === "ventebot"
            ? p.price_usd
            : supplier.startsWith("canboso")
              ? price.amount
              : p.price;
      if (!["string", "number"].includes(typeof amount)) throw new Error();
      const decimal = new Prisma.Decimal(String(amount));
      if (
        !decimal.isFinite() ||
        decimal.lte(0) ||
        decimal.gt(1_000_000_000) ||
        decimal.decimalPlaces() > 6
      )
        throw new Error();
      const currency =
        supplier === "aitoolify" ? "USDT" : supplier.startsWith("canboso") ? price.currency : "USD";
      const rawStock = p.stock_quantity ?? p.stock ?? available.available ?? null;
      const name = clean(p.name, 300);
      const description = clean(p.description, 4000);
      const rawType = p.productType ?? p.type ?? p.delivery_type;
      const flags: string[] = [];
      if (/\btrial\b|\botp\b|\bsms\b|50%.*(?:off|discount)|gemini.*\bapi\b/i.test(name))
        flags.push("DIFFERENT_PRODUCT_REVIEW");
      if (/full warranty/i.test(name) && /no warranty|without warranty/i.test(description))
        flags.push("WARRANTY_CONFLICT");
      if (/activation on your mail/i.test(name) && p.requires_email === false)
        flags.push("INPUT_CONFLICT");
      if (/send.{0,70}(?:email|mail).{0,30}(?:pas|password)/i.test(description))
        flags.push("SENSITIVE_MANUAL_FLOW");
      const delivery =
        supplier === "aitoolify" && p.requires_email === false && !flags.includes("INPUT_CONFLICT")
          ? "AUTOMATIC"
          : supplier === "aitoolify" && p.requires_email === true
            ? "MANUAL"
            : supplier === "ventebot" && rawType === "stock"
              ? "AUTOMATIC"
              : supplier === "toolsmarket"
                ? p.delivery_type === "codes" && p.auto_delivery === 1
                  ? "AUTOMATIC"
                  : "MANUAL"
                : "UNVERIFIED";
      const days =
        typeof p.warranty_days === "number" &&
        Number.isInteger(p.warranty_days) &&
        p.warranty_days > 0
          ? p.warranty_days
          : 0;
      // Unknown warranty is NONE by explicit store policy; raw source text remains visible to reviewers.
      const warranty = { kind: days > 0 ? ("WARRANTED" as const) : ("NONE" as const), days };
      const fingerprint = createHash("sha256")
        .update(
          JSON.stringify([
            supplier,
            externalId,
            name,
            description,
            currency,
            rawType,
            p.delivery_type ?? null,
            delivery,
            p.is_unlimited ?? null,
            flags,
            p.requires_email ?? null,
            p.auto_delivery ?? null,
            days,
          ]),
        )
        .digest("hex");
      const offer = offerSchema.parse({
        supplier,
        externalId,
        name,
        description,
        cost: decimal.toString(),
        currency,
        stock: rawStock,
        onRequest:
          rawStock === null &&
          (p.is_unlimited === true ||
            rawType === "slot" ||
            rawType === "upgrade_account" ||
            rawType === "activation"),
        delivery,
        warranty,
        flags,
        fingerprint,
      });
      if (p.api_test === true) {
        rejected++;
        continue;
      }
      offers.push(offer);
      seen.add(externalId);
    } catch {
      rejected++;
    }
  }
  return { supplier, fetchedAt: now.toISOString(), offers, rejected };
}
export async function fetchCatalog(supplier: SupplierId): Promise<Catalog> {
  const config = supplierEndpoints[supplier];
  const key = process.env[config.env]?.trim();
  if (!key) throw new AppError(503, "SUPPLIER_NOT_CONFIGURED", "Supplier access is not configured");
  try {
    const response = await fetch(config.url, {
      method: "GET",
      headers: { [config.header]: key, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok || response.headers.get("X-Catalog-Stale") === "true") throw new Error();
    const reader = response.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 2_000_000) {
        await reader.cancel();
        throw new Error();
      }
      chunks.push(value);
    }
    return normalizeCatalog(supplier, JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch {
    // Never propagate response bodies, upstream URLs/headers or reflected credentials.
    throw new AppError(502, "SUPPLIER_UNAVAILABLE", "Supplier catalog is temporarily unavailable");
  }
}
