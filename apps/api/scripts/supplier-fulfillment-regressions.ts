import type { SupplierId } from "../src/modules/suppliers/catalog";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { inject } from "light-my-request";
import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";
import { prisma } from "../src/lib/prisma";
import { variantKey, variantSchema } from "../src/modules/suppliers/variant";
import {
  prepareSupplierFulfillment,
  processSupplierFulfillment,
  reconcileSupplierFulfillment,
  type SupplierAdapter,
} from "../src/modules/suppliers/fulfillment";

assert.equal(process.env.ISOLATED_REGRESSION_DB, "1");
const variant = variantSchema.parse({
  plan: "Synthetic Plus",
  access: "PERSONAL",
  fulfillment: "ACCOUNT",
  delivery: "AUTOMATIC",
  warranty: { kind: "NONE" },
  region: "GLOBAL",
  quota: "MONTHLY",
});
const signature = variantKey(variant, 30);
const catalog = (supplier: SupplierId, cost: string, fingerprint: string) => ({
  supplier,
  fetchedAt: new Date().toISOString(),
  rejected: 0,
  offers: [
    {
      supplier,
      externalId: "synthetic-sku",
      name: "Synthetic Plus",
      description: "Synthetic fixture",
      cost,
      currency: "USD",
      stock: 5,
      onRequest: false,
      delivery: "AUTOMATIC",
      warranty: { kind: "NONE", days: 0 },
      flags: [],
      fingerprint,
    },
  ],
});
let buys = 0,
  lookups = 0;
