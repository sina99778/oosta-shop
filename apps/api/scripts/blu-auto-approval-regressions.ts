import assert from "node:assert/strict";
import { createHash, createHmac, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { inject } from "light-my-request";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";
import { pendingBluQaReceipts } from "../src/modules/orders/blu-qa-poll";

async function main() {
  assert.equal(process.env.ISOLATED_REGRESSION_DB, "1");
  const app = createApp(),
    keys = generateKeyPairSync("ed25519"),
    key = Buffer.alloc(32, 63);
  const buyer = await prisma.user.create({
    data: { name: "Automatic Blu buyer", passwordHash: "unused" },
  });
  const category = await prisma.category.create({
    data: { name: "Auto fixture", slug: randomUUID() },
  });
  const product = await prisma.product.create({
    data: {
      name: "Auto fixture",
      slug: randomUUID(),
      description: "Synthetic",
      categoryId: category.id,
      type: "LICENSE",
    },
  });
  const plan = await prisma.productPlan.create({
    data: {
      productId: product.id,
      label: "Synthetic",
      source: "INTERNAL",
      price: 500000,
      currency: "IRR",
    },
  });
  env.BLU_INVOICE_IBAN = "IR230000000000000000000077";
  env.BLU_INVOICE_CARD_NUMBER = "6219860000000077";
  env.BLU_EVENT_PUBLIC_KEY = keys.publicKey
    .export({ format: "der", type: "spki" })
    .toString("base64");
  env.BLU_TRACKING_HMAC_KEY = key.toString("base64");
  env.BLU_STOCK_CHECKOUT_ENABLED = true;
  Object.assign(env, { BLU_AUTO_APPROVE_ENABLED: true });
  let serial = 0;
  async function fixture() {
    const amount = 500000 - ++serial * 10,
      now = Date.now();
    const metadata = {
      purpose: "BLU_INVOICE",
      iban: env.BLU_INVOICE_IBAN!,
      number: env.BLU_INVOICE_CARD_NUMBER!,
      holder: "Synthetic",
      bank: "Blu",
      baseAmount: 500000,
      discount: serial * 10,
      amountIrr: String(amount),
      expiresAt: new Date(now + 600000).toISOString(),
      stockHeld: true,
    };
    const order = await prisma.order.create({
      data: {
        userId: buyer.id,
        paymentProvider: "CARD_TO_CARD",
        paymentStatus: "PENDING_REVIEW",
        totalAmount: amount,
        currency: "IRR",
        createdAt: new Date(now - 5000),
        bluInvoiceKey: metadata.iban + ":" + amount,
        paymentMetadata: metadata,
        items: {
          create: {
            productId: product.id,
            planId: plan.id,
            quantity: 1,
            unitPrice: 500000,
            lineTotal: 500000,
          },
        },
      },
      include: { items: true },
    });
    const unit = await prisma.inventoryItem.create({
      data: {
        productId: product.id,
        planId: plan.id,
        type: "LICENSE",
        status: "RESERVED",
        orderItemId: order.items[0].id,
        licenseKey: "SYNTHETIC-AUTO-" + serial,
      },
    });
    const receipt = await prisma.receipt.create({
      data: {
        orderId: order.id,
        imageData: Buffer.from("synthetic"),
        mimeType: "image/png",
        reference: "001234",
      },
    });
    const event = {
      version: 1,
      direction: "CREDIT",
      currency: "IRR",
      amountIrr: String(amount),
      accountDigest: createHash("sha256")
        .update("oosta:blu:account:v1\0")
        .update(metadata.iban)
        .digest("hex"),
      transactionDigest: createHash("sha256").update(order.id).digest("hex"),
      trackingDigest: createHmac("sha256", key)
        .update("oosta:blu:tracking:v1\0")
        .update("001234")
        .digest("hex"),
      occurredAt: new Date(now - 1000).toISOString(),
      observedAt: new Date(now).toISOString(),
    };
    const send = (override = {}, signature?: string) => {
      const payload = JSON.stringify({ ...event, ...override });
      return inject(app, {
        method: "POST",
        url: "/internal/blu-events",
        payload,
        headers: {
          "content-type": "application/json",
          "x-oosta-blu-signature":
            signature ?? sign(null, Buffer.from(payload), keys.privateKey).toString("base64url"),
        },
      });
    };
    const state = async () =>
      (await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus;
    return { order, unit, receipt, event, send, state, metadata };
  }
  const first = await fixture();
  assert.equal((await first.send({}, "x".repeat(86))).statusCode, 401);
  assert.equal(await first.state(), "PENDING_REVIEW");
  const responses = await Promise.all([first.send(), first.send()]);
  for (const r of responses) assert.equal(r.statusCode, 200, r.body);
  assert.equal(await first.state(), "PAID");
  assert.equal(
    (await prisma.receipt.findUniqueOrThrow({ where: { id: first.receipt.id } })).status,
    "APPROVED",
  );
  await first.send();
  assert.equal(
    await prisma.inventoryItem.count({
      where: { orderItemId: first.order.items[0].id, status: "SOLD" },
    }),
    1,
  );

  // Persisted evidence recovers after a disabled worker; tampering must not make it eligible.
  const recovery = await fixture();
  Object.assign(env, { BLU_AUTO_APPROVE_ENABLED: false });
  await recovery.send();
  await pendingBluQaReceipts();
  assert.equal(await recovery.state(), "PENDING_REVIEW");
  Object.assign(env, { BLU_AUTO_APPROVE_ENABLED: true });
  const assertBlocked = async () => {
    await pendingBluQaReceipts();
    assert.equal(await recovery.state(), "PENDING_REVIEW");
    assert.equal(
      (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: recovery.unit.id } })).status,
      "RESERVED",
    );
  };
  for (const patch of [
    { iban: "IR230000000000000000000099" },
    { number: "6219860000000099" },
    { amountIrr: "3" },
    { expiresAt: new Date(Date.now() - 60000).toISOString() },
    { stockHeld: undefined },
  ]) {
    await prisma.order.update({
      where: { id: recovery.order.id },
      data: { paymentMetadata: { ...recovery.metadata, ...patch } },
    });
    await assertBlocked();
  }
  await prisma.order.update({
    where: { id: recovery.order.id },
    data: { paymentMetadata: recovery.metadata, totalAmount: 1 },
  });
  await assertBlocked();
  await prisma.order.update({
    where: { id: recovery.order.id },
    data: { totalAmount: recovery.order.totalAmount },
  });
  await prisma.bluBankObservation.update({
    where: { matchedOrderId: recovery.order.id },
    data: { reviewRequired: true },
  });
  await assertBlocked();
  await prisma.bluBankObservation.update({
    where: { matchedOrderId: recovery.order.id },
    data: { reviewRequired: false },
  });
  await prisma.receipt.update({
    where: { id: recovery.receipt.id },
    data: { reference: "999999" },
  });
  await assertBlocked();
  await prisma.receipt.update({
    where: { id: recovery.receipt.id },
    data: { reference: "001234" },
  });
  env.BLU_STOCK_CHECKOUT_ENABLED = false;
  await assertBlocked();
  env.BLU_STOCK_CHECKOUT_ENABLED = true;
  await pendingBluQaReceipts();
  assert.equal(await recovery.state(), "PAID");

  // A single contended order must not stop unrelated approvals or bank discovery.
  Object.assign(env, { BLU_AUTO_APPROVE_ENABLED: false });
  const queued = [];
  for (let index = 0; index < 5; index++) {
    const job = await fixture();
    await job.send();
    queued.push(job);
  }
  Object.assign(env, { BLU_AUTO_APPROVE_ENABLED: true });
  let release!: () => void;
  let ready!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const acquired = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const lock = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id=${queued[0].order.id} FOR UPDATE`;
      ready();
      await gate;
    },
    { timeout: 15000 },
  );
  await acquired;
  const unlockTimer = setTimeout(release, 6500);
  try {
    await pendingBluQaReceipts();
    assert.equal(await queued[1].state(), "PAID");
  } finally {
    release();
    clearTimeout(unlockTimer);
    await lock;
  }
  await pendingBluQaReceipts();
  for (const job of queued) assert.equal(await job.state(), "PAID");

  // Payment-only QA must never be converted into a sale by the worker.
  const paymentOnly = await fixture();
  env.BLU_INVOICE_QA_USER_ID = buyer.id;
  env.BLU_QA_INVOICE_CAMPAIGN = randomUUID();
  await prisma.order.update({
    where: { id: paymentOnly.order.id },
    data: { paymentMetadata: { ...paymentOnly.metadata, qaCampaign: env.BLU_QA_INVOICE_CAMPAIGN } },
  });
  await paymentOnly.send();
  await pendingBluQaReceipts();
  assert.equal(await paymentOnly.state(), "PENDING_REVIEW");
  assert.equal(
    (await prisma.receipt.findUniqueOrThrow({ where: { id: paymentOnly.receipt.id } })).status,
    "PENDING",
  );
  console.log(
    "PASS: automatic signed-event delivery, concurrent replay, kill switch, persisted-proof recovery, tampered destination/amount/time denial, review/reference guards and no payment-only QA fulfillment",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
