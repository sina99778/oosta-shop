/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
require("tsx/cjs");
const { variantSchema, variantKey } = require("../apps/api/src/modules/suppliers/variant.ts");
const base = {
  plan: "PLUS",
  access: "PERSONAL",
  fulfillment: "ACCOUNT",
  delivery: "AUTOMATIC",
  warranty: { kind: "UNKNOWN" },
  region: "GLOBAL",
  quota: "STANDARD",
};
const normalized = variantSchema.parse(base);
assert.deepEqual(normalized.warranty, { kind: "NONE", days: 0, coverage: "NONE" });
assert.equal(
  variantKey(normalized, 30),
  variantKey({ ...normalized, warranty: { kind: "NONE", days: 0, coverage: "NONE" } }, 30),
);
for (const changed of [
  { ...normalized, access: "TEAM" },
  { ...normalized, fulfillment: "INVITE" },
  { ...normalized, delivery: "MANUAL" },
  { ...normalized, warranty: { kind: "WARRANTED", days: 30, coverage: "FULL" } },
])
  assert.notEqual(variantKey(normalized, 30), variantKey(changed, 30));
assert.notEqual(variantKey(normalized, 30), variantKey(normalized, 365));
assert(
  !variantSchema.safeParse({ ...base, warranty: { kind: "WARRANTED", days: 0, coverage: "FULL" } })
    .success,
);
assert(!variantSchema.safeParse({ ...base, warranty: { kind: "WARRANTED", days: 30 } }).success);
console.log("PASS: exact variants and unknown-to-no-warranty normalization");
const { matchingOffers } = require("../apps/api/src/modules/suppliers/suppliers.service.ts");
const reviewedSku = "6a7347f6b1446d1a93c12cdf";
const reviewedFingerprint = "4aa7403e67eac18477ea506ddbfd8210138c4c2b82caf7ff45ae323e4c29b3c2";
const reviewedVariant = variantSchema.parse({
  ...base,
  plan: "ChatGPT Plus",
  delivery: "MANUAL",
  warranty: { kind: "WARRANTED", days: 30, coverage: "FULL" },
});
const reviewedOffer = {
  supplier: "canboso2",
  externalId: reviewedSku,
  fingerprint: reviewedFingerprint,
  delivery: "UNVERIFIED",
  warranty: { kind: "NONE", days: 0 },
  flags: ["WARRANTY_CONFLICT"],
  stock: 5,
};
const { blocksAutomaticPurchase } = require("../apps/api/src/modules/suppliers/catalog.ts");
assert.equal(blocksAutomaticPurchase(reviewedOffer), false);
assert.equal(blocksAutomaticPurchase({ ...reviewedOffer, fingerprint: "a".repeat(64) }), true);
assert.equal(
  blocksAutomaticPurchase({ ...reviewedOffer, flags: ["WARRANTY_CONFLICT", "INPUT_CONFLICT"] }),
  true,
);
const matchReviewed = (offer, warranty = reviewedVariant.warranty) => {
  const variant = { ...reviewedVariant, warranty };
  const supplierMappings = [
    {
      supplier: "canboso2",
      externalId: offer.externalId,
      fingerprint: offer.fingerprint,
      variantKey: variantKey(variant, 30),
    },
  ];
  return matchingOffers(
    { id: "fixture", source: "SUPPLIER", durationDays: 30, variant, supplierMappings },
    new Map([["canboso2", { fetchedAt: new Date().toISOString(), offers: [offer] }]]),
  );
};
assert.equal(matchReviewed(reviewedOffer).length, 1);
assert.equal(matchReviewed({ ...reviewedOffer, fingerprint: "a".repeat(64) }).length, 0);
assert.equal(matchReviewed({ ...reviewedOffer, externalId: "different" }).length, 0);
assert.equal(
  matchReviewed({ ...reviewedOffer, flags: ["WARRANTY_CONFLICT", "SENSITIVE_MANUAL_FLOW"] }).length,
  0,
);
assert.equal(
  matchReviewed(reviewedOffer, { kind: "WARRANTED", days: 31, coverage: "FULL" }).length,
  0,
);
const { createPlanSchema } = require("../apps/api/src/modules/admin/admin.schemas.ts");
assert.equal(
  createPlanSchema.parse({ label: "Fixture", price: 100, source: "SUPPLIER", variant: base })
    .variant?.warranty.kind,
  "NONE",
  "Admin validation must retain structured variants",
);
const { normalizeCatalog } = require("../apps/api/src/modules/suppliers/catalog.ts");
const digitalProduct = {
  id: 193,
  name: "Fixture Pro subscription",
  description: "Activation warranty only",
  price: 2.8,
  currency: "USD",
  stock: 16,
  min_qty: 1,
  max_qty: 100,
};
const digital = normalizeCatalog("getdigitaltools", {
  products: [
    digitalProduct,
    { ...digitalProduct, id: 194, currency: "USDT", stock: 0 },
    { ...digitalProduct, id: 195, currency: "EUR" },
    { ...digitalProduct, id: 196, min_qty: 2 },
    { ...digitalProduct, id: 197, stock: null },
    { ...digitalProduct, id: 198, description: "Submit automatic SheerID student verification" },
  ],
});
assert.equal(digital.rejected, 3);
assert.deepEqual(
  digital.offers
    .slice(0, 2)
    .map(({ externalId, cost, currency, stock, delivery, warranty }) => ({
      externalId,
      cost,
      currency,
      stock,
      delivery,
      warranty,
    })),
  [
    {
      externalId: "193",
      cost: "2.8",
      currency: "USD",
      stock: 16,
      delivery: "UNVERIFIED",
      warranty: { kind: "NONE", days: 0 },
    },
    {
      externalId: "194",
      cost: "2.8",
      currency: "USDT",
      stock: 0,
      delivery: "UNVERIFIED",
      warranty: { kind: "NONE", days: 0 },
    },
  ],
);
assert(digital.offers[2].flags.includes("SENSITIVE_MANUAL_FLOW"));
assert.throws(() => normalizeCatalog("getdigitaltools", { success: false, products: [] }));
const c1 = normalizeCatalog("canboso", {
  success: true,
  walletCurrency: "USD",
  products: [
    {
      productId: "same",
      name: "Fixture",
      description: "",
      productType: "account",
      price: { amount: 2, currency: "USD" },
      availability: { available: 3 },
    },
  ],
});
const c2 = normalizeCatalog("canboso2", {
  success: true,
  walletCurrency: "USD",
  products: [
    {
      productId: "same",
      name: "Fixture",
      description: "",
      productType: "account",
      price: { amount: 3, currency: "USD" },
      availability: { available: 4 },
    },
  ],
});
assert.notEqual(c1.supplier, c2.supplier);
assert.equal(c1.offers[0].cost, "2");
assert.equal(c1.offers[0].warranty.kind, "NONE");
assert.equal(
  normalizeCatalog("aitoolify", {
    success: true,
    products: [
      { id: 1, name: "Fixture", your_cost: 1, price_usdt: 2, stock: 5, requires_email: false },
    ],
  }).offers[0].cost,
  "1",
);
assert.throws(() => normalizeCatalog("canboso", { success: false, products: [] }));
console.log("PASS: supplier identity, reseller cost, schema and unknown warranty normalization");
const { pricingSchema, indicativePrice } = require("../apps/api/src/modules/suppliers/pricing.ts");
const now = new Date("2026-11-07T10:00:00Z");
const policy = {
  enabled: true,
  rateSource: "MANUAL",
  rates: { USD: "1000000", USDT: "1010000" },
  markupPercent: "10",
  minimumProfitIrr: "0",
  fixedCostIrr: "0",
  ttlSeconds: 300,
  updatedAt: now.toISOString(),
};
const dollarPolicy = {
  ...policy,
  markupPercent: "30",
  minimumProfitIrr: "0",
  fixedCostIrr: "100000",
};
assert(
  !pricingSchema.safeParse({ ...dollarPolicy, minimumProfitIrr: "500000" }).success,
  "No Rial profit floor may override the approved dollar markup",
);
assert.equal(
  indicativePrice("10", "USD", dollarPolicy, now).toString(),
  "13100000",
  "Markup applies to supplier dollars, not Rial fees",
);
assert.equal(
  indicativePrice("10", "USDT", { ...dollarPolicy, fixedCostIrr: "0" }, now).toString(),
  "13130000",
);
assert.equal(indicativePrice("1.9", "USD", policy, now).toString(), "2090000");
assert.equal(indicativePrice("0.1", "USDT", policy, now).toString(), "111100");
assert.throws(() => indicativePrice("1", "USD", { ...policy, enabled: false }, now));
assert.throws(() => indicativePrice("1", "USD", policy, new Date(now.getTime() + 301000)));
assert(!pricingSchema.safeParse({ ...policy, rates: { USD: "0" } }).success);
console.log(
  "PASS: decimal currency markup, no Rial floor, distinct currencies and stale/disabled guards",
);