let fixtureNumber = 0;
const complete = (input: { reference: string; externalId: string }) => ({
  state: "COMPLETE",
  reference: input.reference,
  externalId: input.externalId,
  quantity: 1,
  currency: "USD",
  amount: "8",
  supplierOrderId: "synthetic-vendor-" + fixtureNumber,
  credential: {
    type: "ACCOUNT",
    accountEmail: "synthetic@example.invalid",
    accountPassword: "Synthetic-only-1",
  },
});
function adapter(): SupplierAdapter {
  return {
    capabilities: { priceCeiling: true, idempotency: true, lookup: true },
    quote: async (input) => ({
      quoteId: randomUUID(),
      externalId: input.externalId,
      quantity: 1,
      currency: "USD",
      cost: input.maximumCost,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    }),
    purchase: async (input) => {
      buys++;
      return complete(input);
    },
    lookup: async (input) => {
      lookups++;
      return complete(input);
    },
  };
}
async function fixture() {
  fixtureNumber++;
  buys = 0;
  lookups = 0;
  for (const c of [
    catalog("ventebot", "10", "a".repeat(64)),
    catalog("canboso2", "8", "b".repeat(64)),
  ])
    await prisma.siteSetting.upsert({
      where: { key: "suppliers.catalog." + c.supplier },
      create: { key: "suppliers.catalog." + c.supplier, value: JSON.stringify(c) },
      update: { value: JSON.stringify(c) },
    });
  const pricing = {
    enabled: true,
    rateSource: "MANUAL",
    rates: { USD: "100000", USDT: "100000" },
    markupPercent: "30",
    minimumProfitIrr: "0",
    fixedCostIrr: "0",
    ttlSeconds: 900,
    updatedAt: new Date().toISOString(),
  };
  await prisma.siteSetting.upsert({
    where: { key: "suppliers.pricing" },
    create: { key: "suppliers.pricing", value: JSON.stringify(pricing) },
    update: { value: JSON.stringify(pricing) },
  });
  const user = await prisma.user.create({
    data: {
      name: "Synthetic fulfillment",
      email: randomUUID() + "@example.invalid",
      passwordHash: "synthetic-unused",
    },
  });
  const product = await prisma.product.create({
    data: {
      name: "Synthetic product",
      category: { create: { name: "Synthetic category", slug: randomUUID() } },
      slug: randomUUID(),
      type: "ACCOUNT",
      description: "Synthetic only",
      isActive: true,
      plans: {
        create: {
          label: "Synthetic month",
          price: 1300000,
          source: "SUPPLIER",
          durationDays: 30,
          variant,
          supplierMappings: [
            {
              supplier: "ventebot",
              externalId: "synthetic-sku",
              fingerprint: "a".repeat(64),
              variantKey: signature,
            },
            {
              supplier: "canboso2",
              externalId: "synthetic-sku",
              fingerprint: "b".repeat(64),
              variantKey: signature,
            },
          ],
        },
      },
    },
    include: { plans: true },
  });
  const order = await prisma.order.create({
    data: {
      userId: user.id,
      totalAmount: 1300000,
      currency: "IRR",
      paymentStatus: "PAID_PENDING_FULFILLMENT",
      paidAt: new Date(),
      paymentProvider: "ZARINPAL",
      paymentRefId: "synthetic-verified-" + randomUUID(),
      items: {
        create: {
          productId: product.id,
          planId: product.plans[0].id,
          quantity: 1,
          unitPrice: 1300000,
          lineTotal: 1300000,
          planSnapshot: { source: "SUPPLIER", variant, durationDays: 30 },
        },
      },
    },
    include: { items: true },
  });
  const registry = new Map<SupplierId, SupplierAdapter>([
    ["ventebot", adapter()],
    ["canboso2", adapter()],
  ]);
  return { user, product, order, registry };
}
async function job(f: Awaited<ReturnType<typeof fixture>>) {
  return prepareSupplierFulfillment(f.order.id, f.registry);
}
async function main() {
  for (const denied of ["unpaid", "role", "snapshot", "unsupported"]) {
    const f = await fixture();
    if (denied === "unpaid")
      await prisma.order.update({
        where: { id: f.order.id },
        data: { paymentStatus: "PENDING", paidAt: null },
      });
    if (denied === "role")
      await prisma.user.update({ where: { id: f.user.id }, data: { role: "ADMIN" } });
    if (denied === "snapshot")
      await prisma.orderItem.update({
        where: { id: f.order.items[0].id },
        data: {
          planSnapshot: {
            source: "SUPPLIER",
            variant: { ...variant, access: "SHARED" },
            durationDays: 30,
          },
        },
      });
    if (denied === "unsupported")
      for (const a of f.registry.values()) a.capabilities.priceCeiling = false;
    await assert.rejects(job(f));
    assert.equal(buys, 0);
    assert.equal(await prisma.supplierFulfillment.count({ where: { orderId: f.order.id } }), 0);
  }
  const mixed = await fixture();
  const usdPolicy = {
    enabled: true,
    rateSource: "MANUAL",
    rates: { USD: "100000" },
    markupPercent: "30",
    minimumProfitIrr: "0",
    fixedCostIrr: "0",
    ttlSeconds: 900,
    updatedAt: new Date().toISOString(),
  };
  await prisma.siteSetting.update({
    where: { key: "suppliers.pricing" },
    data: { value: JSON.stringify(usdPolicy) },
  });
  const usdt = catalog("canboso2", "8", "b".repeat(64));
  usdt.offers[0].currency = "USDT";
  await prisma.siteSetting.update({
    where: { key: "suppliers.catalog.canboso2" },
    data: { value: JSON.stringify(usdt) },
  });
  const usable = await job(mixed);
  assert.equal(
    (await prisma.supplierFulfillment.findUniqueOrThrow({ where: { id: usable.id } })).supplier,
    "ventebot",
  );
  const f = await fixture();
  const j = await job(f);
  const stored = await prisma.supplierFulfillment.findUniqueOrThrow({ where: { id: j.id } });
  assert.equal(stored.supplier, "canboso2");
  assert.equal(stored.maximumCost.toString(), "8");
  const results = await Promise.all([
    processSupplierFulfillment(j.id, f.registry),
    processSupplierFulfillment(j.id, f.registry),
    processSupplierFulfillment(j.id, f.registry),
  ]);
  assert(results.some((r) => r.state === "DELIVERED"));
  assert.equal(buys, 1);
  assert.equal(
    await prisma.inventoryItem.count({
      where: { orderItemId: f.order.items[0].id, status: "SOLD" },
    }),
    1,
  );
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: f.order.id } })).paymentStatus,
    "PAID",
  );
  await processSupplierFulfillment(j.id, f.registry);
  await reconcileSupplierFulfillment(j.id, f.registry);
  assert.equal(buys, 1);
  const app = createApp();
  const owner = await inject(app, {
    method: "GET",
    url: "/orders/" + f.order.id,
    headers: {
      authorization: "Bearer " + signAccessToken({ sub: f.user.id, role: "USER", sv: 0 }),
    },
  });
  assert.equal(owner.statusCode, 200);
  assert.match(String(owner.headers["cache-control"]), /no-store/);
  assert.equal(owner.json().order.items[0].credentials.length, 1);
  assert.equal(
    (await inject(app, { method: "GET", url: "/orders/" + f.order.id })).statusCode,
    401,
  );
  const other = await prisma.user.create({
    data: { name: "Other synthetic buyer", passwordHash: "unused" },
  });
  assert.equal(
    (
      await inject(app, {
        method: "GET",
        url: "/orders/" + f.order.id,
        headers: {
          authorization: "Bearer " + signAccessToken({ sub: other.id, role: "USER", sv: 0 }),
        },
      })
    ).statusCode,
    404,
  );
  assert(!JSON.stringify(results).includes("Synthetic-only-1"));
  const repriced = await fixture();
  await prisma.siteSetting.update({
    where: { key: "suppliers.catalog.ventebot" },
    data: { value: JSON.stringify(catalog("ventebot", "11", "a".repeat(64))) },
  });
  const originalQuote = repriced.registry.get("ventebot")!.quote;
  repriced.registry.get("ventebot")!.quote = async (input) => ({
    ...((await originalQuote(input)) as object),
    cost: "7",
  });
  const cheapestLocked = await job(repriced);
  assert.equal(
    (await prisma.supplierFulfillment.findUniqueOrThrow({ where: { id: cheapestLocked.id } }))
      .supplier,
    "ventebot",
    "Compare current locked quotes, not only cached catalog prices",
  );
  const atomic = await fixture();
  const atomicJob = await job(atomic);
  await prisma.$executeRawUnsafe(
    `CREATE FUNCTION supplier_fulfillment_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.state = 'DELIVERED' THEN RAISE EXCEPTION 'synthetic fulfillment write failure'; END IF; RETURN NEW; END $$`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER supplier_fulfillment_test_failure BEFORE UPDATE ON supplier_fulfillments FOR EACH ROW EXECUTE FUNCTION supplier_fulfillment_test_failure()`,
  );
  try {
    await assert.rejects(processSupplierFulfillment(atomicJob.id, atomic.registry));
    assert.equal(buys, 1);
    assert.equal(
      (await prisma.order.findUniqueOrThrow({ where: { id: atomic.order.id } })).paymentStatus,
      "PAID_PENDING_FULFILLMENT",
    );
    assert.equal(
      await prisma.inventoryItem.count({ where: { orderItemId: atomic.order.items[0].id } }),
      0,
    );
  } finally {
    await prisma.$executeRawUnsafe(
      `DROP TRIGGER supplier_fulfillment_test_failure ON supplier_fulfillments`,
    );
    await prisma.$executeRawUnsafe(`DROP FUNCTION supplier_fulfillment_test_failure()`);
  }
  await processSupplierFulfillment(atomicJob.id, atomic.registry);
  assert.equal(buys, 1);
  assert.equal(
    (await reconcileSupplierFulfillment(atomicJob.id, atomic.registry)).state,
    "DELIVERED",
  );
  assert.equal(buys, 1);
  for (const failure of [
    "expired",
    "drift",
    "price",
    "identity",
    "currency",
    "credential",
    "closed",
    "no-charge",
    "pending",
    "timeout",
    "crash",
  ]) {
    const x = await fixture(),
      a = x.registry.get("canboso2")!;
    if (failure === "price")
      a.purchase = async (input) => {
        buys++;
        return { ...complete(input), amount: "9" };
      };
    if (failure === "identity")
      a.purchase = async (input) => {
        buys++;
        return { ...complete(input), reference: "another-order" };
      };
    if (failure === "currency")
      a.purchase = async (input) => {
        buys++;
        return { ...complete(input), currency: "USDT" };
      };
    if (failure === "credential")
      a.purchase = async (input) => {
        buys++;
        return { ...complete(input), credential: { type: "LICENSE", licenseKey: "wrong-type" } };
      };
    if (failure === "closed")
      a.purchase = async (input) => {
        buys++;
        await prisma.order.update({
          where: { id: x.order.id },
          data: { paymentStatus: "REFUNDED" },
        });
        return complete(input);
      };
    if (failure === "no-charge")
      a.purchase = async (input) => {
        buys++;
        return { state: "NO_CHARGE", reference: input.reference, externalId: input.externalId };
      };
    if (failure === "pending")
      a.purchase = async (input) => {
        buys++;
        const { credential: _unused, ...r } = complete(input);
        return { ...r, state: "PENDING" };
      };
    if (failure === "timeout")
      a.purchase = async () => {
        buys++;
        throw Error("synthetic timeout with sensitive text");
      };
    const q = await job(x);
    if (failure === "expired")
      await prisma.supplierFulfillment.update({
        where: { id: q.id },
        data: { expiresAt: new Date(0) },
      });
    if (failure === "drift")
      await prisma.productPlan.update({
        where: { id: x.product.plans[0].id },
        data: { variant: { ...variant, access: "SHARED" } },
      });
    if (failure === "crash")
      await prisma.supplierFulfillment.update({ where: { id: q.id }, data: { state: "SENDING" } });
    const r = await processSupplierFulfillment(q.id, x.registry);
    if (["expired", "drift"].includes(failure)) {
      assert.equal(buys, 0);
      assert.equal(r.state, "REVIEW");
    } else if (failure === "crash") {
      assert.equal(buys, 0);
      assert.equal(r.state, "SENDING");
    } else assert.equal(buys, 1);
    assert.equal(
      await prisma.inventoryItem.count({ where: { orderItemId: x.order.items[0].id } }),
      0,
    );
    if (["pending", "timeout", "crash"].includes(failure)) {
      a.lookup = async () => {
        lookups++;
        return { state: "NOT_FOUND" };
      };
      assert.equal((await reconcileSupplierFulfillment(q.id, x.registry)).state, "UNCERTAIN");
      await processSupplierFulfillment(q.id, x.registry);
      assert.equal(buys, failure === "crash" ? 0 : 1);
      a.lookup = async (input) => {
        lookups++;
        return complete(input);
      };
      assert.equal((await reconcileSupplierFulfillment(q.id, x.registry)).state, "DELIVERED");
      assert(lookups >= 2);
      assert.equal(
        await prisma.inventoryItem.count({
          where: { orderItemId: x.order.items[0].id, status: "SOLD" },
        }),
        1,
      );
    } else assert.equal(r.state, failure === "no-charge" ? "NO_CHARGE" : "REVIEW");
    const count = buys;
    await processSupplierFulfillment(q.id, x.registry);
    assert.equal(buys, count);
  }
  const blocked = await fixture();
  await assert.rejects(prepareSupplierFulfillment(blocked.order.id));
  assert.equal(buys, 0);
  assert.equal(new Prisma.Decimal("8").toString(), "8");
  console.log(
    "PASS: supplier paid-only gate, exact variants, price ceiling capability, cheapest selection, single dispatch/delivery, expiry, price/identity/credential denial, refund race, no-charge, pending/timeout/crash lookup recovery and empty live registry",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
