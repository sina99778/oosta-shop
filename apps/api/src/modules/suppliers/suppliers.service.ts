import { fxStatus, quotePricing } from "./fx.service";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/httpError";
import {
  catalogSchema,
  fetchCatalog,
  isReviewedPremiKeyPlus,
  supplierEndpoints,
  type Catalog,
  type Offer,
  type SupplierId,
} from "./catalog";
import { indicativePrice, pricingSchema, rateExpiry, type Pricing } from "./pricing";
import {
  mappingSchema,
  readMappings,
  readVariant,
  supplierIds,
  variantKey,
  type Mapping,
  type Variant,
} from "./variant";

const prefix = "suppliers.catalog.";
const parsedCatalogs = new Map<string, { value: string; catalog: Catalog | null }>();
const runningSyncs = new Map<SupplierId, Promise<Catalog>>();
export async function catalogs(
  client: Pick<Prisma.TransactionClient, "siteSetting"> = prisma,
): Promise<Map<SupplierId, Catalog>> {
  const rows = await client.siteSetting.findMany({
    where: { key: { in: supplierIds.map((id) => prefix + id) } },
  });
  const map = new Map<SupplierId, Catalog>();
  for (const row of rows) {
    const previous = parsedCatalogs.get(row.key);
    if (previous?.value === row.value) {
      if (previous.catalog) map.set(previous.catalog.supplier, previous.catalog);
      continue;
    }
    let catalog: Catalog | null = null;
    try {
      const c = catalogSchema.parse(JSON.parse(row.value));
      if (row.key === prefix + c.supplier) {
        catalog = c;
        map.set(c.supplier, c);
      }
    } catch {
      /* Invalid snapshots are unavailable until an authenticated sync repairs them. */
    }
    // Always read the database. Only parsing is reused when the snapshot is byte-identical.
    parsedCatalogs.set(row.key, { value: row.value, catalog });
  }
  return map;
}
function recentCatalog(id: SupplierId, value: string | undefined): Catalog | null {
  if (!value) return null;
  try {
    const catalog = catalogSchema.parse(JSON.parse(value));
    const age = Date.now() - Date.parse(catalog.fetchedAt);
    return catalog.supplier === id && age >= 0 && age < 20000 ? catalog : null;
  } catch {
    return null;
  }
}

async function refreshCatalog(id: SupplierId): Promise<Catalog> {
  const key = prefix + id;
  const where = { key };
  const prior = recentCatalog(id, (await prisma.siteSetting.findUnique({ where }))?.value);
  if (prior) return prior;

  const catalog = await fetchCatalog(id);
  const value = JSON.stringify(catalog);
  return prisma.$transaction(async (tx) => {
    const [lock] = await tx.$queryRaw<
      { locked: boolean }[]
    >`SELECT pg_try_advisory_xact_lock(hashtext(${key})) AS locked`;
    if (!lock.locked) throw new AppError(409, "SYNC_BUSY", "A catalog update is already running");

    // Another replica may have saved a fresh snapshot during the HTTP request.
    const current = recentCatalog(id, (await tx.siteSetting.findUnique({ where }))?.value);
    if (current) return current;
    await tx.siteSetting.upsert({ where, create: { key, value }, update: { value } });
    return catalog;
  });
}

export function syncCatalog(id: SupplierId): Promise<Catalog> {
  const running = runningSyncs.get(id);
  if (running) return running;
  const sync = refreshCatalog(id).finally(() => runningSyncs.delete(id));
  runningSyncs.set(id, sync);
  return sync;
}
export async function supplierOverview() {
  const all = await catalogs();
  return {
    suppliers: supplierIds.map((id) => ({
      id,
      label: supplierEndpoints[id].label,
      configured: !!process.env[supplierEndpoints[id].env]?.trim(),
      catalog: all.get(id) ?? null,
    })),
    pricing: await getPricing(),
    fx: await fxStatus(),
  };
}
export async function getPricing(): Promise<Pricing | null> {
  const row = await prisma.siteSetting.findUnique({ where: { key: "suppliers.pricing" } });
  if (!row)
    return process.env.NAVASAN_API_KEY?.trim()
      ? pricingSchema.parse({
          enabled: true,
          rateSource: "NAVASAN_FREE",
          rates: {},
          markupPercent: "30",
          minimumProfitIrr: "0",
          fixedCostIrr: "0",
          ttlSeconds: 60,
          updatedAt: new Date().toISOString(),
        })
      : null;
  try {
    return pricingSchema.parse(JSON.parse(row.value));
  } catch {
    return null;
  }
}
export async function setPricing(input: Omit<Pricing, "updatedAt">) {
  const policy = pricingSchema.parse({ ...input, updatedAt: new Date().toISOString() });
  if (
    policy.enabled &&
    policy.rateSource !== "NAVASAN_FREE" &&
    !policy.rates.USD &&
    !policy.rates.USDT
  )
    throw new AppError(400, "RATE_REQUIRED", "At least one exchange rate is required");
  await prisma.siteSetting.upsert({
    where: { key: "suppliers.pricing" },
    create: { key: "suppliers.pricing", value: JSON.stringify(policy) },
    update: { value: JSON.stringify(policy) },
  });
  return policy;
}
function deliveryMatches(offer: Offer, variant: Variant, automaticVerified?: boolean) {
  const delivery =
    offer.delivery === "UNVERIFIED" ? (automaticVerified ? "AUTOMATIC" : "MANUAL") : offer.delivery;
  return (
    delivery === variant.delivery &&
    !(variant.delivery === "AUTOMATIC" && offer.flags.includes("INPUT_CONFLICT"))
  );
}

