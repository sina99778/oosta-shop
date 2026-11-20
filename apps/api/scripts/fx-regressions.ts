import assert from "node:assert/strict";
import { inject } from "light-my-request";
import { prisma } from "../src/lib/prisma";
import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";
import { refreshNavasan, fxStatus, FX_SETTING_KEY } from "../src/modules/suppliers/fx.service";
import { FX_INTERVAL_MS, type FxState } from "../src/modules/suppliers/navasan";
import { variantKey, readVariant } from "../src/modules/suppliers/variant";
async function main() {
  assert.equal(process.env.ISOLATED_REGRESSION_DB, "1");
  process.env.NAVASAN_API_KEY = "SYNTHETIC-NAVASAN-KEY";
  const admin = await prisma.user.create({
    data: { name: "FX fixture admin", passwordHash: "unused", role: "ADMIN" },
  });
  const buyer = await prisma.user.create({
    data: { name: "FX fixture buyer", passwordHash: "unused" },
  });
  const adminToken = signAccessToken({ sub: admin.id, role: "ADMIN" }),
    buyerToken = signAccessToken({ sub: buyer.id, role: "USER" });
  const app = createApp();
  const call = (
    method: "GET" | "PATCH" | "POST",
    url: string,
    payload?: unknown,
    token = adminToken,
  ) => inject(app, { method, url, payload, headers: { authorization: `Bearer ${token}` } });
  const before = globalThis.fetch;
  let requests = 0;
  const stamp = Math.floor(Date.now() / 1000) - 7200;
  globalThis.fetch = async (input, options) => {
    assert.equal(new URL(String(input)).origin, "https://api.navasan.tech");
    assert.equal(options?.method, "GET");
    requests++;
    await new Promise((resolve) => setTimeout(resolve, 40));
    return new Response(
      JSON.stringify({
        usd_sell: { value: "100000", timestamp: stamp },
        usdt: { value: "101000", timestamp: stamp - 60 },
      }),
      { status: 200 },
    );
  };
  const load = async () =>
    JSON.parse(
      (await prisma.siteSetting.findUniqueOrThrow({ where: { key: FX_SETTING_KEY } })).value,
    ) as FxState;
  const save = async (state: FxState) =>
    prisma.siteSetting.update({
      where: { key: FX_SETTING_KEY },
      data: { value: JSON.stringify(state) },
    });
  try {
    await Promise.all(Array.from({ length: 8 }, () => refreshNavasan()));
    assert.equal(requests, 1, "Concurrent workers reserve one attempt before HTTP");
    assert.equal((await load()).attempts.length, 1);
    await refreshNavasan();
    assert.equal(requests, 1, "A fresh worker/restart does not reset pacing");
    const status = await fxStatus();
    assert.equal(status.usedLast31Days, 1);
    assert.equal(status.snapshot?.rates.USD?.irr, "1000000");
    assert(!JSON.stringify(status).includes("SYNTHETIC-NAVASAN-KEY"));
    const publicSettings = await call("GET", "/site-settings", undefined, buyerToken);
    assert(!publicSettings.body.includes("NAVASAN"));
    assert.equal((await call("GET", "/admin/suppliers", undefined, buyerToken)).statusCode, 403);
    const overview = await call("GET", "/admin/suppliers");
    assert.match(String(overview.headers["cache-control"]), /no-store/);
    assert.equal(overview.json().fx.usedLast31Days, 1);
    assert(!overview.body.includes("SYNTHETIC-NAVASAN-KEY"));
    assert.equal(
      (
        await call("PATCH", "/admin/suppliers/pricing", {
          enabled: true,
          rateSource: "NAVASAN_FREE",
          rates: {},
          markupPercent: "30",
          minimumProfitIrr: "0",
          fixedCostIrr: "0",
          ttlSeconds: 60,
        })
      ).statusCode,
      200,
    );
    const category = await prisma.category.create({
      data: { name: "FX fixture", slug: "fx-fixture" },
    });
    const product = await prisma.product.create({
      data: {
        name: "FX fixture",
        slug: "fx-fixture",
        categoryId: category.id,
        type: "LICENSE",
        description: "Synthetic",
      },
    });
    const variant = readVariant({
      plan: "PLUS",
      access: "PERSONAL",
      fulfillment: "ACCOUNT",
      delivery: "MANUAL",
      warranty: { kind: "NONE" },
      region: "GLOBAL",
      quota: "STANDARD",
    })!;
    const fp = "b".repeat(64);
    await prisma.siteSetting.upsert({
      where: { key: "suppliers.catalog.canboso" },
      create: { key: "suppliers.catalog.canboso", value: "" },
      update: {},
    });
    await prisma.siteSetting.update({
      where: { key: "suppliers.catalog.canboso" },
      data: {
        value: JSON.stringify({
          supplier: "canboso",
          fetchedAt: new Date().toISOString(),
          rejected: 0,
          offers: [
            {
              supplier: "canboso",
              externalId: "fx-offer",
              name: "Synthetic",
              description: "",
              cost: "2",
              currency: "USD",
              stock: 2,
              onRequest: false,
              delivery: "MANUAL",
              warranty: { kind: "NONE", days: 0 },
              flags: [],
              fingerprint: fp,
            },
          ],
        }),
      },
    });
    const plan = await prisma.productPlan.create({
      data: {
        productId: product.id,
        label: "FX fixture",
        source: "SUPPLIER",
        price: 0,
        durationDays: 30,
        variant,
        supplierMappings: [
          {
            supplier: "canboso",
            externalId: "fx-offer",
            fingerprint: fp,
            variantKey: variantKey(variant, 30),
          },
        ],
      },
    });
    const quote = await call("POST", "/supplier-quotes", { planId: plan.id }, buyerToken);
    assert.equal(quote.statusCode, 200, quote.body);
    assert.equal(quote.json().quote.amount, 2626000);
    assert.equal(quote.json().quote.fx.source, "NAVASAN_FREE");
    assert.equal(quote.json().quote.fx.sampled, true);
    assert.equal(quote.json().quote.fx.referenceCurrency, "USDT");
    assert.equal(quote.json().quote.checkoutEnabled, false);
    assert.equal(requests, 1);
    const onlyTether = await load();
    delete onlyTether.snapshot!.rates.USD;
    await save(onlyTether);
    const tetherQuote = await call("POST", "/supplier-quotes", { planId: plan.id }, buyerToken);
    assert.equal(tetherQuote.statusCode, 200, tetherQuote.body);
    assert.equal(tetherQuote.json().quote.amount, 2626000);

    const onlyFreshDollar = await load();
    onlyFreshDollar.snapshot!.rates.USD = status.snapshot!.rates.USD;
    onlyFreshDollar.snapshot!.rates.USDT!.updatedAt = new Date(
      Date.now() - 11 * 3600000,
    ).toISOString();
    await save(onlyFreshDollar);
    const dollarQuote = await call("POST", "/supplier-quotes", { planId: plan.id }, buyerToken);
    assert.equal(dollarQuote.statusCode, 200, dollarQuote.body);
    assert.equal(dollarQuote.json().quote.amount, 2600000);
    assert.equal(dollarQuote.json().quote.fx.referenceCurrency, "USD");

    await save(onlyTether);
    const old = await load();
    old.attempts = [new Date(Date.now() - FX_INTERVAL_MS - 1000).toISOString()];
    await save(old);
    globalThis.fetch = async () => {
      requests++;
      throw new Error("SYNTHETIC-NAVASAN-KEY in upstream URL");
    };
    await refreshNavasan();
    const failed = await load();
    assert.equal(failed.attempts.length, 2);
    assert.equal(failed.lastError, "UNAVAILABLE");
    assert(failed.snapshot);
    assert(!JSON.stringify(failed).includes("SYNTHETIC-NAVASAN-KEY"));
    await refreshNavasan();
    assert.equal(requests, 2, "Failures consume budget and pacing survives retry");
    const stale = await load();
    for (const rate of Object.values(stale.snapshot!.rates))
      rate.updatedAt = new Date(Date.now() - 11 * 3600000).toISOString();
    await save(stale);
    assert.equal(
      (await call("POST", "/supplier-quotes", { planId: plan.id }, buyerToken)).statusCode,
      503,
    );
    assert.equal(requests, 2, "A customer quote never spends FX quota");
    const exhausted = await load();
    exhausted.attempts = Array(100).fill(new Date(Date.now() - 86400000).toISOString());
    await save(exhausted);
    await refreshNavasan();
    assert.equal(requests, 2);
    exhausted.attempts = [new Date(Date.now() - FX_INTERVAL_MS - 1000).toISOString()];
    await save(exhausted);
    globalThis.fetch = async () => {
      requests++;
      return new Response("SYNTHETIC-NAVASAN-KEY", { status: 401 });
    };
    await refreshNavasan();
    assert.equal((await load()).blocked, true);
    await refreshNavasan();
    assert.equal(requests, 3);
    process.env.NAVASAN_API_KEY = "SYNTHETIC-ROTATED-KEY";
    await refreshNavasan();
    assert.equal(requests, 3, "Changing keys must not reset blocked state or quota");
    const intact = await load();
    await prisma.siteSetting.update({ where: { key: FX_SETTING_KEY }, data: { value: "{" } });
    await assert.rejects(
      () => refreshNavasan(),
      (e: unknown) => !!e && typeof e === "object" && "code" in e && e.code === "FX_STATE_INVALID",
    );
    assert.equal(requests, 3, "A corrupt ledger must never reset or spend quota");
    await save(intact);
    console.log(
      "PASS: persistent free FX quota, concurrent reservations, failure/restart pacing, source-age pricing and private metadata",
    );
  } finally {
    globalThis.fetch = before;
    delete process.env.NAVASAN_API_KEY;
  }
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
