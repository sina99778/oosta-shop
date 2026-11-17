import { fxStatus, quotePricing } from "./fx.service";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/httpError";
import {
  catalogSchema,
  fetchCatalog,
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
export async function catalogs(): Promise<Map<SupplierId, Catalog>> {
  const rows = await prisma.siteSetting.findMany({
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
export async function syncCatalog(id: SupplierId): Promise<Catalog> {
  return prisma.$transaction(
    async (tx) => {
      const [lock] = await tx.$queryRaw<
        { locked: boolean }[]
      >`SELECT pg_try_advisory_xact_lock(hashtext(${prefix + id})) AS locked`;
      if (!lock.locked) throw new AppError(409, "SYNC_BUSY", "A catalog update is already running");
      const previous = await tx.siteSetting.findUnique({ where: { key: prefix + id } });
      if (previous) {
        try {
          const c = catalogSchema.parse(JSON.parse(previous.value));
          const age = Date.now() - Date.parse(c.fetchedAt);
          if (c.supplier === id && age >= 0 && age < 20000) return c;
        } catch {
          /* Replace corrupt cache. */
        }
      }
      const catalog = await fetchCatalog(id);
      await tx.siteSetting.upsert({
        where: { key: prefix + id },
        create: { key: prefix + id, value: JSON.stringify(catalog) },
        update: { value: JSON.stringify(catalog) },
      });
      return catalog;
    },
    { timeout: 20000, maxWait: 3000 },
  );
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
  if (
    offer.supplier === "canboso2" &&
    offer.externalId === "6a7347f6b1446d1a93c12cdf" &&
    offer.fingerprint === "d9d9c7efaf5a51b81d586857654aa9b9ebccd92e36f9107f889a6cec9b30a700"
  ) {
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
  id: string;
  source: string;
  variant: unknown;
  supplierMappings: unknown;
  durationDays: number | null;
};
export function matchingOffers(
  plan: SourcePlan,
  all: Map<SupplierId, Catalog>,
  now = Date.now(),
): Array<{ offer: Offer; expiresAt: number }> {
  const variant = readVariant(plan.variant);
  if (plan.source !== "SUPPLIER" || !variant) return [];
  const signature = variantKey(variant, plan.durationDays);
  return readMappings(plan.supplierMappings).flatMap((mapping) => {
    if (mapping.variantKey !== signature) return [];
    const c = all.get(mapping.supplier);
    if (!c) return [];
    const age = now - Date.parse(c.fetchedAt);
    if (age < 0 || age >= 60000) return [];
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
    return [{ offer, expiresAt: Date.parse(c.fetchedAt) + 60000 }];
  });
}
export async function sourceStates(plans: SourcePlan[]) {
  const result = new Map<
    string,
    { inStock: boolean; availableStock: number; quoteRequired: boolean }
  >();
  if (!plans.some((p) => p.source === "SUPPLIER")) return result;
  const all = await catalogs();
  for (const p of plans.filter((p) => p.source === "SUPPLIER")) {
    const offers = matchingOffers(p, all);
    result.set(p.id, {
      inStock: offers.length > 0,
      availableStock: Math.max(0, ...offers.map((x) => x.offer.stock ?? 0)),
      quoteRequired: true,
    });
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
  const prices = offers.flatMap(({ offer, expiresAt }) => {
    try {
      const amount = indicativePrice(offer.cost, offer.currency, resolved.policy);
      return [
        {
          amount,
          expiresAt: Math.min(
            expiresAt,
            resolved.rateExpiresAt,
            rateExpiry(resolved.policy),
            Date.now() + 60000,
          ),
        },
      ];
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
