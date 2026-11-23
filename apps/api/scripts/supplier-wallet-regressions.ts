import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { inject } from "light-my-request";
import { prisma } from "../src/lib/prisma";
import { normalizeCatalog } from "../src/modules/suppliers/catalog";
import { variantSchema, variantKey } from "../src/modules/suppliers/variant";
import { walletAdapter, liveSupplierRegistry } from "../src/modules/suppliers/live-adapters";
import {
  dispatchManualSupplier,
  manualSupplierWalletSnapshot,
  processSupplierFulfillment,
  reconcileSupplierFulfillment,
} from "../src/modules/suppliers/fulfillment";
import { reserveWallet } from "../src/modules/suppliers/wallet-budget";
import { env } from "../src/config/env";
import { patchGatewayConfig } from "../src/lib/gatewayConfig";
import { uploadReceipt } from "../src/modules/orders/orders.service";
import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";
import { createSupplierCheckout } from "../src/modules/suppliers/checkout";
import type { SupplierAdapter } from "../src/modules/suppliers/fulfillment";
import { cartSignature } from "../src/modules/orders/cart-state";
import { getWelcomeGift } from "../src/modules/orders/welcome-gift";
import { reconcileOnlineCartPayments } from "../src/modules/orders/cart-payment-recovery";
import { expireOnlineSupplierOrder } from "../src/modules/suppliers/online-order-expiry";

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
const capcutId = "6ae56552ca7826922602de76";
const capcutName = "Capcut Pro 500 credit 7D warranty 6D";
let posts = 0,
  wallet = "2",
  price = "0.5",
  mode = "complete",
  reference = "";
const originalFetch = globalThis.fetch;
const merchant = "synthetic-supplier-gateway";
let gatewayMode: "initialization-error" | "unpaid" | "paid" = "unpaid";
let inquiryStatus: "IN_BANK" | "REVERSED" = "IN_BANK";
let gatewayAuthority = "";
let gatewayAmount = 0;
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
            productId: supplier === "canboso2" ? capcutId : "sku-1",
            name: supplier === "canboso2" ? capcutName : "Synthetic account",
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
  if (u.hostname === "sandbox.zarinpal.com") {
    const body = JSON.parse(String(options?.body));
    assert.equal(body.merchant_id, merchant);
    assert.equal(options?.method, "POST");
    if (u.pathname.endsWith("/request.json")) {
      if (gatewayMode === "initialization-error") return new Response(null, { status: 503 });
      gatewayAmount = body.amount;
      return Response.json({ data: { code: 100, authority: gatewayAuthority } });
    }
    assert.equal(body.authority, gatewayAuthority);
    if (u.pathname.endsWith("/inquiry.json"))
      return Response.json({ data: { code: 100, status: inquiryStatus } });
    assert.equal(u.pathname, "/pg/v4/payment/verify.json");
    assert.equal(body.amount, gatewayAmount);
    return Response.json({
      data: gatewayMode === "paid" ? { code: 100, ref_id: 412345 } : { code: -21 },
    });
  }
  const key = new Headers(options?.headers).get("x-buyer-key");
  const supplier =
    u.hostname === "canboso.com"
      ? key === "synthetic-premikey-wallet-key"
        ? "canboso2"
        : "canboso"
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
      productId: mode === "wrong-id" ? "sku-other" : supplier === "canboso2" ? capcutId : "sku-1",
      productType: "account",
      status: "completed",
      quantity: 1,
      bonusQuantity: 0,
      finalQuantity: 1,
    },
    payment: {
      currency: mode === "wrong-currency" ? "USDT" : "USD",
      amount: mode === "drift" ? "1.2" : supplier === "canboso2" ? "0.46" : "0.5",
    },
    delivery: {
      accounts: [
        {
          user:
            supplier === "canboso2"
              ? "fixture@example.invalid|synthetic-password" +
                (mode === "bad-packed" ? "|unexpected" : "")
              : "fixture@example.invalid",
          password: supplier === "canboso2" ? "" : "synthetic-password",
          verifyEmail: "recovery@example.invalid",
          otherInfo: "Synthetic instructions",
        },
      ],
    },
  });
}) as typeof fetch;
process.env.CANBOSO_API_KEY = "synthetic-canboso-wallet-key";
process.env.CANBOSO2_API_KEY = "synthetic-premikey-wallet-key";
process.env.VENTEBOT_API_KEY = "synthetic-vente-wallet-key";