function warrantyMatches(offer: Offer, variant: Variant) {
  // The store approved this warranty for the reviewed listing, including its stated exclusions.
  if (isReviewedPremiKeyPlus(offer)) {
    return (
      variant.warranty.kind === "WARRANTED" &&
      variant.warranty.days === 30 &&
      variant.warranty.coverage === "FULL"
    );
  }
  return (
    offer.warranty.kind === variant.warranty.kind &&
    offer.warranty.days === variant.warranty.days &&
    !(variant.warranty.kind === "WARRANTED" && offer.flags.includes("WARRANTY_CONFLICT"))
  );
}

export async function verifyMappings(
  raw: z.infer<typeof mappingSchema>[],
  variant: Variant,
  durationDays: number | null,
): Promise<Mapping[]> {
  const all = await catalogs();
  const signature = variantKey(variant, durationDays);
  const seen = new Set<string>();
  return raw.map((mapping) => {
    const identity = mapping.supplier + "\0" + mapping.externalId;
    if (seen.has(identity))
      throw new AppError(400, "DUPLICATE_MAPPING", "Supplier offer is already mapped");
    seen.add(identity);
    const catalog = all.get(mapping.supplier);
    const offer = catalog?.offers.find((o) => o.externalId === mapping.externalId);
    if (!offer || offer.fingerprint !== mapping.fingerprint)
      throw new AppError(409, "OFFER_CHANGED", "Refresh and review the supplier offer again");
    if (offer.flags.some((f) => ["SENSITIVE_MANUAL_FLOW", "DIFFERENT_PRODUCT_REVIEW"].includes(f)))
      throw new AppError(
        409,
        "OFFER_REQUIRES_REVIEW",
        "This offer requires a separate supported product flow",
      );
    if (!warrantyMatches(offer, variant))
      throw new AppError(
        409,
        "WARRANTY_MISMATCH",
        "Warranty duration must match the supplier offer",
      );
    if (!deliveryMatches(offer, variant, mapping.automaticVerified))
      throw new AppError(
        409,
        "DELIVERY_NOT_VERIFIED",
        "Supplier delivery must match the selected variant",
      );
    return { ...mapping, variantKey: signature };
  });
}
export type SourcePlan = {
  productType?: "ACCOUNT" | "LICENSE" | "GIFTCARD";
  id: string;
  source: string;
  variant: unknown;
  supplierMappings: unknown;
  durationDays: number | null;
};
function eligibleOffers(
  plan: SourcePlan,
  all: Map<SupplierId, Catalog>,
  now: number,
): Array<{ offer: Offer; expiresAt: number }> {
  const variant = readVariant(plan.variant);
  if (plan.source !== "SUPPLIER" || !variant) return [];
  const signature = variantKey(variant, plan.durationDays);
  return readMappings(plan.supplierMappings).flatMap((mapping) => {
    if (mapping.variantKey !== signature) return [];
    const c = all.get(mapping.supplier);
    if (!c) return [];
    const fetchedAt = Date.parse(c.fetchedAt);
    if (fetchedAt > now) return [];
    const offer = c.offers.find(
      (o) => o.externalId === mapping.externalId && o.fingerprint === mapping.fingerprint,
    );
    if (
      !offer ||
      !warrantyMatches(offer, variant) ||
      !deliveryMatches(offer, variant, mapping.automaticVerified) ||
      offer.flags.some((f) => ["SENSITIVE_MANUAL_FLOW", "DIFFERENT_PRODUCT_REVIEW"].includes(f)) ||
      (!((offer.stock ?? 0) > 0) &&
        !(offer.stock === null && offer.onRequest && variant.delivery === "MANUAL"))
    )
      return [];
    return [{ offer, expiresAt: fetchedAt + 60000 }];
  });
}

export function matchingOffers(plan: SourcePlan, all: Map<SupplierId, Catalog>, now = Date.now()) {
  return eligibleOffers(plan, all, now).filter(({ expiresAt }) => expiresAt > now);
}

export type IndicativePrice = { amount: number; currency: "IRR"; expiresAt: string };

function priceOffer(
  { offer, expiresAt }: ReturnType<typeof matchingOffers>[number],
  resolved: Awaited<ReturnType<typeof quotePricing>>,
  now: Date,
) {
  return {
    amount: indicativePrice(offer.cost, offer.currency, resolved.policy, now),
    expiresAt: Math.min(
      expiresAt,
      resolved.rateExpiresAt,
      rateExpiry(resolved.policy),
      now.getTime() + 60000,
    ),
  };
}