async function networkContracts() {
  const { fetchCatalog } = require("../apps/api/src/modules/suppliers/catalog.ts");
  process.env.CANBOSO_API_KEY = "SYNTHETIC-CATALOG-SECRET";
  const original = global.fetch;
  try {
    global.fetch = async (url, options) => {
      assert.equal(options.method, "GET");
      assert.equal(options.redirect, "error");
      assert(!String(url).includes("SYNTHETIC"));
      return new Response(
        JSON.stringify({
          success: true,
          products: [
            {
              productId: "fixture",
              name: "Fixture SYNTHETIC-CATALOG-SECRET",
              price: { amount: 1, currency: "USD" },
              availability: { available: 1 },
            },
          ],
        }),
        { status: 200 },
      );
    };
    const c = await fetchCatalog("canboso");
    assert(!JSON.stringify(c).includes("SYNTHETIC-CATALOG-SECRET"));
    process.env.GETDIGITALTOOLS_API_KEY = "SYNTHETIC-DIGITAL-SECRET";
    global.fetch = async (url, options) => {
      assert.equal(url, "https://shop-bot-production-07f9.up.railway.app/api/products");
      assert.equal(options.method, "GET");
      assert.equal(options.redirect, "error");
      assert.equal(new Headers(options.headers).get("x-api-key"), "SYNTHETIC-DIGITAL-SECRET");
      return Response.json({
        products: [{ ...digitalProduct, description: "SYNTHETIC-DIGITAL-SECRET" }],
      });
    };
    const reseller = await fetchCatalog("getdigitaltools");
    assert.equal(reseller.offers[0].description, "[redacted]");
    const { liveSupplierRegistry } = require("../apps/api/src/modules/suppliers/live-adapters.ts");
    assert.equal(liveSupplierRegistry().has("getdigitaltools"), false);
    global.fetch = async () => new Response("SYNTHETIC-CATALOG-SECRET", { status: 429 });
    await assert.rejects(
      () => fetchCatalog("canboso"),
      (e) => e.code === "SUPPLIER_UNAVAILABLE" && !e.message.includes("SYNTHETIC"),
    );
    global.fetch = async () => new Response("not json", { status: 200 });
    await assert.rejects(
      () => fetchCatalog("canboso"),
      (e) => e.code === "SUPPLIER_UNAVAILABLE",
    );
    console.log(
      "PASS: GET-only fixed-host transport, secret redaction and upstream failure handling",
    );
  } finally {
    global.fetch = original;
    delete process.env.CANBOSO_API_KEY;
    delete process.env.GETDIGITALTOOLS_API_KEY;
  }
}
networkContracts().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
// Semantic changes must invalidate approval even when a legacy type field is also present.
const beforeDelivery = normalizeCatalog("toolsmarket", {
  ok: true,
  products: [
    {
      product_id: "fixture",
      name: "Fixture",
      price: 1,
      stock: 2,
      type: "account",
      delivery_type: "codes",
      auto_delivery: 1,
    },
  ],
}).offers[0];
const afterDelivery = normalizeCatalog("toolsmarket", {
  ok: true,
  products: [
    {
      product_id: "fixture",
      name: "Fixture",
      price: 1,
      stock: 2,
      type: "account",
      delivery_type: "manual",
      auto_delivery: 1,
    },
  ],
}).offers[0];
assert.notEqual(beforeDelivery.delivery, afterDelivery.delivery);
assert.notEqual(
  beforeDelivery.fingerprint,
  afterDelivery.fingerprint,
  "Delivery semantics must invalidate supplier approval",
);

const { classify, terms } = require("./import-supplier-storefront.cjs");
const { families } = require("./supplier-storefront-families.json");
const apiOffer = {
  name: "API 50M Token Claude 1 Day",
  description: "",
  flags: [],
  warranty: { kind: "NONE" },
};
assert.equal(classify(apiOffer, families).slug, "claude-api");
assert.equal(terms(apiOffer, { name: "Claude API" }).durationDays, 1);
assert.equal(terms(apiOffer, { name: "Claude API" }).variant.quota, "50M Token");
assert.equal(classify({ ...apiOffer, name: "Claude Pro 1 Month" }, families).slug, "claude");
assert.equal(
  classify({ ...apiOffer, name: "Discord Nitro 3M Token not guaranteed" }, families).slug,
  "discord",
);
