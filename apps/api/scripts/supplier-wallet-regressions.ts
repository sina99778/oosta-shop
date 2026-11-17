import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { inject } from "light-my-request";
import { prisma } from "../src/lib/prisma";
import { normalizeCatalog } from "../src/modules/suppliers/catalog";
import { variantSchema, variantKey } from "../src/modules/suppliers/variant";
import { walletAdapter, liveSupplierRegistry } from "../src/modules/suppliers/live-adapters";
import {
  processSupplierFulfillment,
  reconcileSupplierFulfillment,
} from "../src/modules/suppliers/fulfillment";
import { reserveWallet } from "../src/modules/suppliers/wallet-budget";
import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";
import { createSupplierCheckout } from "../src/modules/suppliers/checkout";
import type { SupplierAdapter } from "../src/modules/suppliers/fulfillment";

assert.equal(process.env.ISOLATED_REGRESSION_DB, "1");
const acceptedRisk = {
  capabilities: { priceCeiling: false, walletExposure: true, idempotency: true, lookup: true },
  quote: async () => null,
  purchase: async () => null,
  lookup: async () => null,
} satisfies SupplierAdapter;
assert.equal(
  createSupplierCheckout(new Map([["ventebot", acceptedRisk]])).available,
  true,
  "Explicit existing-wallet adapters must not falsely claim an upstream price ceiling",
);
console.log("PASS: explicit wallet exposure capability");

const variant = variantSchema.parse({
  plan: "Synthetic",
  access: "PERSONAL",
  fulfillment: "ACCOUNT",
  delivery: "AUTOMATIC",
  warranty: { kind: "NONE" },
  region: "GLOBAL",
  quota: "MONTHLY",
});
let vendorOrderId = 700;
let posts = 0,
  wallet = "2",
  price = "0.5",
  mode = "complete",
  reference = "";
const originalFetch = globalThis.fetch;
const rawCatalog = (supplier: string) => ({
  success: true,
  products:
    supplier === "ventebot"
      ? [
          {
            id: 101,
            name: "Synthetic account",
            description: "Synthetic fixture",
            price_usd: price,
            stock: 5,
            delivery_type: "stock",
            warranty_days: 0,
            api_test: false,
          },
        ]
      : [
          {
            productId: "sku-1",
            name: "Synthetic account",
            description: "Synthetic fixture",
            price: { amount: price, currency: "USD" },
            availability: { available: 5 },
            productType: "account",
          },
        ],
});
const rawVente = () => ({
  id: vendorOrderId,
  product_id: mode === "wrong-id" ? 102 : 101,
  quantity: 1,
  delivery_type: "stock",
  idempotency_key: reference,
  customer_reference: reference,
  amount_usd: mode === "drift" ? "1.2" : "0.5",
  status: "COMPLETED",
  items: [{ account_data: "fixture@example.invalid|synthetic-password|recovery@example.invalid" }],
});
globalThis.fetch = (async (url: string | URL | Request, options?: RequestInit) => {
  const u = new URL(String(url));
  const supplier =
    u.hostname === "canboso.com"
      ? "canboso"
      : u.hostname === "web-production-1c7b1.up.railway.app"
        ? "ventebot"
        : "FORBIDDEN";
  assert.notEqual(supplier, "FORBIDDEN", "No real external calls in wallet regressions");
  if (u.pathname.endsWith("/products")) return Response.json(rawCatalog(supplier));
  if (u.pathname.endsWith("/balance"))
    return Response.json({ success: true, walletCurrency: "USD", balance: wallet });
  if (u.pathname.endsWith("/me")) return Response.json({ success: true, wallet_balance: wallet });
  if (u.pathname.endsWith("/quote"))
    return Response.json({
      success: true,
      quote: {
        product_id: 101,
        quantity: 1,
        total: mode === "quote-drift" ? "0.7" : price,
        delivery_type: "stock",
        stock: 5,
      },
      wallet_balance: wallet,
    });
  if (u.pathname.endsWith("/orders/lookup")) {
    assert.equal(options?.method, "GET");
    return Response.json({
      success: true,
      results:
        mode === "not-found"
          ? []
          : [
              {
                idempotency_key: reference,
                customer_reference: reference,
                request_status: mode === "no-charge" ? "failed_no_charge" : "completed",
                order: mode === "no-charge" ? null : rawVente(),
              },
            ],
    });
  }
  assert.equal(options?.method, "POST");
  const body = JSON.parse(String(options?.body)) as Record<string, unknown>;
  posts++;
  reference =
    supplier === "ventebot"
      ? String(body.idempotency_key)
      : String((options?.headers as Record<string, string>)["Idempotency-Key"]);
  assert.equal(body.quantity, 1);
  assert(reference.startsWith("wallet-fixture-") || reference.startsWith("oosta-checkout-"));
  if (mode === "timeout" || mode === "not-found" || mode === "no-charge")
    throw new Error("Synthetic lost response");
  if (mode === "malformed") return Response.json({ success: true, delivery: "invalid" });
  if (supplier === "ventebot") return Response.json({ success: true, order: rawVente() });
  return Response.json({
    success: true,
    order: {
      orderCode: "fixture-" + reference,
      productId: mode === "wrong-id" ? "sku-other" : "sku-1",
      productType: "account",
      status: "completed",
      quantity: 1,
      bonusQuantity: 0,
      finalQuantity: 1,
    },
    payment: {
      currency: mode === "wrong-currency" ? "USDT" : "USD",
      amount: mode === "drift" ? "1.2" : "0.5",
    },
    delivery: {
      accounts: [
        {
          user: "fixture@example.invalid",
          password: "synthetic-password",
          verifyEmail: "recovery@example.invalid",
          otherInfo: "Synthetic instructions",
        },
      ],
    },
  });
}) as typeof fetch;
process.env.CANBOSO_API_KEY = "synthetic-canboso-wallet-key";
process.env.VENTEBOT_API_KEY = "synthetic-vente-wallet-key";