export async function sourceStates(plans: SourcePlan[], includeIndicativePrice = false) {
  const result = new Map<
    string,
    {
      inStock: boolean;
      availableStock: number;
      quoteRequired: boolean;
      indicativePrice: IndicativePrice | null;
      stockUnconfirmed: boolean;
    }
  >();
  if (!plans.some((p) => p.source === "SUPPLIER")) return result;
  const all = await catalogs();
  const now = new Date();
  const stockedOffers = new Map<string, ReturnType<typeof matchingOffers>>();
  for (const p of plans.filter((p) => p.source === "SUPPLIER")) {
    const eligible = eligibleOffers(p, all, now.getTime());
    const offers = eligible.filter(({ expiresAt }) => expiresAt > now.getTime());
    if (includeIndicativePrice) {
      const stocked = offers.filter(({ offer }) => (offer.stock ?? 0) > 0);
      if (stocked.length) stockedOffers.set(p.id, stocked);
    }
    result.set(p.id, {
      inStock: offers.length > 0,
      availableStock: Math.max(0, ...offers.map((x) => x.offer.stock ?? 0)),
      quoteRequired: true,
      indicativePrice: null,
      stockUnconfirmed: offers.length === 0 && eligible.some(({ offer }) => (offer.stock ?? 0) > 0),
    });
  }
  if (!stockedOffers.size) return result;
  const policy = await getPricing();
  if (!policy?.enabled) return result;
  const resolved = await quotePricing(policy, now.getTime()).catch((error: unknown) => {
    if (error instanceof AppError) return null;
    throw error;
  });
  if (!resolved) return result;
  for (const [id, offers] of stockedOffers) {
    let lowest: ReturnType<typeof priceOffer> | null = null;
    for (const offer of offers) {
      try {
        const price = priceOffer(offer, resolved, now);
        if (price.expiresAt <= Date.now()) continue;
        if (
          !lowest ||
          price.amount.lt(lowest.amount) ||
          (price.amount.eq(lowest.amount) && price.expiresAt > lowest.expiresAt)
        )
          lowest = price;
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
      }
    }
    if (lowest)
      result.get(id)!.indicativePrice = {
        amount: Number(lowest.amount),
        currency: "IRR",
        expiresAt: new Date(lowest.expiresAt).toISOString(),
      };
  }
  return result;
}
export async function quote(planId: string) {
  const plan = await prisma.productPlan.findFirst({
    where: { id: planId, isActive: true, product: { isActive: true } },
  });
  if (!plan || plan.source !== "SUPPLIER" || !readVariant(plan.variant))
    throw new AppError(404, "NOT_FOUND", "Supplier variant not found");
  const [all, policy] = await Promise.all([catalogs(), getPricing()]);
  if (
    !policy ||
    !policy.enabled ||
    (policy.rateSource !== "NAVASAN_FREE" && rateExpiry(policy) <= Date.now())
  )
    throw new AppError(
      503,
      "PRICING_UNAVAILABLE",
      "Exchange rates and profit policy have not been configured",
    );
  const resolved = await quotePricing(policy);
  let offers = matchingOffers(plan, all);
  if (!offers.length) {
    const ids = [...new Set(readMappings(plan.supplierMappings).map((m) => m.supplier))];
    await Promise.allSettled(
      ids
        .filter((id) => !!process.env[supplierEndpoints[id].env]?.trim())
        .map((id) => syncCatalog(id)),
    );
    offers = matchingOffers(plan, await catalogs());
  }
  if (!offers.length)
    throw new AppError(409, "NO_CURRENT_OFFER", "No fresh matching supplier offer is available");
  const now = new Date();
  const prices = offers.flatMap((offer) => {
    try {
      return [priceOffer(offer, resolved, now)];
    } catch (e) {
      if (e instanceof AppError && e.code === "PRICING_UNAVAILABLE") return [];
      throw e;
    }
  });
  if (!prices.length)
    throw new AppError(
      503,
      "PRICING_UNAVAILABLE",
      "A fresh exchange rate for this currency is required",
    );
  const min = Prisma.Decimal.min(...prices.map((p) => p.amount));
  const max = Prisma.Decimal.max(...prices.map((p) => p.amount));
  return {
    planId,
    variantKey: variantKey(readVariant(plan.variant)!, plan.durationDays),
    amount: Number(min),
    range: { min: Number(min), max: Number(max) },
    currency: "IRR",
    quotedAt: new Date().toISOString(),
    expiresAt: new Date(Math.min(...prices.map((p) => p.expiresAt))).toISOString(),
    kind: "INDICATIVE" as const,
    checkoutEnabled: false,
    fx: resolved.fx,
  };
}

export function startCatalogRefresh(): () => void {
  const ids = supplierIds.filter((id) => !!process.env[supplierEndpoints[id].env]?.trim());
  if (!ids.length) return () => {};
  let running = false;
  const refresh = async () => {
    if (running) return;
    running = true;
    try {
      await Promise.allSettled(ids.map((id) => syncCatalog(id)));
    } finally {
      running = false;
    }
  };
  void refresh();
  const timer = setInterval(() => {
    void refresh();
  }, 30000);
  timer.unref();
  return () => clearInterval(timer);
}
