import type { SupplierId } from "../src/modules/suppliers/catalog";
import assert from "node:assert/strict";
import { createHash, createHmac, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { Prisma } from "@prisma/client";
import { inject } from "light-my-request";
import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";
import { env } from "../src/config/env";
import { uploadReceipt } from "../src/modules/orders/orders.service";
import { readBluInvoice } from "../src/modules/orders/blu-invoice";
import { pendingBluQaReceipts } from "../src/modules/orders/blu-qa-poll";
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
const complete = (input: { reference: string; externalId: string }) => ({
  state: "COMPLETE",
  reference: input.reference,
  externalId: input.externalId,
  quantity: 1,
  currency: "USD",
  amount: "8",
  supplierOrderId: "synthetic-vendor-" + input.reference,
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
  const customer = await fixture();
  await prisma.siteSetting.upsert({
    where: { key: "pay.provider" },
    create: { key: "pay.provider", value: "mock" },
    update: { value: "mock" },
  });
  const shop = createApp({ supplierAdapters: customer.registry });
  const headers = {
    authorization: "Bearer " + signAccessToken({ sub: customer.user.id, role: "USER", sv: 0 }),
    "content-type": "application/json",
  };
  const post = (url: string, payload: unknown, h = headers) =>
    inject(shop, { method: "POST", url, headers: h, payload: JSON.stringify(payload) });
  assert.equal(
    (
      await post(
        "/supplier-checkout/quotes",
        { planId: customer.product.plans[0].id },
        {} as typeof headers,
      )
    ).statusCode,
    401,
  );
  const quoted = await post("/supplier-checkout/quotes", { planId: customer.product.plans[0].id });
  assert.equal(quoted.statusCode, 201, quoted.body);
  const firm = quoted.json().quote;
  assert.equal(firm.kind, "FIRM");
  assert.equal(firm.amount, 1040000);
  assert.equal(firm.checkoutEnabled, true);
  assert(!quoted.body.includes("synthetic-sku"));
  assert.match(String(quoted.headers["cache-control"]), /no-store/);
  const otherHeaders = {
    ...headers,
    authorization: "Bearer " + signAccessToken({ sub: other.id, role: "USER", sv: 0 }),
  };
  assert.equal(
    (await post("/supplier-checkout/orders", { quoteId: firm.id }, otherHeaders)).statusCode,
    404,
  );
  assert.equal(
    (await post("/supplier-checkout/orders", { quoteId: firm.id, amount: 1 })).statusCode,
    400,
  );
  const consumed = await Promise.all([
    post("/supplier-checkout/orders", { quoteId: firm.id }),
    post("/supplier-checkout/orders", { quoteId: firm.id }),
  ]);
  const opened = consumed.find((r) => r.statusCode === 201)!;
  assert(opened, consumed.map((r) => r.body).join(" "));
  const purchase = opened.json();
  assert.equal(purchase.order.totalAmount, firm.amount);
  assert.equal(buys, 0);
  const repeated = await post("/supplier-checkout/orders", { quoteId: firm.id });
  assert.equal(repeated.statusCode, 201);
  assert.equal(repeated.json().order.id, purchase.order.id);
  assert.equal(repeated.json().payment.authority, purchase.payment.authority);
  const verify = (status: string, authority = purchase.payment.authority) =>
    post("/payments/verify", { authority, status });
  assert.equal((await verify("OK", "unknown-synthetic-authority")).statusCode, 404);
  assert.equal(buys, 0);
  assert.equal((await verify("NOK")).json().status, "failed");
  assert.equal(buys, 0);
  assert.equal((await verify("OK")).json().status, "paid");
  assert.equal(buys, 1);
  await Promise.all([verify("OK"), verify("NOK"), verify("OK")]);
  assert.equal(buys, 1);
  const paidVault = await inject(shop, {
    method: "GET",
    url: "/orders/" + purchase.order.id,
    headers,
  });
  assert.equal(paidVault.statusCode, 200);
  assert.equal(paidVault.json().order.items[0].credentials.length, 1);
  const expiredQuote = (
    await post("/supplier-checkout/quotes", { planId: customer.product.plans[0].id })
  ).json().quote;
  await prisma.supplierCheckoutQuote.update({
    where: { id: expiredQuote.id },
    data: { expiresAt: new Date(0) },
  });
  assert.equal(
    (await post("/supplier-checkout/orders", { quoteId: expiredQuote.id })).statusCode,
    409,
  );
  assert.equal(buys, 1);
  const late = (
    await post("/supplier-checkout/quotes", { planId: customer.product.plans[0].id })
  ).json().quote;
  const lateOrder = (await post("/supplier-checkout/orders", { quoteId: late.id })).json();
  await prisma.supplierFulfillment.update({
    where: { orderId: lateOrder.order.id },
    data: { expiresAt: new Date(0) },
  });
  await prisma.supplierCheckoutQuote.update({
    where: { id: late.id },
    data: { expiresAt: new Date(0) },
  });
  assert.equal(
    (await post("/supplier-checkout/orders", { quoteId: late.id })).statusCode,
    409,
    "Expired unpaid sessions must not reopen payment links",
  );
  assert.equal((await verify("OK", lateOrder.payment.authority)).json().status, "pending");
  assert.equal(buys, 1);
  const pendingQuote = (
    await post("/supplier-checkout/quotes", { planId: customer.product.plans[0].id })
  ).json().quote;
  const pendingOrder = (
    await post("/supplier-checkout/orders", { quoteId: pendingQuote.id })
  ).json();
  customer.registry.get("canboso2")!.purchase = async () => {
    buys++;
    throw Error("synthetic transport failure");
  };
  assert.equal((await verify("OK", pendingOrder.payment.authority)).json().status, "pending");
  assert.equal(buys, 2);
  // A fresh app instance recovers from the persisted reference by lookup, never a new POST.
  const recovered = createApp({ supplierAdapters: customer.registry });
  await recovered.locals.supplierCheckout.sweep();
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: pendingOrder.order.id } })).paymentStatus,
    "PAID",
  );
  assert.equal(buys, 2);
  assert.equal(
    (
      await inject(createApp(), {
        method: "POST",
        url: "/supplier-checkout/quotes",
        headers,
        payload: JSON.stringify({ planId: customer.product.plans[0].id }),
      })
    ).statusCode,
    503,
  );
  const waiting: string[] = [];
  for (let i = 0; i < 6; i++) {
    const queued = (
      await post("/supplier-checkout/quotes", { planId: customer.product.plans[0].id })
    ).json().quote;
    const next = (await post("/supplier-checkout/orders", { quoteId: queued.id })).json();
    waiting.push(next.order.id);
    await prisma.order.update({
      where: { id: next.order.id },
      data: {
        paymentStatus: "PAID_PENDING_FULFILLMENT",
        paidAt: new Date(),
        paymentRefId: "synthetic-worker-" + i,
      },
    });
    await prisma.supplierFulfillment.update({
      where: { orderId: next.order.id },
      data: { state: i < 5 ? "PENDING" : "READY" },
    });
  }
  customer.registry.get("canboso2")!.lookup = async () => {
    throw Error("synthetic unavailable lookup");
  };
  customer.registry.get("canboso2")!.purchase = async (input) => {
    buys++;
    return complete(input);
  };
  const beforeSweep = buys;
  await recovered.locals.supplierCheckout.sweep();
  await recovered.locals.supplierCheckout.sweep();
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: waiting[5] } })).paymentStatus,
    "PAID",
    "Failing lookups must not starve later paid orders",
  );
  assert.equal(buys, beforeSweep + 1);
  const card = await fixture();
  const signing = generateKeyPairSync("ed25519"),
    trackingKey = Buffer.alloc(32, 71);
  Object.assign(env, {
    BLU_INVOICE_IBAN: "IR230000000000000000000071",
    BLU_INVOICE_CARD_NUMBER: "6219860000000071",
    BLU_TRACKING_HMAC_KEY: trackingKey.toString("base64"),
    BLU_EVENT_PUBLIC_KEY: signing.publicKey
      .export({ format: "der", type: "spki" })
      .toString("base64"),
    BLU_AUTO_APPROVE_ENABLED: true,
    BLU_STOCK_CHECKOUT_ENABLED: false,
    BLU_INVOICE_QA_USER_ID: undefined,
    BLU_QA_INVOICE_CAMPAIGN: undefined,
  });
  for (const [key, value] of Object.entries({
    cardEnabled: "true",
    cardNumber: env.BLU_INVOICE_CARD_NUMBER!,
    cardHolder: "Synthetic buyer",
    cardBank: "Synthetic bank",
  }))
    await prisma.siteSetting.upsert({
      where: { key: "pay." + key },
      create: { key: "pay." + key, value },
      update: { value },
    });
  for (const adapter of card.registry.values()) {
    const previous = adapter.quote;
    adapter.quote = async (input) => ({
      ...((await previous(input)) as object),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    });
  }
  const cardApp = createApp({ supplierAdapters: card.registry });
  const cardHeaders = {
    ...headers,
    authorization: "Bearer " + signAccessToken({ sub: card.user.id, role: "USER", sv: 0 }),
  };
  const cardQuoteResponse = await inject(cardApp, {
    method: "POST",
    url: "/supplier-quotes",
    headers: cardHeaders,
    payload: JSON.stringify({ planId: card.product.plans[0].id }),
  });
  const cardQuote = cardQuoteResponse.json().quote;
  assert.equal(
    cardQuote.methods?.cardToCard,
    true,
    "Signed-bank checkout must be available for a sufficiently long bound quote",
  );
  const cardRequest = { quoteId: cardQuote.id, method: "card_to_card" };
  const cardOpened = await inject(cardApp, {
    method: "POST",
    url: "/supplier-checkout/orders",
    headers: cardHeaders,
    payload: JSON.stringify(cardRequest),
  });
  assert.equal(cardOpened.statusCode, 201, cardOpened.body);
  const cardOrder = cardOpened.json();
  assert(cardOrder.cardToCard.amount < cardQuote.amount);
  assert.equal(buys, 0);
  const cardStored = await prisma.order.findUniqueOrThrow({ where: { id: cardOrder.order.id } });
  const invoice = readBluInvoice(cardStored.paymentMetadata)!;
  assert.equal((invoice as unknown as { supplierCheckout: boolean }).supplierCheckout, true);
  await assert.rejects(
    uploadReceipt(card.user.id, cardStored.id, {
      buffer: Buffer.from("synthetic PNG"),
      mimetype: "image/png",
    }),
    /tracking|reference/i,
  );
  const receipt = await uploadReceipt(
    card.user.id,
    cardStored.id,
    { buffer: Buffer.from("synthetic PNG"), mimetype: "image/png" },
    "001234",
  );
  assert(
    (await pendingBluQaReceipts()).some(
      (x) => x.amountIrr === invoice.amountIrr && x.iban === invoice.iban,
    ),
  );
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const beforeProof = await inject(cardApp, {
    method: "POST",
    url: "/admin/receipts/" + receipt.receiptId + "/approve",
    headers: {
      ...headers,
      authorization:
        "Bearer " + signAccessToken({ sub: admin.id, role: "ADMIN", sv: admin.sessionVersion }),
    },
    payload: "{}",
  });
  assert.equal(beforeProof.statusCode, 409);
  assert.equal(buys, 0);
  const now = new Date().toISOString();
  const event = {
    version: 1,
    direction: "CREDIT",
    currency: "IRR",
    amountIrr: invoice.amountIrr,
    accountDigest: createHash("sha256")
      .update("oosta:blu:account:v1\0")
      .update(invoice.iban)
      .digest("hex"),
    transactionDigest: createHash("sha256").update(cardStored.id).digest("hex"),
    trackingDigest: createHmac("sha256", trackingKey)
      .update("oosta:blu:tracking:v1\0")
      .update("001234")
      .digest("hex"),
    occurredAt: now,
    observedAt: now,
  };
  const sendBank = (override = {}, signature?: string) => {
    const payload = JSON.stringify({ ...event, ...override });
    return inject(cardApp, {
      method: "POST",
      url: "/internal/blu-events",
      headers: {
        "content-type": "application/json",
        "x-oosta-blu-signature":
          signature ?? sign(null, Buffer.from(payload), signing.privateKey).toString("base64url"),
      },
      payload,
    });
  };
  assert.equal((await sendBank({}, "x".repeat(86))).statusCode, 401);
  assert.equal(buys, 0);
  assert.equal(
    (await sendBank({ amountIrr: String(Number(invoice.amountIrr) + 10) })).statusCode,
    200,
  );
  assert.equal(
    (await prisma.receipt.findUniqueOrThrow({ where: { id: receipt.receiptId } })).status,
    "PENDING",
  );
  assert.equal((await sendBank()).statusCode, 200);
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: cardStored.id } })).paymentStatus,
    "PAID_PENDING_FULFILLMENT",
  );
  assert.equal(buys, 0);
  await cardApp.locals.supplierCheckout.sweep();
  await cardApp.locals.supplierCheckout.sweep();
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: cardStored.id } })).paymentStatus,
    "PAID",
  );
  assert.equal(buys, 1);
  await sendBank();
  await cardApp.locals.supplierCheckout.sweep();
  assert.equal(buys, 1);
  assert.equal(
    (await prisma.receipt.findUniqueOrThrow({ where: { id: receipt.receiptId } })).status,
    "APPROVED",
  );
  const createCard = async () => {
    const q = (
      await inject(cardApp, {
        method: "POST",
        url: "/supplier-checkout/quotes",
        headers: cardHeaders,
        payload: JSON.stringify({ planId: card.product.plans[0].id }),
      })
    ).json().quote;
    const opened = await inject(cardApp, {
      method: "POST",
      url: "/supplier-checkout/orders",
      headers: cardHeaders,
      payload: JSON.stringify({ quoteId: q.id, method: "card_to_card" }),
    });
    return { q, opened };
  };
  const abandoned = await createCard();
  assert.equal(abandoned.opened.statusCode, 201);
  const abandonedId = abandoned.opened.json().order.id;
  const abandonedStored = await prisma.order.findUniqueOrThrow({ where: { id: abandonedId } });
  await prisma.supplierCheckoutQuote.update({
    where: { id: abandoned.q.id },
    data: { expiresAt: new Date(0) },
  });
  const requoted = await createCard();
  assert.equal(
    requoted.opened.statusCode,
    201,
    "An expired unpaid invoice must not block future purchases forever",
  );
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: abandonedId } })).bluInvoiceKey,
    abandonedStored.bluInvoiceKey,
  );
  await prisma.order.update({
    where: { id: requoted.opened.json().order.id },
    data: { paymentStatus: "EXPIRED" },
  });
  for (const fault of [
    "amount",
    "destination",
    "quote",
    "role",
    "reference",
    "review",
    "bank-time",
    "currency",
    "job",
  ]) {
    const next = await createCard();
    assert.equal(next.opened.statusCode, 201, next.opened.body);
    const id = next.opened.json().order.id;
    const stored = await prisma.order.findUniqueOrThrow({ where: { id } });
    const immutable = readBluInvoice(stored.paymentMetadata)!;
    const pending = await uploadReceipt(
      card.user.id,
      id,
      { buffer: Buffer.from("synthetic"), mimetype: "image/png" },
      "001234",
    );
    const bank = await prisma.bluBankObservation.create({
      data: {
        transactionDigest: createHash("sha256").update(id).digest("hex"),
        invoiceKey: stored.bluInvoiceKey!,
        trackingDigest: event.trackingDigest,
        occurredAt: new Date(),
        matchedOrderId: id,
      },
    });
    if (fault === "amount")
      await prisma.order.update({
        where: { id },
        data: { totalAmount: stored.totalAmount.add(10) },
      });
    if (fault === "destination")
      await prisma.order.update({
        where: { id },
        data: {
          paymentMetadata: {
            ...(stored.paymentMetadata as Prisma.JsonObject),
            number: "6219860000000099",
          },
        },
      });
    if (fault === "quote")
      await prisma.supplierCheckoutQuote.update({
        where: { id: next.q.id },
        data: { amount: new Prisma.Decimal(next.q.amount).add(10) },
      });
    if (fault === "role")
      await prisma.user.update({ where: { id: card.user.id }, data: { role: "ADMIN" } });
    if (fault === "reference")
      await prisma.receipt.update({
        where: { id: pending.receiptId },
        data: { reference: "991122" },
      });
    if (fault === "review")
      await prisma.bluBankObservation.update({
        where: { transactionDigest: bank.transactionDigest },
        data: { reviewRequired: true },
      });
    if (fault === "bank-time")
      await prisma.bluBankObservation.update({
        where: { transactionDigest: bank.transactionDigest },
        data: { occurredAt: new Date(Date.parse(immutable.expiresAt) + 1) },
      });
    if (fault === "currency")
      await prisma.order.update({ where: { id }, data: { currency: "USDT" } });
    if (fault === "job")
      await prisma.supplierFulfillment.update({
        where: { orderId: id },
        data: { state: "SENDING" },
      });
    const denied = await inject(cardApp, {
      method: "POST",
      url: "/admin/receipts/" + pending.receiptId + "/approve",
      headers: {
        ...headers,
        authorization:
          "Bearer " + signAccessToken({ sub: admin.id, role: "ADMIN", sv: admin.sessionVersion }),
      },
      payload: "{}",
    });
    assert.equal(denied.statusCode, 409, fault + " " + denied.body);
    assert.equal(
      (await prisma.receipt.findUniqueOrThrow({ where: { id: pending.receiptId } })).status,
      "PENDING",
    );
    assert.equal(buys, 1);
    await prisma.user.update({ where: { id: card.user.id }, data: { role: "USER" } });
    await prisma.order.update({ where: { id }, data: { paymentStatus: "EXPIRED" } });
    await prisma.supplierFulfillment.update({ where: { orderId: id }, data: { state: "REVIEW" } });
  }
  const reviewed = await createCard();assert.equal(reviewed.opened.statusCode,201);
  const reviewedOrder=await prisma.order.findUniqueOrThrow({where:{id:reviewed.opened.json().order.id}});
  const reviewedReceipt=await uploadReceipt(card.user.id,reviewedOrder.id,{buffer:Buffer.from("synthetic"),mimetype:"image/png"},"001234");
  const reviewClaim=await prisma.bluBankObservation.create({data:{transactionDigest:createHash("sha256").update(reviewedOrder.id).digest("hex"),invoiceKey:reviewedOrder.bluInvoiceKey!,trackingDigest:event.trackingDigest,occurredAt:new Date(),matchedOrderId:reviewedOrder.id}});
  const approved = await inject(cardApp,{method:"POST",url:"/admin/receipts/"+reviewedReceipt.receiptId+"/approve",headers:{...headers,authorization:"Bearer "+signAccessToken({sub:admin.id,role:"ADMIN",sv:admin.sessionVersion})},payload:"{}"});
  assert.equal(approved.statusCode,200);
  await prisma.bluBankObservation.update({where:{transactionDigest:reviewClaim.transactionDigest},data:{reviewRequired:true}});
  const beforeReview=buys;await cardApp.locals.supplierCheckout.sweep();
  assert.equal(buys,beforeReview,"Bank evidence becoming ambiguous before dispatch must stop procurement");
  assert.equal((await prisma.supplierFulfillment.findUniqueOrThrow({where:{orderId:reviewedOrder.id}})).state,"REVIEW");
  console.log("PASS: customer HTTP quote binding/expiry, one payment session, verified-only purchase, callback/replay denial, vault delivery, restart lookup recovery, fair worker scheduling and signed Blu card settlement; empty production registry closed");
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