async function fixture(supplier: "canboso" | "canboso2" | "ventebot" = "canboso", state = "READY") {
  vendorOrderId++;
  mode = "complete";
  posts = 0;
  price = supplier === "canboso2" ? "0.46" : "0.5";
  wallet = supplier === "canboso2" ? "0.46" : "2";
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

async function verifyCapcutCheckout() {
  assert(!env.TELEGRAM_BOT_TOKEN);
  const f = await fixture("canboso2", "NO_CHARGE");
  env.SUPPLIER_MANUAL_APPROVAL = true;
  await patchGatewayConfig({
    cardEnabled: true,
    cardNumber: "1234567890123456",
    cardHolder: "Synthetic",
  });
  await prisma.supplierWalletBudget.update({
    where: { supplier: "canboso2" },
    data: { remainingAmount: "0.46", authorizedAmount: "0.46" },
  });
  const plan = f.product.plans[0];
  const stagedVariant = variantSchema.parse({
    ...variant,
    plan: "CapCut",
    quota: "500 credits",
    delivery: "MANUAL",
  });
  const mappings = plan.supplierMappings as Prisma.JsonArray;
  const stagedMappings = [
    {
      ...(mappings[0] as Prisma.JsonObject),
      automaticVerified: false,
      variantKey: variantKey(stagedVariant, null),
    },
  ];
  await prisma.productPlan.update({
    where: { id: plan.id },
    data: { variant: stagedVariant, durationDays: null, supplierMappings: stagedMappings },
  });
  const app = createApp({ supplierAdapters: f.registry });
  const buyerToken = signAccessToken({ sub: f.user.id, role: "USER" });
  const admin = await prisma.user.create({
    data: { name: "CapCut QA admin", passwordHash: "unused", role: "ADMIN" },
  });
  const adminToken = signAccessToken({ sub: admin.id, role: "ADMIN" });
  const call = (method: "GET" | "POST", url: string, payload?: object, token = buyerToken) =>
    inject(app, { method, url, payload, headers: { authorization: "Bearer " + token } });

  const current = await call("POST", "/supplier-quotes", { planId: plan.id });
  assert.equal(current.statusCode, 200, current.body);
  assert.equal(current.json().quote.kind, "INDICATIVE");
  assert.equal(
    (await call("POST", "/supplier-checkout/quotes", { planId: plan.id })).statusCode,
    503,
  );
  assert.equal(posts, 0);

  // Model the future approved mapping only in this disposable database.
  const approvedVariant = variantSchema.parse({ ...stagedVariant, delivery: "AUTOMATIC" });
  await prisma.productPlan.update({
    where: { id: plan.id },
    data: {
      variant: approvedVariant,
      supplierMappings: [
        {
          ...stagedMappings[0],
          automaticVerified: true,
          variantKey: variantKey(approvedVariant, null),
        },
      ],
    },
  });
  const added = await call("POST", "/cart/items", { planId: plan.id });
  assert.equal(added.statusCode, 201, added.body);
  const path = "/cart/items/" + added.json().id;
  const reviewed = await call("POST", path + "/review", {});
  assert.equal(reviewed.statusCode, 200, reviewed.body);
  const { invoice } = reviewed.json();
  assert.equal(invoice.methods.cardToCard, true);
  const payment = {
    quoteId: invoice.quoteId,
    subtotal: invoice.subtotal,
    total: invoice.total,
    method: "card_to_card",
  };
  const created = await call("POST", path + "/pay", payment);
  assert.equal(created.statusCode, 201, created.body);
  const orderId = created.json().order.id;
  assert.equal((await call("POST", path + "/pay", payment)).json().order.id, orderId);
  const job = await prisma.supplierFulfillment.findUniqueOrThrow({ where: { orderId } });
  assert.equal(job.supplier, "canboso2");
  assert.equal(job.externalId, capcutId);
  assert.equal(job.maximumCost.toString(), "0.46");
  const dispatchPath = "/admin/suppliers/manual/" + job.id + "/dispatch";
  assert.equal((await call("POST", dispatchPath, {}, adminToken)).statusCode, 409);
  assert.equal(posts, 0);
  const receipt = await uploadReceipt(
    f.user.id,
    orderId,
    { buffer: Buffer.from("synthetic PNG"), mimetype: "image/png" },
    "12345678",
  );
  const approval = "/admin/receipts/" + receipt.receiptId + "/approve";
  assert.equal((await call("POST", approval, {})).statusCode, 403);
  assert.equal((await call("POST", approval, {}, adminToken)).statusCode, 200);
  assert.equal(posts, 0);
  const dispatched = await call("POST", dispatchPath, {}, adminToken);
  assert.equal(dispatched.statusCode, 200, dispatched.body);
  assert.equal(dispatched.json().state, "DELIVERED");
  assert.equal(posts, 1);
  assert.equal((await budget("canboso2")).remainingAmount.toString(), "0");
  assert.equal((await call("POST", dispatchPath, {}, adminToken)).statusCode, 409);
  assert.equal(posts, 1);
  const complete = await call("GET", "/orders/" + orderId);
  assert.equal(complete.json().order.paymentStatus, "PAID");
  assert.equal(complete.json().order.items[0].credentials.length, 1);
  const [deliveredAccount] = complete.json().order.items[0].credentials;
  assert.equal(deliveredAccount.accountEmail, "fixture@example.invalid");
  assert.equal(deliveredAccount.accountPassword, "synthetic-password");
  assert.match(String(complete.headers["cache-control"]), /private.*no-store/);
  const malformed = await fixture("canboso2");
  mode = "bad-packed";
  const rejected = await processSupplierFulfillment(malformed.job.id, malformed.registry);
  assert.equal(rejected.state, "UNCERTAIN");
  assert.equal(
    await prisma.inventoryItem.count({ where: { orderItem: { orderId: malformed.order.id } } }),
    0,
  );
  console.log(
    "PASS: exact PremiKey CapCut SKU via cart and receipt-to-dispatch with simulated upstream, one debit and owner delivery",
  );
}
async function budget(supplier = "canboso") {
  return prisma.supplierWalletBudget.findUniqueOrThrow({ where: { supplier } });
}

async function verifyManualBatmanWallet() {
  const f = await fixture("ventebot", "AWAITING_FUNDS");
  env.SUPPLIER_MANUAL_APPROVAL = true;
  try {
    const admin = await prisma.user.create({
      data: { name: "Synthetic buyer operator", passwordHash: "unused", role: "ADMIN" },
    });
    const receipt = await prisma.receipt.create({
      data: {
        orderId: f.order.id,
        imageData: Buffer.from("synthetic"),
        mimeType: "image/png",
        status: "APPROVED",
      },
    });
    await prisma.order.update({
      where: { id: f.order.id },
      data: {
        paymentProvider: "CARD_TO_CARD",
        paymentRefId: `card:${receipt.id}`,
        paymentMetadata: {
          manualSupplier: true,
          quoteId: f.job.quoteId,
          number: "1234567890123456",
          holder: "Synthetic",
          bank: "Synthetic",
          expiresAt: f.job.expiresAt.toISOString(),
        },
      },
    });
    await prisma.supplierWalletBudget.update({
      where: { supplier: "ventebot" },
      data: { remainingAmount: "0.16" },
    });
    await assert.rejects(dispatchManualSupplier(f.job.id, f.user.id, f.registry), {
      statusCode: 403,
    });
    assert.equal(posts, 0);
    const snapshot = await manualSupplierWalletSnapshot({ id: f.job.id }, admin.id, f.registry);
    assert.equal(
      snapshot.blocked,
      null,
      "BatmanBot manual dispatch must use the funded live wallet",
    );
    wallet = "0.1";
    await assert.rejects(dispatchManualSupplier(f.job.id, admin.id, f.registry), {
      code: "SUPPLIER_WALLET_UNAVAILABLE",
    });
    assert.equal(posts, 0);
    wallet = "2";
    await prisma.supplierWalletBudget.update({
      where: { supplier: "ventebot" },
      data: { activeReference: "other-purchase", remainingAmount: 0 },
    });
    await assert.rejects(dispatchManualSupplier(f.job.id, admin.id, f.registry), {
      code: "SUPPLIER_WALLET_UNAVAILABLE",
    });
    assert.equal(posts, 0);
    await prisma.supplierWalletBudget.update({
      where: { supplier: "ventebot" },
      data: { activeReference: null, remainingAmount: "0.16" },
    });
    const result = await dispatchManualSupplier(f.job.id, admin.id, f.registry);
    assert.equal(result.state, "DELIVERED");
    assert.equal(posts, 1);
    assert.equal((await budget("ventebot")).remainingAmount.toString(), "0.16");
    assert.equal((await budget("ventebot")).activeReference, null);
    await assert.rejects(dispatchManualSupplier(f.job.id, admin.id, f.registry));
    assert.equal(posts, 1);
  } finally {
    env.SUPPLIER_MANUAL_APPROVAL = false;
  }
}

async function onlineWelcomeFixture() {
  const f = await fixture();
  await prisma.supplierFulfillment.delete({ where: { id: f.job.id } });
  await prisma.order.delete({ where: { id: f.order.id } });
  await patchGatewayConfig({
    provider: "zarinpal",
    zarinpalMerchantId: merchant,
    zarinpalSandbox: true,
  });
  const checkout = createSupplierCheckout(f.registry);
  const plan = f.product.plans[0];
  const q = await checkout.quote(f.user.id, plan.id);
  const gift = await prisma.welcomeGift.create({
    data: { userId: f.user.id, code: "WELCOME-" + randomUUID() },
  });
  const line = await prisma.cartLine.create({
    data: {
      userId: f.user.id,
      planId: plan.id,
      signature: cartSignature(plan),
      amount: q.amount,
      currency: q.currency,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  const cart = {
    lineId: line.id,
    code: gift.code,
    subtotal: String(q.amount),
    total: String(q.amount - Math.floor(q.amount * 0.15)),
  };
  gatewayAuthority = "A" + randomUUID();
  return { ...f, checkout, q, cart };
}

async function resetsWelcomeAfterInitializationFailure() {
  const { user, q, cart, checkout } = await onlineWelcomeFixture();
  gatewayMode = "initialization-error";
  await assert.rejects(checkout.create("wrong-owner", q.id, "online", cart), {
    code: "SUPPLIER_QUOTE_EXPIRED",
  });
  await assert.rejects(checkout.create(user.id, q.id, "online", cart), {
    code: "PAYMENT_INITIALIZATION_FAILED",
  });
  const order = await prisma.order.findFirstOrThrow({
    where: { supplierCheckoutQuote: { id: q.id } },
    include: { supplierFulfillment: true },
  });
  assert.equal(order.welcomeGift, true);
  assert.equal(order.paymentAuthority, null);
  assert.equal(order.paymentStatus, "EXPIRED");
  assert.equal(order.supplierFulfillment?.state, "NO_CHARGE");
  assert.equal(
    (await prisma.cartLine.findUniqueOrThrow({ where: { id: cart.lineId } })).orderId,
    null,
  );
  assert.equal((await getWelcomeGift(user.id))?.state, "AVAILABLE");
  assert.equal((await budget()).remainingAmount.toString(), "2");
  assert.equal((await budget()).activeReference, null);
  assert.equal(posts, 0);
}

async function preservesLateVerifiedSupplierPayment() {
  const { user, q, cart, checkout } = await onlineWelcomeFixture();
  gatewayMode = "unpaid";
  const created = await checkout.create(user.id, q.id, "online", cart);
  const orderId = created.order.id;
  const job = await prisma.supplierFulfillment.findUniqueOrThrow({ where: { orderId } });
  await prisma.supplierFulfillment.update({
    where: { id: job.id },
    data: { expiresAt: new Date(0) },
  });
  await checkout.sweep();
  assert.equal(
    (await budget()).activeReference,
    job.reference,
    "A local supplier quote deadline cannot release a Zarinpal reservation",
  );
  assert.equal((await checkout.verify(gatewayAuthority, "NOK"))?.status, "failed");
  assert.equal(await expireOnlineSupplierOrder(orderId, "wrong-authority"), false);

  inquiryStatus = "IN_BANK";
  await reconcileOnlineCartPayments(new Date(), checkout.verify);
  assert.equal((await budget()).activeReference, job.reference);
  assert.equal((await getWelcomeGift(user.id))?.state, "RESERVED");

  inquiryStatus = "REVERSED";
  await reconcileOnlineCartPayments(new Date(), checkout.verify);
  await reconcileOnlineCartPayments(new Date(), checkout.verify);
  const expired = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { supplierFulfillment: true },
  });
  assert.equal(expired.paymentStatus, "EXPIRED");
  assert.equal(expired.supplierFulfillment?.state, "NO_CHARGE");
  assert.equal(
    (await prisma.cartLine.findUniqueOrThrow({ where: { id: cart.lineId } })).orderId,
    null,
  );
  assert.equal((await getWelcomeGift(user.id))?.state, "AVAILABLE");
  assert.equal((await budget()).remainingAmount.toString(), "2");

  assert.equal((await checkout.verify(gatewayAuthority, "OK"))?.status, "failed");
  assert.equal((await checkout.verify(gatewayAuthority, "NOK"))?.status, "failed");
  gatewayMode = "paid";
  assert.equal((await checkout.verify(gatewayAuthority, "OK"))?.status, "pending");
  assert.equal((await checkout.verify(gatewayAuthority, "OK"))?.status, "pending");
  const paid = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { supplierFulfillment: true },
  });
  assert.equal(paid.paymentStatus, "PAID_PENDING_FULFILLMENT");
  assert.equal(paid.paymentRefId, "412345");
  assert(paid.paidAt);
  assert.equal(paid.supplierFulfillment?.state, "REVIEW");
  assert.equal((await budget()).remainingAmount.toString(), "2");
  assert.equal(posts, 0);
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
  await assert.rejects(
    actualQuote.registry.get("ventebot")!.quote({
      externalId: "101",
      quantity: 1,
      maximumCost: "0.5",
      currency: "USD",
      productType: "ACCOUNT",
      fingerprint: "changed-product-fingerprint",
    }),
    "A freshly changed product definition must not receive a firm checkout quote",
  );
  mode = "quote-drift";
  await assert.rejects(
    actualQuote.registry.get("ventebot")!.quote({
      externalId: "101",
      quantity: 1,
      maximumCost: "0.5",
      currency: "USD",
      productType: "ACCOUNT",
      fingerprint: actualQuote.job.fingerprint,
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
  const initialization = await resetsWelcomeAfterInitializationFailure().catch((error) => error);
  const latePayment = await preservesLateVerifiedSupplierPayment().catch((error) => error);
  const failures = [initialization, latePayment].filter((error) => error instanceof Error);
  if (failures.length)
    throw new AggregateError(failures, "Supplier online payment regressions failed");
  console.log(
    "PASS: failed initialization releases a welcome gift, and late supplier payments require review",
  );
  await verifyManualBatmanWallet();
  await verifyCapcutCheckout();
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