async function fixture(supplier: "canboso" | "ventebot" = "canboso", state = "READY") {
  vendorOrderId++;
  mode = "complete";
  posts = 0;
  price = "0.5";
  wallet = "2";
  await prisma.supplierWalletBudget.upsert({
    where: { supplier },
    create: { supplier, currency: "USD", authorizedAmount: 2, remainingAmount: 2, enabled: true },
    update: {
      currency: "USD",
      enabled: true,
      authorizedAmount: 2,
      remainingAmount: 2,
      activeReference: null,
    },
  });
  const catalog = normalizeCatalog(supplier, rawCatalog(supplier));
  assert.equal(catalog.offers.length, 1);
  await prisma.siteSetting.upsert({
    where: { key: "suppliers.catalog." + supplier },
    create: { key: "suppliers.catalog." + supplier, value: JSON.stringify(catalog) },
    update: { value: JSON.stringify(catalog) },
  });
  await prisma.siteSetting.upsert({
    where: { key: "suppliers.pricing" },
    create: { key: "suppliers.pricing", value: "" },
    update: {},
  });
  await prisma.siteSetting.update({
    where: { key: "suppliers.pricing" },
    data: {
      value: JSON.stringify({
        enabled: true,
        rateSource: "MANUAL",
        rates: { USD: "100000" },
        markupPercent: "30",
        minimumProfitIrr: "0",
        fixedCostIrr: "0",
        ttlSeconds: 900,
        updatedAt: new Date().toISOString(),
      }),
    },
  });
  await prisma.siteSetting.upsert({
    where: { key: "pay.provider" },
    create: { key: "pay.provider", value: "mock" },
    update: { value: "mock" },
  });
  const user = await prisma.user.create({
    data: {
      name: "Synthetic wallet",
      email: randomUUID() + "@example.invalid",
      passwordHash: "synthetic-unused",
    },
  });
  const product = await prisma.product.create({
    data: {
      name: "Synthetic wallet product",
      slug: randomUUID(),
      type: "ACCOUNT",
      description: "Synthetic only",
      category: { create: { name: "Synthetic wallet category", slug: randomUUID() } },
      plans: {
        create: {
          label: "Synthetic month",
          price: 65000,
          source: "SUPPLIER",
          durationDays: 30,
          variant,
          supplierMappings: [
            {
              supplier,
              externalId: catalog.offers[0].externalId,
              fingerprint: catalog.offers[0].fingerprint,
              variantKey: variantKey(variant, 30),
              automaticVerified: true,
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
      totalAmount: 65000,
      currency: "IRR",
      paymentStatus: "PAID_PENDING_FULFILLMENT",
      paidAt: new Date(),
      paymentProvider: "ZARINPAL",
      paymentRefId: "synthetic-" + randomUUID(),
      items: {
        create: {
          productId: product.id,
          planId: product.plans[0].id,
          quantity: 1,
          unitPrice: 65000,
          lineTotal: 65000,
          planSnapshot: { source: "SUPPLIER", variant, durationDays: 30 },
        },
      },
    },
  });
  const job = await prisma.supplierFulfillment.create({
    data: {
      orderId: order.id,
      supplier,
      reference: "wallet-fixture-" + randomUUID(),
      externalId: catalog.offers[0].externalId,
      fingerprint: catalog.offers[0].fingerprint,
      variantKey: variantKey(variant, 30),
      quoteId: randomUUID(),
      maximumCost: "0.5",
      currency: "USD",
      expiresAt: new Date(Date.now() + 900000),
      state,
    },
  });
  return { job, order, product, user, registry: new Map([[supplier, walletAdapter(supplier)]]) };
}
async function budget(supplier = "canboso") {
  return prisma.supplierWalletBudget.findUniqueOrThrow({ where: { supplier } });
}
async function main() {
  assert.equal(liveSupplierRegistry().size, 0);
  for (const supplier of ["canboso", "ventebot"] as const) {
    const f = await fixture(supplier);
    mode = "drift";
    const outcomes = await Promise.all([
      processSupplierFulfillment(f.job.id, f.registry),
      processSupplierFulfillment(f.job.id, f.registry),
    ]);
    assert(outcomes.some((o) => o.state === "DELIVERED"));
    assert.equal(posts, 1);
    assert.equal(
      (await budget(supplier)).remainingAmount.toString(),
      "0.8",
      "Realized debit, including accepted drift, permanently reduces the budget",
    );
    assert.equal((await budget(supplier)).activeReference, null);
    const stock = await prisma.inventoryItem.findFirstOrThrow({
      where: { orderItem: { orderId: f.order.id } },
    });
    assert(stock.deliveryInstructions?.includes("recovery@example.invalid"));
    const owner = await inject(createApp({ supplierAdapters: f.registry }), {
      method: "GET",
      url: "/orders/" + f.order.id,
      headers: {
        authorization: "Bearer " + signAccessToken({ sub: f.user.id, role: "USER", sv: 0 }),
      },
    });
    assert.equal(owner.statusCode, 200);
    assert(owner.body.includes("recovery@example.invalid"));
    assert.match(String(owner.headers["cache-control"]), /no-store/);
    const outsider = await prisma.user.create({
      data: {
        name: "Synthetic outsider",
        email: randomUUID() + "@example.invalid",
        passwordHash: "unused",
      },
    });
    const denied = await inject(createApp({ supplierAdapters: f.registry }), {
      method: "GET",
      url: "/orders/" + f.order.id,
      headers: {
        authorization: "Bearer " + signAccessToken({ sub: outsider.id, role: "USER", sv: 0 }),
      },
    });
    assert.equal(denied.statusCode, 404);
    assert(!denied.body.includes("recovery@example.invalid"));
    await processSupplierFulfillment(f.job.id, f.registry);
    assert.equal((await budget(supplier)).remainingAmount.toString(), "0.8");
  }
  for (const condition of ["topup", "disabled", "price", "currency"]) {
    const f = await fixture();
    if (condition === "topup") wallet = "2.01";
    if (condition === "disabled")
      await prisma.supplierWalletBudget.update({
        where: { supplier: "canboso" },
        data: { enabled: false },
      });
    if (condition === "price") price = "0.6";
    if (condition === "currency")
      await prisma.supplierWalletBudget.update({
        where: { supplier: "canboso" },
        data: { currency: "USDT" },
      });
    if (["disabled", "currency"].includes(condition))
      await assert.rejects(processSupplierFulfillment(f.job.id, f.registry));
    else {
      assert.equal((await processSupplierFulfillment(f.job.id, f.registry)).state, "NO_CHARGE");
      assert.equal((await budget()).remainingAmount.toString(), "2");
    }
    assert.equal(posts, 0);
  }
  for (const failure of ["timeout", "malformed", "wrong-id", "wrong-currency"]) {
    const f = await fixture();
    mode = failure;
    assert.equal((await processSupplierFulfillment(f.job.id, f.registry)).state, "UNCERTAIN");
    assert.equal((await budget()).remainingAmount.toString(), "0");
    assert.equal((await budget()).activeReference, f.job.reference);
    await reconcileSupplierFulfillment(f.job.id, f.registry);
    await processSupplierFulfillment(f.job.id, f.registry);
    assert.equal(posts, 1, "No second purchase after ambiguous debit");
  }
  const recovery = await fixture("ventebot");
  mode = "timeout";
  assert.equal(
    (await processSupplierFulfillment(recovery.job.id, recovery.registry)).state,
    "UNCERTAIN",
  );
  mode = "complete";
  assert.equal(
    (await reconcileSupplierFulfillment(recovery.job.id, recovery.registry)).state,
    "DELIVERED",
  );
  assert.equal(posts, 1);
  assert.equal((await budget("ventebot")).remainingAmount.toString(), "1.5");
  const free = await fixture("ventebot");
  mode = "no-charge";
  await processSupplierFulfillment(free.job.id, free.registry);
  assert.equal((await reconcileSupplierFulfillment(free.job.id, free.registry)).state, "NO_CHARGE");
  assert.equal((await budget("ventebot")).remainingAmount.toString(), "2");

  const first = await fixture();
  const checkout = createSupplierCheckout(first.registry);
  const quote = await checkout.quote(first.user.id, first.product.plans[0].id);
  const secondQuote = await checkout.quote(first.user.id, first.product.plans[0].id);
  const a = await checkout.create(first.user.id, quote.id);
  assert.equal((await budget()).remainingAmount.toString(), "0");
  await assert.rejects(checkout.create(first.user.id, secondQuote.id));
  assert.equal(
    await prisma.order.count({ where: { supplierCheckoutQuote: { id: secondQuote.id } } }),
    0,
  );
  const pending = await prisma.supplierFulfillment.findUniqueOrThrow({
    where: { orderId: a.order.id },
  });
  await prisma.supplierFulfillment.update({
    where: { id: pending.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await checkout.sweep();
  assert.equal((await budget()).remainingAmount.toString(), "2");
  await checkout.sweep();
  assert.equal(
    (await budget()).remainingAmount.toString(),
    "2",
    "Expired unpaid reservation is returned once",
  );
  assert.equal(posts, 0);

  const busy = await fixture();
  await prisma.$transaction((tx) => reserveWallet(tx, busy.job));
  const copyOrder = await prisma.order.create({
    data: { userId: busy.user.id, totalAmount: 65000, currency: "IRR" },
  });
  const copy = await prisma.supplierFulfillment.create({
    data: {
      orderId: copyOrder.id,
      reference: "wallet-fixture-" + randomUUID(),
      supplier: "canboso",
      externalId: "sku-1",
      variantKey: busy.job.variantKey,
      fingerprint: busy.job.fingerprint,
      quoteId: randomUUID(),
      maximumCost: new Prisma.Decimal("0.5"),
      currency: "USD",
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  await assert.rejects(prisma.$transaction((tx) => reserveWallet(tx, copy)));
  const actualQuote = await fixture("ventebot");
  mode = "quote-drift";
  await assert.rejects(
    actualQuote.registry.get("ventebot")!.quote({
      externalId: "101",
      quantity: 1,
      maximumCost: "0.5",
      currency: "USD",
      productType: "ACCOUNT",
    }),
    "Vendor's actual quote must be checked, not just the catalog price",
  );
  assert.equal(posts, 0);
  const crashed = await fixture("canboso", "SENDING");
  await prisma.$transaction((tx) => reserveWallet(tx, crashed.job));
  await crashed.registry.get("canboso")!.purchase({
    reference: crashed.job.reference,
    externalId: crashed.job.externalId,
    quantity: 1,
    maximumCost: "0.5",
    quoteId: crashed.job.quoteId,
    currency: "USD",
  });
  const retained = await prisma.supplierFulfillment.findUniqueOrThrow({
    where: { id: crashed.job.id },
  });
  assert(
    retained.result,
    "Retain private supplier response before normalization/application so restart can recover delivery without another POST",
  );
  assert.equal(
    (await reconcileSupplierFulfillment(crashed.job.id, crashed.registry)).state,
    "DELIVERED",
  );
  assert.equal(posts, 1);
  const expiredPaid = await fixture();
  await prisma.$transaction((tx) => reserveWallet(tx, expiredPaid.job));
  await prisma.supplierFulfillment.update({
    where: { id: expiredPaid.job.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal(
    (await processSupplierFulfillment(expiredPaid.job.id, expiredPaid.registry)).state,
    "REVIEW",
  );
  assert.equal(
    (await budget()).remainingAmount.toString(),
    "2",
    "Expired paid order must release its never-dispatched reservation",
  );
  assert.equal(posts, 0);
  const deposited = await fixture("canboso", "AWAITING_PAYMENT");
  const start = new Date(Date.now() - 180000),
    end = new Date(Date.now() - 60000);
  const invoiceKey = "IR" + "1".repeat(24) + ":65000";
  await prisma.$transaction((tx) => reserveWallet(tx, deposited.job));
  await prisma.order.update({
    where: { id: deposited.order.id },
    data: {
      createdAt: start,
      paidAt: null,
      paymentRefId: null,
      paymentStatus: "PENDING",
      paymentProvider: "CARD_TO_CARD",
      bluInvoiceKey: invoiceKey,
    },
  });
  await prisma.supplierFulfillment.update({
    where: { id: deposited.job.id },
    data: { expiresAt: end },
  });
  await prisma.bluBankObservation.create({
    data: {
      transactionDigest: randomUUID(),
      trackingDigest: randomUUID(),
      invoiceKey,
      occurredAt: new Date(start.getTime() + 30000),
    },
  });
  await createSupplierCheckout(deposited.registry).sweep();
  assert.equal(
    (await budget()).activeReference,
    deposited.job.reference,
    "An observed deposit before receipt upload must retain the payment reservation",
  );
  assert.equal(posts, 0);
  console.log(
    "PASS: real adapter fixtures, accepted price drift, denied top-up/revocation/currency, serialized wallet reservation, uncertain debit hold, read-only recovery, one settlement, unpaid expiry, private owner delivery and no real purchases",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    globalThis.fetch = originalFetch;
    await prisma.$disconnect();
  });
