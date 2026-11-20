import assert from "node:assert/strict";
import { inject } from "light-my-request";
import { prisma } from "../src/lib/prisma";
import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";
import { createOrder, getOrderDetail } from "../src/modules/orders/orders.service";
import { getStats, updatePlan } from "../src/modules/admin/admin.service";
import { matchingOffers } from "../src/modules/suppliers/suppliers.service";
import type { Catalog } from "../src/modules/suppliers/catalog";
import { variantKey, readVariant } from "../src/modules/suppliers/variant";
async function main() {
  assert.equal(process.env.ISOLATED_REGRESSION_DB, "1");
  const admin = await prisma.user.create({
    data: { name: "Supplier fixture admin", passwordHash: "unused", role: "ADMIN" },
  });
  const buyer = await prisma.user.create({
    data: { name: "Supplier fixture buyer", passwordHash: "unused" },
  });
  const stranger = await prisma.user.create({
    data: { name: "Supplier fixture stranger", passwordHash: "unused" },
  });
  const adminToken = signAccessToken({ sub: admin.id, role: "ADMIN" }),
    buyerToken = signAccessToken({ sub: buyer.id, role: "USER" }),
    strangerToken = signAccessToken({ sub: stranger.id, role: "USER" });
  const app = createApp();
  const call = (
    method: "GET" | "POST" | "PATCH" | "PUT",
    url: string,
    payload?: unknown,
    token: string | null = adminToken,
  ) =>
    inject(app, {
      method,
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload,
    });
  assert.equal((await call("GET", "/admin/suppliers", undefined, null)).statusCode, 401);
  assert.equal((await call("GET", "/admin/suppliers", undefined, buyerToken)).statusCode, 403);
  await prisma.user.update({ where: { id: admin.id }, data: { role: "USER" } });
  assert.equal((await call("GET", "/admin/suppliers", undefined, adminToken)).statusCode, 403);
  await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
  process.env.CANBOSO_API_KEY = "fixture-canboso-one";
  process.env.CANBOSO2_API_KEY = "fixture-canboso-two";
  const originalFetch = globalThis.fetch;
  let requests = 0;
  let transactionsDuringFetch = 0;
  let failFetch = false;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://canboso.com/api/v2/telegram-buyer/products");
    assert.equal(init?.method, "GET");
    assert.equal(init?.redirect, "error");
    requests++;
    const [row] = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM pg_stat_activity
      WHERE datname = current_database() AND state = 'idle in transaction'`;
    transactionsDuringFetch += row.count;
    if (failFetch) return new Response("Fixture upstream failure", { status: 503 });
    const second =
      (init?.headers as Record<string, string>)["x-buyer-key"] === "fixture-canboso-two";
    return new Response(
      JSON.stringify({
        success: true,
        products: [
          {
            productId: "same-id",
            name: "Fixture subscription",
            description: "Fixture source",
            price: { amount: second ? 3 : 2, currency: "USD" },
            availability: { available: 10 },
            productType: "account",
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const [one, same] = await Promise.all([
      call("POST", "/admin/suppliers/canboso/sync", {}),
      call("POST", "/admin/suppliers/canboso/sync", {}),
    ]);
    const two = await call("POST", "/admin/suppliers/canboso2/sync", {});
    assert.equal(
      transactionsDuringFetch,
      0,
      "Supplier HTTP must run outside database transactions",
    );
    assert.equal(one.statusCode, 200, one.body);
    assert.equal(same.statusCode, 200, same.body);
    assert.deepEqual(same.json().catalog, one.json().catalog);
    assert.equal(two.statusCode, 200, two.body);
    assert.equal(requests, 2);
    const offer1 = one.json().catalog.offers[0],
      offer2 = two.json().catalog.offers[0];
    assert.equal(offer1.cost, "2");
    assert.equal(offer2.cost, "3");
    const overview = await call("GET", "/admin/suppliers");
    assert.match(String(overview.headers["cache-control"]), /no-store/);
    assert(!overview.body.includes("fixture-canboso-one"));
    const publicSettings = await call("GET", "/site-settings", undefined, null);
    assert(!publicSettings.body.includes("Fixture source"));
    const category = await prisma.category.create({
      data: { name: "Supplier fixtures", slug: "supplier-fixtures" },
    });
    const product = await prisma.product.create({
      data: {
        name: "Supplier fixture",
        slug: "supplier-fixture",
        type: "LICENSE",
        description: "Fixture",
        categoryId: category.id,
      },
    });
    const variant = {
      plan: "PLUS",
      access: "PERSONAL",
      fulfillment: "ACCOUNT",
      delivery: "AUTOMATIC",
      warranty: { kind: "UNKNOWN" },
      region: "GLOBAL",
      quota: "STANDARD",
    };
    const created = await call("POST", `/admin/products/${product.id}/plans`, {
      label: "Supplier fixture plan",
      durationDays: 30,
      price: 9999990,
      source: "SUPPLIER",
      variant,
    });
    assert.equal(created.statusCode, 201, created.body);
    const plan = created.json().plan;
    assert.equal(plan.variant.warranty.kind, "NONE");
    const map = (supplier: string, offer: typeof offer1, automaticVerified = false) => ({
      supplier,
      externalId: offer.externalId,
      fingerprint: offer.fingerprint,
      automaticVerified,
    });
    const unsupportedWarranty = await call("POST", `/admin/products/${product.id}/plans`, {
      label: "Unsupported warranty fixture",
      price: 100,
      durationDays: 30,
      source: "SUPPLIER",
      variant: { ...variant, warranty: { kind: "WARRANTED", days: 30, coverage: "FULL" } },
      supplierMappings: [map("canboso", offer1, true)],
    });
    assert.equal(
      unsupportedWarranty.statusCode,
      409,
      "Unknown supplier warranty must not fund a warranted option",
    );
    assert.equal(
      (
        await call("PATCH", `/admin/plans/${plan.id}`, {
          supplierMappings: [map("canboso", offer1)],
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await call("PATCH", `/admin/plans/${plan.id}`, {
          supplierMappings: [map("canboso", offer1, true), map("canboso2", offer2, true)],
        })
      ).statusCode,
      200,
    );
    const detail = await call("GET", "/products/supplier-fixture", undefined, null);
    assert.equal(detail.statusCode, 200, detail.body);
    const publicPlan = detail.json().product.plans[0];
    assert.equal(publicPlan.price, 0);
    assert.equal(publicPlan.quoteRequired, true);
    assert.equal(publicPlan.inStock, true);
    assert.equal(publicPlan.availability, "SUPPLIER_STOCK");
    assert.equal(detail.json().product.availability, "SUPPLIER_STOCK");
    assert.equal(detail.json().product.availableStock, 0);
    const adminDetail = await call("GET", `/admin/products/${product.id}`);
    assert.equal(adminDetail.statusCode, 200);
    assert.deepEqual(adminDetail.json().product.plans[0].supplierAvailability, {
      kind: "confirmed",
      count: publicPlan.availableStock,
    });
    assert(!(await getStats()).lowStock.some((item) => item.id === product.id));
    await prisma.productPlan.create({
      data: { productId: product.id, label: "Sold-out local alternative", price: 10000000 },
    });
    const catalog = await call("GET", "/products?category=supplier-fixtures", undefined, null);
    assert.equal(catalog.statusCode, 200);
    assert.equal(catalog.json().items[0].priceFrom, null);
    assert.equal(catalog.json().items[0].pricePlanId, null);
    assert.equal(catalog.json().items[0].quoteRequired, true);
    assert(!detail.body.includes("supplierMappings"));
    assert(!detail.body.includes(offer1.fingerprint));
    assert(!detail.body.includes("Fixture source"));
    assert.equal(
      (await call("POST", "/supplier-quotes", { planId: plan.id }, null)).statusCode,
      401,
    );
    assert.equal(
      (await call("POST", "/supplier-quotes", { planId: plan.id }, buyerToken)).statusCode,
      503,
    );
    assert.equal(
      (
        await call("PATCH", "/admin/suppliers/pricing", {
          enabled: true,
          rates: { USD: "1000000", USDT: "1010000" },
          markupPercent: "30",
          minimumProfitIrr: "0",
          fixedCostIrr: "0",
          ttlSeconds: 300,
        })
      ).statusCode,
      200,
    );
    const rejectedFloor = await call("PATCH", "/admin/suppliers/pricing", {
      enabled: true,
      rates: { USD: "1000000" },
      markupPercent: "30",
      minimumProfitIrr: "500000",
      fixedCostIrr: "0",
      ttlSeconds: 300,
    });
    assert.equal(rejectedFloor.statusCode, 400);
    assert.equal((await call("PATCH", "/admin/suppliers/pricing", {}, buyerToken)).statusCode, 403);
    const quoted = await call("POST", "/supplier-quotes", { planId: plan.id }, buyerToken);
    assert.equal(quoted.statusCode, 200, quoted.body);
    assert.match(String(quoted.headers["cache-control"]), /no-store/);
    assert.equal(quoted.json().quote.amount, 2600000);
    assert.equal(quoted.json().quote.range.max, 3900000);
    assert.equal(quoted.json().quote.checkoutEnabled, false);
    assert(!quoted.body.includes("fingerprint"));
    assert(!quoted.body.includes("canboso"));
    assert.equal(
      (await call("POST", "/supplier-quotes", { planId: plan.id, quantity: 2 }, buyerToken))
        .statusCode,
      400,
    );
    const replaceCatalog = async (id: string, change: (c: Catalog) => void) => {
      const key = "suppliers.catalog." + id;
      const row = await prisma.siteSetting.findUniqueOrThrow({ where: { key } });
      const value = JSON.parse(row.value);
      change(value);
      await prisma.siteSetting.update({ where: { key }, data: { value: JSON.stringify(value) } });
    };
    await replaceCatalog("canboso", (c) => {
      c.offers[0].stock = 0;
    });
    const onlySecond = await call("POST", "/supplier-quotes", { planId: plan.id }, buyerToken);
    assert.equal(onlySecond.statusCode, 200);
    assert.equal(onlySecond.json().quote.amount, 3900000);
    await replaceCatalog("canboso", (c) => {
      c.offers[0].stock = 10;
    });
    for (const id of ["canboso", "canboso2"]) {
      await replaceCatalog(id, (c) => {
        c.fetchedAt = new Date(Date.now() - 61000).toISOString();
      });
    }
    const stale = await call("GET", "/products/supplier-fixture", undefined, null);
    assert.equal(stale.json().product.plans[0].availability, "OUT_OF_STOCK");
    assert.equal(stale.json().product.quoteRequired, false);
    assert.equal(stale.json().product.priceFrom, null);
    for (const id of ["canboso", "canboso2"]) {
      await replaceCatalog(id, (c) => {
        c.fetchedAt = new Date().toISOString();
      });
    }
    // Expired conversion data must never fall back to an old quote or a peg assumption.
    const pricingRow = await prisma.siteSetting.findUniqueOrThrow({
      where: { key: "suppliers.pricing" },
    });
    const originalPolicy = JSON.parse(pricingRow.value);
    await prisma.siteSetting.update({
      where: { key: "suppliers.pricing" },
      data: {
        value: JSON.stringify({
          ...originalPolicy,
          updatedAt: new Date(Date.now() - 301000).toISOString(),
        }),
      },
    });
    assert.equal(
      (await call("POST", "/supplier-quotes", { planId: plan.id }, buyerToken)).statusCode,
      503,
    );
    await prisma.siteSetting.update({
      where: { key: "suppliers.pricing" },
      data: { value: JSON.stringify({ ...originalPolicy, rates: { USDT: "1000000" } }) },
    });
    assert.equal(
      (await call("POST", "/supplier-quotes", { planId: plan.id }, buyerToken)).statusCode,
      503,
    );
    await prisma.siteSetting.update({
      where: { key: "suppliers.pricing" },
      data: { value: pricingRow.value },
    });

    const savedPlan = await prisma.productPlan.findUniqueOrThrow({ where: { id: plan.id } });
    const c1 = JSON.parse(
      (await prisma.siteSetting.findUniqueOrThrow({ where: { key: "suppliers.catalog.canboso" } }))
        .value,
    ) as Catalog;
    const c2 = JSON.parse(
      (await prisma.siteSetting.findUniqueOrThrow({ where: { key: "suppliers.catalog.canboso2" } }))
        .value,
    ) as Catalog;
    const fixtureNow = Date.now();
    for (const [label, mutate] of [
      [
        "expired",
        (c: Catalog) => {
          c.fetchedAt = new Date(fixtureNow - 60001).toISOString();
        },
      ],
      [
        "future",
        (c: Catalog) => {
          c.fetchedAt = new Date(fixtureNow + 1000).toISOString();
        },
      ],
      [
        "different fingerprint",
        (c: Catalog) => {
          c.offers[0].fingerprint = "0".repeat(64);
        },
      ],
      [
        "different warranty",
        (c: Catalog) => {
          c.offers[0].warranty = { kind: "WARRANTED", days: 1 };
        },
      ],
      [
        "different delivery",
        (c: Catalog) => {
          c.offers[0].delivery = "MANUAL";
        },
      ],
      [
        "blocked input",
        (c: Catalog) => {
          c.offers[0].flags = ["SENSITIVE_MANUAL_FLOW"];
        },
      ],
    ] as const) {
      const changed = structuredClone(c1);
      mutate(changed);
      const matches = matchingOffers(
        savedPlan,
        new Map([
          ["canboso", changed],
          ["canboso2", c2],
        ]),
        fixtureNow,
      );
      assert.equal(matches.length, 1, label);
      assert.equal(matches[0].offer.supplier, "canboso2", label);
    }
    for (const change of [
      { plan: "PRO" },
      { access: "TEAM" },
      { fulfillment: "INVITE" },
      { delivery: "MANUAL" },
      { region: "OTHER" },
      { quota: "OTHER" },
      { warranty: { kind: "WARRANTED", days: 30, coverage: "FULL" } },
    ])
      assert.equal(
        matchingOffers(
          { ...savedPlan, variant: { ...readVariant(savedPlan.variant)!, ...change } },
          new Map([
            ["canboso", c1],
            ["canboso2", c2],
          ]),
          fixtureNow,
        ).length,
        0,
        "Semantic changes must invalidate all old mappings",
      );
    assert.equal(
      matchingOffers({ ...savedPlan, durationDays: 31 }, new Map([["canboso", c1]]), fixtureNow)
        .length,
      0,
    );
    const before = await prisma.order.count();
    const buy = await call(
      "POST",
      "/orders",
      { items: [{ planId: plan.id, quantity: 1 }] },
      buyerToken,
    );
    assert.equal(buy.statusCode, 503, buy.body);
    assert.equal(await prisma.order.count(), before);
    assert.equal(requests, 2);
    assert.equal(
      (
        await call("POST", "/admin/inventory/bulk", {
          planId: plan.id,
          items: [{ licenseKey: "SYNTHETIC-EXTERNAL" }],
        })
      ).statusCode,
      409,
    );
    // A semantic edit invalidates approval of the old supplier variant.
    assert.equal(
      (
        await call("PATCH", `/admin/plans/${plan.id}`, {
          variant: { ...variant, delivery: "MANUAL" },
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await prisma.productPlan.findUniqueOrThrow({ where: { id: plan.id } })
      ).supplierMappings?.toString(),
      "",
    );
    assert.equal(
      (await call("POST", "/supplier-quotes", { planId: plan.id }, buyerToken)).statusCode,
      409,
    );
    const mismatchedDelivery = await call("PATCH", `/admin/plans/${plan.id}`, {
      supplierMappings: [map("canboso", offer1, true)],
    });
    assert.equal(
      mismatchedDelivery.statusCode,
      409,
      "Automatic and manual sources must remain separate",
    );
    const local = await prisma.productPlan.create({
      data: {
        productId: product.id,
        label: "Original terms",
        price: 100,
        durationDays: 30,
        variant: readVariant(variant)!,
      },
    });
    await prisma.inventoryItem.create({
      data: {
        productId: product.id,
        planId: local.id,
        type: "LICENSE",
        licenseKey: "SYNTHETIC-SNAPSHOT",
      },
    });
    await prisma.siteSetting.upsert({
      where: { key: "pay.provider" },
      create: { key: "pay.provider", value: "mock" },
      update: { value: "mock" },
    });
    const order = await createOrder(buyer.id, {
      items: [{ planId: local.id, quantity: 1 }],
      method: "online",
    });
    await updatePlan(local.id, { label: "Changed current label" });
    const saved = await getOrderDetail(buyer.id, order.order.id);
    assert.equal(saved.items[0].plan.label, "Original terms");
    assert.equal(saved.items[0].plan.variant?.warranty.kind, "NONE");
    await assert.rejects(() =>
      updatePlan(local.id, { variant: { ...readVariant(variant)!, delivery: "MANUAL" } }),
    );
    assert.equal(
      (await call("GET", `/orders/${order.order.id}`, undefined, strangerToken)).statusCode,
      404,
    );
    assert.equal(
      variantKey(readVariant(variant)!, 30),
      variantKey(readVariant({ ...variant, warranty: { kind: "NONE" } })!, 30),
    );
    const key = "suppliers.catalog.canboso";
    const staleSnapshot = JSON.stringify({
      ...one.json().catalog,
      fetchedAt: new Date(0).toISOString(),
    });
    await prisma.siteSetting.update({ where: { key }, data: { value: staleSnapshot } });
    failFetch = true;
    const unavailable = await call("POST", "/admin/suppliers/canboso/sync", {});
    assert.equal(unavailable.statusCode, 502, unavailable.body);
    assert.equal(unavailable.json().error.code, "SUPPLIER_UNAVAILABLE");
    assert.doesNotMatch(unavailable.body, /Fixture upstream failure|fixture-canboso-one/);
    assert.equal((await prisma.siteSetting.findUniqueOrThrow({ where: { key } })).value, staleSnapshot);
    failFetch = false;
    const retry = await call("POST", "/admin/suppliers/canboso/sync", {});
    assert.equal(retry.statusCode, 200, retry.body);
    assert.notEqual((await prisma.siteSetting.findUniqueOrThrow({ where: { key } })).value, staleSnapshot);
    console.log(
      "PASS: supplier admin access, account isolation, safe quotes, checkout denial, immutable variants and order ownership",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
