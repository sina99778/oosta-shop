import assert from "node:assert/strict";
import { createHash, createHmac, generateKeyPairSync, sign } from "node:crypto";
import { inject } from "light-my-request";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";
import { signAccessToken } from "../src/lib/jwt";
import { releaseExpiredBluStock } from "../src/modules/orders/blu-stock";
import { pendingBluQaReceipts } from "../src/modules/orders/blu-qa-poll";
import { getPaymentProviderForOrder } from "../src/modules/payments/provider";

async function main() {
  assert.equal(process.env.ISOLATED_REGRESSION_DB, "1");
  const buyer = await prisma.user.create({ data: { name: "Blu QA", passwordHash: "unused" } });
  const other = await prisma.user.create({ data: { name: "Blu other", passwordHash: "unused" } });
  const category = await prisma.category.create({ data: { name: "Blu test", slug: "blu-test" } });
  const product = await prisma.product.create({
    data: {
      name: "Blu test",
      slug: "blu-test",
      description: "Fixture",
      categoryId: category.id,
      type: "LICENSE",
    },
  });
  const plan = await prisma.productPlan.create({
    data: { productId: product.id, label: "Fixture", price: 3500000, currency: "IRR" },
  });
  await prisma.inventoryItem.create({
    data: { productId: product.id, planId: plan.id, type: "LICENSE", licenseKey: "SYNTHETIC" },
  });
  for (const [key, value] of [
    ["pay.cardEnabled", "true"],
    ["pay.cardNumber", "6219860000000001"],
    ["pay.cardHolder", "Fixture account"],
  ]) {
    await prisma.siteSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  env.BLU_INVOICE_QA_USER_ID = buyer.id;
  env.BLU_INVOICE_CARD_NUMBER = "6219860000000001";
  env.BLU_INVOICE_IBAN = "IR230000000000000000000001";
  const app = createApp();
  const call = (userId: string, method: "GET" | "POST", url: string, payload?: object) =>
    inject(app, {
      method,
      url,
      payload,
      headers: { authorization: "Bearer " + signAccessToken({ sub: userId, role: "USER" }) },
    });
  const payload = { method: "card_to_card", items: [{ planId: plan.id, quantity: 1 }] };
  const denied = await inject(app, { method: "POST", url: "/orders", payload });
  assert.equal(denied.statusCode, 401);
  const results = await Promise.all(
    Array.from({ length: 4 }, () => call(buyer.id, "POST", "/orders", payload)),
  );
  for (const r of results) assert.equal(r.statusCode, 201, r.body);
  const orders = results.map((r) => r.json().order);
  assert.equal(new Set(orders.map((o) => o.totalAmount)).size, 4);
  assert(
    orders.every((o) => {
      const adjustment = 3500000 - o.totalAmount;
      return adjustment >= 10 && adjustment <= 2490 && adjustment % 10 === 0;
    }),
  );
  const id = orders[0].id;
  const ordinary = await call(other.id, "POST", "/orders", payload);
  assert.equal(ordinary.statusCode, 201, ordinary.body);
  assert.equal(ordinary.json().order.totalAmount, 3500000);
  await prisma.siteSetting.update({
    where: { key: "pay.cardNumber" },
    data: { value: "6219860000000002" },
  });
  const owner = await call(buyer.id, "GET", "/orders/" + id);
  const stored = owner.json().order;
  assert.equal(stored.cardToCard.number, "6219860000000001");
  assert.equal(stored.bluInvoice.baseAmount, 3500000);
  assert.equal(stored.totalAmount + stored.bluInvoice.discount, 3500000);
  assert.equal(stored.bluInvoice.expired, false);
  assert(stored.bluInvoice.remainingMs > 0 && stored.bluInvoice.remainingMs <= 30 * 60 * 1000);
  assert.equal((await inject(app, { method: "GET", url: "/orders/" + id })).statusCode, 401);
  assert.match(String(owner.headers["cache-control"]), /no-store/);
  assert(!owner.body.includes(env.BLU_INVOICE_IBAN));
  assert.equal((await call(other.id, "GET", "/orders/" + id)).statusCode, 404);
  assert.equal((await call(buyer.id, "POST", "/orders", payload)).statusCode, 503);
  const row = await prisma.order.findUniqueOrThrow({ where: { id } });
  await prisma.order.update({
    where: { id },
    data: {
      paymentMetadata: {
        ...(row.paymentMetadata as object),
        expiresAt: "2000-01-01T00:00:00.000Z",
      },
    },
  });
  const expired = (await call(buyer.id, "GET", "/orders/" + id)).json().order;
  assert.equal(expired.cardToCard, null);
  assert.equal(expired.bluInvoice.expired, true);
  assert.equal(expired.paymentStatus, "PENDING");
  assert.equal(expired.bluInvoice.remainingMs, 0);
  const late = await inject(app, {
    method: "POST",
    url: "/orders/" + id + "/receipt",
    headers: {
      authorization: "Bearer " + signAccessToken({ sub: buyer.id, role: "USER" }),
      "content-type": "multipart/form-data; boundary=synthetic-receipt-boundary",
    },
    payload: Buffer.from(
      '--synthetic-receipt-boundary\r\nContent-Disposition: form-data; name="reference"\r\n\r\n001234\r\n--synthetic-receipt-boundary\r\nContent-Disposition: form-data; name="receipt"; filename="fixture.png"\r\nContent-Type: image/png\r\n\r\n\x89PNG\r\n\x1a\n\r\n--synthetic-receipt-boundary--\r\n',
      "latin1",
    ),
  });
  assert.equal(late.statusCode, 201, late.body);
  assert.equal(late.json().paymentStatus, "PENDING_REVIEW");
  await prisma.siteSetting.update({
    where: { key: "pay.cardNumber" },
    data: { value: "6219860000000001" },
  });
  await prisma.productPlan.update({
    where: { id: plan.id },
    data: { price: 350000, currency: "IRT" },
  });
  const next = await call(buyer.id, "POST", "/orders", payload);
  assert.equal(next.statusCode, 201, next.body);
  assert.equal(next.json().order.currency, "IRT");
  assert(!orders.some((order) => order.totalAmount === next.json().order.totalAmount * 10));
  const invalid = await prisma.order.update({ where: { id }, data: { paymentMetadata: {} } });
  const invalidView = await call(buyer.id, "GET", "/orders/" + invalid.id);
  assert.equal(invalidView.json().order.cardToCard, null);
  await prisma.order.createMany({
    data: Array.from({ length: 249 }, (_, index) => {
      const amount = 3500000 - (index + 1) * 10;
      return {
        userId: buyer.id,
        totalAmount: amount,
        currency: "IRR",
        paymentProvider: "CARD_TO_CARD",
        bluInvoiceKey: env.BLU_INVOICE_IBAN + ":" + amount,
      };
    }),
    skipDuplicates: true,
  });
  const before = await prisma.order.count();
  const exhausted = await call(buyer.id, "POST", "/orders", payload);
  assert.equal(exhausted.statusCode, 409, exhausted.body);
  assert.equal(exhausted.json().error.code, "BLU_AMOUNTS_UNAVAILABLE");
  assert.equal(await prisma.order.count(), before);
  env.BLU_STOCK_CHECKOUT_ENABLED = true;
  const oldProduction = env.isProduction;
  const oldMockGuard = env.ALLOW_MOCK_PAYMENTS_IN_PRODUCTION;
  env.isProduction = true;
  env.ALLOW_MOCK_PAYMENTS_IN_PRODUCTION = true;
  assert.throws(() => getPaymentProviderForOrder("MANUAL"), { code: "MOCK_DISABLED" });
  env.isProduction = oldProduction;
  env.ALLOW_MOCK_PAYMENTS_IN_PRODUCTION = oldMockGuard;
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const key = Buffer.alloc(32, 91);
  env.BLU_EVENT_PUBLIC_KEY = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  env.BLU_TRACKING_HMAC_KEY = key.toString("base64");
  const sellable = await prisma.productPlan.create({
    data: { productId: product.id, label: "Reserved fixture", price: 780000, currency: "IRR" },
  });
  const unit = await prisma.inventoryItem.create({
    data: {
      productId: product.id,
      planId: sellable.id,
      type: "LICENSE",
      licenseKey: "RESERVED-FIXTURE",
    },
  });
  const purchase = { method: "card_to_card", items: [{ planId: sellable.id, quantity: 1 }] };
  assert.equal(
    (
      await call(other.id, "POST", "/orders", {
        ...purchase,
        items: [{ planId: sellable.id, quantity: 2 }],
      })
    ).json().error.code,
    "BLU_SINGLE_ITEM_REQUIRED",
  );
  const contenders = await Promise.all([
    call(other.id, "POST", "/orders", purchase),
    call(buyer.id, "POST", "/orders", purchase),
  ]);
  assert.deepEqual(contenders.map((r) => r.statusCode).sort(), [201, 409]);
  const winner = contenders[0].statusCode === 201 ? other : buyer;
  const loser = winner.id === other.id ? buyer : other;
  const held = contenders.find((r) => r.statusCode === 201)!.json().order;
  assert.equal(held.totalAmount, 779990);
  assert.equal(
    (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: unit.id } })).status,
    "RESERVED",
  );
  assert.equal(
    (await call(winner.id, "GET", "/orders/" + held.id)).json().order.items[0].credentials.length,
    0,
  );
  assert.equal((await call(loser.id, "GET", "/orders/" + held.id)).statusCode, 404);
  const heldOrder = await prisma.order.findUniqueOrThrow({ where: { id: held.id } });
  await prisma.order.update({
    where: { id: held.id },
    data: {
      paymentMetadata: {
        ...(heldOrder.paymentMetadata as object),
        expiresAt: "2000-01-01T00:00:00.000Z",
      },
    },
  });
  assert.equal(await releaseExpiredBluStock(), 1);
  assert.equal(await releaseExpiredBluStock(), 0);
  const released = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: unit.id } });
  assert.equal(released.status, "AVAILABLE");
  assert.equal(released.orderItemId, null);
  const retry = await call(loser.id, "POST", "/orders", purchase);
  assert.equal(retry.statusCode, 201, retry.body);
  const replacement = retry.json().order.id;
  const orderToPay = await prisma.order.findUniqueOrThrow({ where: { id: replacement } });
  const proof = await inject(app, {
    method: "POST",
    url: "/orders/" + replacement + "/receipt",
    headers: {
      authorization: "Bearer " + signAccessToken({ sub: loser.id, role: "USER" }),
      "content-type": "multipart/form-data; boundary=synthetic-receipt-boundary",
    },
    payload: Buffer.from(
      '--synthetic-receipt-boundary\r\nContent-Disposition: form-data; name="reference"\r\n\r\n001234\r\n--synthetic-receipt-boundary\r\nContent-Disposition: form-data; name="receipt"; filename="fixture.png"\r\nContent-Type: image/png\r\n\r\n\x89PNG\r\n\x1a\n\r\n--synthetic-receipt-boundary--\r\n',
      "latin1",
    ),
  });
  assert.equal(proof.statusCode, 201, proof.body);
  await prisma.receipt.update({
    where: { id: proof.json().receiptId },
    data: { reference: "001234" },
  });
  assert(
    (await pendingBluQaReceipts()).some(
      (job) => job.amountIrr === orderToPay.totalAmount.toString() && job.reference === "001234",
    ),
  );
  const admin = await prisma.user.create({
    data: { name: "Blu stock admin", passwordHash: "unused", role: "ADMIN" },
  });
  const approval = "/admin/receipts/" + proof.json().receiptId + "/approve";
  assert.equal((await call(loser.id, "POST", approval, {})).statusCode, 403);
  const approve = () =>
    inject(app, {
      method: "POST",
      url: approval,
      payload: {},
      headers: { authorization: "Bearer " + signAccessToken({ sub: admin.id, role: "ADMIN" }) },
    });
  assert.equal((await approve()).statusCode, 409);
  const time = new Date().toISOString();
  const body = JSON.stringify({
    version: 1,
    currency: "IRR",
    direction: "CREDIT",
    amountIrr: orderToPay.totalAmount.toString(),
    accountDigest: createHash("sha256")
      .update("oosta:blu:account:v1\0")
      .update(env.BLU_INVOICE_IBAN!)
      .digest("hex"),
    transactionDigest: createHash("sha256").update(replacement).digest("hex"),
    trackingDigest: createHmac("sha256", key)
      .update("oosta:blu:tracking:v1\0")
      .update("001234")
      .digest("hex"),
    occurredAt: time,
    observedAt: time,
  });
  const event = await inject(app, {
    method: "POST",
    url: "/internal/blu-events",
    payload: body,
    headers: {
      "content-type": "application/json",
      "x-oosta-blu-signature": sign(null, Buffer.from(body), privateKey).toString("base64url"),
    },
  });
  assert.deepEqual(event.json(), { status: "matched" });
  assert(
    !(await pendingBluQaReceipts()).some(
      (job) => job.amountIrr === orderToPay.totalAmount.toString(),
    ),
  );
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: replacement } })).paidAt, null);
  assert.equal(await releaseExpiredBluStock(new Date(Date.now() + 26 * 60 * 60 * 1000)), 0);
  assert.deepEqual(
    (await Promise.all([approve(), approve()])).map((r) => r.statusCode).sort(),
    [200, 409],
  );
  const delivered = await call(loser.id, "GET", "/orders/" + replacement);
  assert.equal(delivered.json().order.paymentStatus, "PAID");
  assert.equal(delivered.json().order.items[0].credentials.length, 1);
  assert.equal(
    (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: unit.id } })).status,
    "SOLD",
  );
  await prisma.bluBankObservation.delete({
    where: { transactionDigest: createHash("sha256").update(replacement).digest("hex") },
  });
  console.log(
    "PASS: QA Blu invoice allocation, ownership, immutable card and expired transfer window",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
