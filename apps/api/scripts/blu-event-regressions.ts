import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync, sign } from "node:crypto";
import { inject } from "light-my-request";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";
import { signBankObservation } from "../../../deploy/blu/event-wire.cjs";

async function main() {
  assert.equal(process.env.ISOLATED_REGRESSION_DB, "1");
  const buyer = await prisma.user.create({
    data: { name: "Blu event fixture", passwordHash: "unused" },
  });
  const keys = generateKeyPairSync("ed25519");
  const iban = "IR230000000000000000000001";
  env.BLU_EVENT_PUBLIC_KEY = keys.publicKey
    .export({ type: "spki", format: "der" })
    .toString("base64");
  const trackingKey = Buffer.alloc(32, 17);
  env.BLU_TRACKING_HMAC_KEY = trackingKey.toString("base64");
  env.BLU_INVOICE_QA_USER_ID = buyer.id;
  env.BLU_INVOICE_IBAN = iban;
  const now = Date.now();
  const amount = "4199990";
  const order = await prisma.order.create({
    data: {
      userId: buyer.id,
      paymentProvider: "CARD_TO_CARD",
      paymentStatus: "PENDING_REVIEW",
      totalAmount: amount,
      currency: "IRR",
      createdAt: new Date(now - 5000),
      bluInvoiceKey: iban + ":" + amount,
      paymentMetadata: {
        purpose: "BLU_INVOICE",
        iban,
        number: "6219860000000001",
        holder: "Fixture",
        bank: "Fixture",
        baseAmount: 4200000,
        discount: 10,
        amountIrr: amount,
        expiresAt: new Date(now + 50000).toISOString(),
      },
    },
  });
  const app = createApp();
  const wire = signBankObservation(
    {
      1: "synthetic-row-id",
      2: { 1: { 1: iban } },
      3: { 2: "دریافت از کارت" },
      4: { 1: { 1: { 1: amount + ".0" }, 2: { 1: "IRR" } } },
      5: { 1: { 1: { 1: String(Math.floor((now - 1000) / 1000)) } } },
      6: { 1: "2" },
    },
    { 15: "شماره پیگیری: ۰۰۱۲۳۴" },
    { iban, amountIrr: amount, reference: "001234" },
    keys.privateKey,
    trackingKey,
    new Date(now),
  );
  assert(wire);
  const event = JSON.parse(wire.body);
  const signed = (body: string) =>
    sign(null, Buffer.from(body), keys.privateKey).toString("base64url");
  const request = (value: object, signature?: string, omitSignature = false) => {
    const payload = JSON.stringify(value);
    return inject(app, {
      method: "POST",
      url: "/internal/blu-events",
      payload,
      headers: {
        "content-type": "application/json",
        ...(omitSignature ? {} : { "x-oosta-blu-signature": signature ?? signed(payload) }),
      },
    });
  };
  assert.equal((await request(event, undefined, true)).statusCode, 401);
  assert.equal(
    (await request({ ...event, amountIrr: "4199991" }, signed(JSON.stringify(event)))).statusCode,
    401,
  );
  assert.equal(
    (
      await request({
        ...event,
        observedAt: new Date(now - 360000).toISOString(),
        occurredAt: new Date(now - 370000).toISOString(),
      })
    ).statusCode,
    400,
  );
  assert.equal((await request({ ...event, direction: "DEBIT" })).statusCode, 400);
  const skipped = await request({ ...event, amountIrr: "4199980" });
  assert.deepEqual(skipped.json(), { status: "ignored" });
  const wrongAccount = await request({ ...event, accountDigest: "e".repeat(64) });
  assert.deepEqual(wrongAccount.json(), { status: "ignored" });
  assert.equal(await prisma.bluBankObservation.count(), 0);
  const first = await request(event, wire.signature);
  assert.equal(first.statusCode, 200, first.body);
  assert.deepEqual(first.json(), { status: "observed" });
  assert.match(String(first.headers["cache-control"]), /no-store/);
  assert(!first.body.includes(event.trackingDigest));
  await prisma.receipt.create({
    data: {
      orderId: order.id,
      imageData: new Uint8Array([1]),
      mimeType: "image/png",
      reference: "۰۰۱۲۳۴",
    },
  });
  const parallel = await Promise.all([request(event), request(event)]);
  assert(
    parallel.every(
      (response) => response.statusCode === 200 && response.json().status === "matched",
    ),
  );
  assert.equal((await request({ ...event, trackingDigest: "d".repeat(64) })).statusCode, 409);
  const competition = await Promise.all([
    request({ ...event, transactionDigest: "b".repeat(64) }),
    request({ ...event, transactionDigest: "f".repeat(64) }),
  ]);
  assert(
    competition.every(
      (response) => response.statusCode === 200 && response.json().status === "review",
    ),
  );
  assert.deepEqual((await request(event)).json(), { status: "review" });
  assert.deepEqual(
    (
      await request({
        ...event,
        transactionDigest: "c".repeat(64),
        occurredAt: new Date(now - 9000).toISOString(),
      })
    ).json(),
    { status: "observed" },
  );
  assert.equal(await prisma.bluBankObservation.count({ where: { matchedOrderId: order.id } }), 1);
  assert.equal(await prisma.bluBankObservation.count(), 4);
  await prisma.receipt.updateMany({ where: { orderId: order.id }, data: { status: "REJECTED" } });
  assert.deepEqual((await request(event)).json(), { status: "observed" });
  const unchanged = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(unchanged.paymentStatus, "PENDING_REVIEW");
  assert.equal(unchanged.paidAt, null);
  const anotherAmount = "4299990";
  const another = await prisma.order.create({
    data: {
      userId: buyer.id,
      paymentProvider: "CARD_TO_CARD",
      paymentStatus: "PENDING_REVIEW",
      totalAmount: anotherAmount,
      currency: "IRR",
      createdAt: order.createdAt,
      bluInvoiceKey: iban + ":" + anotherAmount,
      paymentMetadata: {
        ...(order.paymentMetadata as object),
        amountIrr: anotherAmount,
        baseAmount: 4300000,
      },
    },
  });
  const earlierA = { ...event, amountIrr: anotherAmount, transactionDigest: "1".repeat(64) };
  const earlierB = {
    ...earlierA,
    transactionDigest: "2".repeat(64),
    trackingDigest: createHmac("sha256", trackingKey)
      .update("oosta:blu:tracking:v1\0")
      .update("112233")
      .digest("hex"),
  };
  assert.deepEqual((await request(earlierA)).json(), { status: "observed" });
  assert.deepEqual((await request(earlierB)).json(), { status: "observed" });
  await prisma.receipt.createMany({
    data: ["001234", "112233"].map((reference) => ({
      orderId: another.id,
      imageData: new Uint8Array([1]),
      mimeType: "image/png",
      reference,
    })),
  });
  assert.deepEqual((await request(earlierA)).json(), { status: "review" });
  assert.equal(await prisma.bluBankObservation.count({ where: { matchedOrderId: another.id } }), 0);
  const referenceAmount = "4399990";
  const referenceOrder = await prisma.order.create({
    data: {
      userId: buyer.id,
      paymentProvider: "CARD_TO_CARD",
      paymentStatus: "PENDING_REVIEW",
      totalAmount: referenceAmount,
      currency: "IRR",
      createdAt: order.createdAt,
      bluInvoiceKey: iban + ":" + referenceAmount,
      paymentMetadata: {
        ...(order.paymentMetadata as object),
        amountIrr: referenceAmount,
        baseAmount: 4400000,
      },
    },
  });
  const referenceEvent = {
    ...event,
    amountIrr: referenceAmount,
    transactionDigest: "3".repeat(64),
    receiptIdentifierType: "REFERENCE",
    trackingDigest: createHmac("sha256", trackingKey)
      .update("oosta:blu:reference:v1\0")
      .update("001234")
      .digest("hex"),
  };
  assert.deepEqual((await request(referenceEvent)).json(), { status: "observed" });
  await prisma.receipt.create({
    data: {
      orderId: referenceOrder.id,
      imageData: new Uint8Array([1]),
      mimeType: "image/png",
      reference: "۰۰۱۲۳۴",
    },
  });
  assert.deepEqual(
    (await request({ ...referenceEvent, receiptIdentifierType: "TRACKING" })).json(),
    { status: "observed" },
  );
  assert.deepEqual((await request(referenceEvent)).json(), { status: "matched" });
  assert.equal(
    (await request({ ...referenceEvent, receiptIdentifierType: "UNKNOWN" })).statusCode,
    400,
  );
  const trackingCompetition = {
    ...referenceEvent,
    receiptIdentifierType: "TRACKING",
    trackingDigest: event.trackingDigest,
    transactionDigest: "4".repeat(64),
  };
  assert.deepEqual((await request(trackingCompetition)).json(), { status: "review" });
  assert.deepEqual((await request(referenceEvent)).json(), { status: "review" });
  const referenceUnpaid = await prisma.order.findUniqueOrThrow({
    where: { id: referenceOrder.id },
  });
  assert.equal(referenceUnpaid.paymentStatus, "PENDING_REVIEW");
  assert.equal(referenceUnpaid.paidAt, null);
  env.BLU_EVENT_PUBLIC_KEY = undefined;
  assert.equal((await request(event)).statusCode, 404);
  console.log(
    "PASS: signed Blu observation, exact replay, provisional claim and no paid transition",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
