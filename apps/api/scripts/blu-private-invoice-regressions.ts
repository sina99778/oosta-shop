import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inject } from "light-my-request";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";
import { signAccessToken } from "../src/lib/jwt";
import { deliverOrder } from "../src/modules/orders/orders.service";
import { pendingBluQaReceipts } from "../src/modules/orders/blu-qa-poll";

async function main() {
  assert.equal(process.env.ISOLATED_REGRESSION_DB, "1");
  const admin = await prisma.user.create({
    data: { name: "Blu QA admin", passwordHash: "unused", role: "ADMIN" },
  });
  const buyer = await prisma.user.create({
    data: { name: "Blu QA owner", passwordHash: "unused" },
  });
  const app = createApp();
  const adminToken = signAccessToken({ sub: admin.id, role: "ADMIN" });
  const buyerToken = signAccessToken({ sub: buyer.id, role: "USER" });
  const reportDir = await mkdtemp(join(tmpdir(), "oosta-blu-status-"));
  const status = (token?: string) =>
    inject(app, {
      method: "GET",
      url: "/admin/blu/status",
      headers: token ? { authorization: "Bearer " + token } : {},
    });
  try {
    const report = join(reportDir, "last-run");
    const now = Math.floor(Date.now() / 1000);
    assert.equal((await status()).statusCode, 401);
    assert.equal((await status(buyerToken)).statusCode, 403);
    assert.deepEqual((await status(adminToken)).json(), { state: "disabled", checkedAt: null });
    env.BLU_POLL_STATUS_FILE = report;
    assert.deepEqual((await status(adminToken)).json(), { state: "waiting", checkedAt: null });
    await writeFile(report, now + " enrollmentRequired\n");
    const current = await status(adminToken);
    assert.match(String(current.headers["cache-control"]), /no-store/);
    assert.deepEqual(current.json(), {
      state: "enrollmentRequired",
      checkedAt: new Date(now * 1000).toISOString(),
    });
    await writeFile(report, now - 601 + " idle\n");
    assert.equal((await status(adminToken)).json().state, "stale");
    await writeFile(report, now + " matched synthetic-private-value\n");
    assert.deepEqual((await status(adminToken)).json(), { state: "unavailable", checkedAt: null });
  } finally {
    env.BLU_POLL_STATUS_FILE = undefined;
    await rm(reportDir, { recursive: true, force: true });
  }
  const url = "/admin/blu/qa-invoice";
  const post = (token: string, payload = {}) =>
    inject(app, {
      method: "POST",
      url,
      payload,
      headers: { authorization: "Bearer " + token },
    });
  assert.equal((await post(adminToken)).statusCode, 404);
  env.BLU_INVOICE_QA_USER_ID = buyer.id;
  env.BLU_INVOICE_IBAN = "IR230000000000000000000031";
  env.BLU_INVOICE_CARD_NUMBER = "6219860000000001";
  env.BLU_QA_CARD_HOLDER_B64 = Buffer.from("Synthetic owner").toString("base64");
  env.BLU_QA_INVOICE_CAMPAIGN = "00000000-0000-4000-8000-000000000001";
  assert.equal((await post(buyerToken)).statusCode, 403);
  assert.equal(
    (
      await inject(app, {
        method: "POST",
        url,
        payload: {},
        remoteAddress: "203.0.113.45",
        headers: { authorization: "Bearer " + adminToken, "x-forwarded-for": "127.0.0.1" },
      })
    ).statusCode,
    404,
  );
  assert.equal((await post(adminToken, { amount: 50000000 })).statusCode, 400);
  const results = await Promise.all([post(adminToken), post(adminToken)]);
  for (const response of results) assert.equal(response.statusCode, 200, response.body);
  const invoice = results[0].json().invoice;
  assert.deepEqual(await pendingBluQaReceipts(), []);
  assert.equal(results[1].json().invoice.orderId, invoice.orderId);
  assert.equal(invoice.amountIrr, 10000);
  assert(!results[0].body.includes(env.BLU_INVOICE_CARD_NUMBER));
  assert(!results[0].body.includes(env.BLU_INVOICE_IBAN));
  const orderUrl = "/orders/" + invoice.orderId;
  assert.equal(
    (
      await inject(app, {
        method: "GET",
        url: orderUrl,
        headers: { authorization: "Bearer " + adminToken },
      })
    ).statusCode,
    404,
  );
  const owner = await inject(app, {
    method: "GET",
    url: orderUrl,
    headers: { authorization: "Bearer " + buyerToken },
  });
  assert.equal(owner.statusCode, 200, owner.body);
  assert.match(String(owner.headers["cache-control"]), /no-store/);
  const detail = owner.json().order;
  assert.equal(detail.bluInvoice.qaOnly, true);
  assert.equal(detail.cardToCard.number, env.BLU_INVOICE_CARD_NUMBER);
  assert.equal(detail.items.length, 0);
  assert.equal(detail.paymentStatus, "PENDING");
  await assert.rejects(deliverOrder(invoice.orderId, "synthetic"), {
    code: "BLU_QA_NO_FULFILLMENT",
  });
  const receipt = await prisma.receipt.create({
    data: { orderId: invoice.orderId, imageData: new Uint8Array([1]), mimeType: "image/png" },
  });
  const approval = await inject(app, {
    method: "POST",
    url: "/admin/receipts/" + receipt.id + "/approve",
    payload: {},
    headers: { authorization: "Bearer " + adminToken },
  });
  assert.equal(approval.statusCode, 409, approval.body);
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: invoice.orderId } })).paidAt,
    null,
  );
  assert.equal(
    (await prisma.receipt.findUniqueOrThrow({ where: { id: receipt.id } })).status,
    "PENDING",
  );
  await prisma.order.update({
    where: { id: invoice.orderId },
    data: { paymentStatus: "PENDING_REVIEW" },
  });
  await prisma.receipt.update({ where: { id: receipt.id }, data: { reference: " ۰۰۱۲۳۴ " } });
  assert.deepEqual(await pendingBluQaReceipts(), [
    {
      iban: env.BLU_INVOICE_IBAN,
      cardNumber: env.BLU_INVOICE_CARD_NUMBER,
      amountIrr: "10000",
      reference: "001234",
    },
  ]);
  env.BLU_QA_INVOICE_CAMPAIGN = "00000000-0000-4000-8000-000000000002";
  assert.deepEqual(await pendingBluQaReceipts(), []);
  env.BLU_QA_INVOICE_CAMPAIGN = "00000000-0000-4000-8000-000000000001";
  await prisma.user.update({ where: { id: buyer.id }, data: { role: "ADMIN" } });
  assert.deepEqual(await pendingBluQaReceipts(), []);
  await prisma.user.update({ where: { id: buyer.id }, data: { role: "USER" } });
  const pollKey = Buffer.alloc(32, 33);
  env.BLU_TRACKING_HMAC_KEY = pollKey.toString("base64");
  await prisma.bluBankObservation.create({
    data: {
      transactionDigest: randomBytes(32).toString("hex"),
      trackingDigest: createHmac("sha256", pollKey)
        .update("oosta:blu:reference:v1\0")
        .update("001234")
        .digest("hex"),
      occurredAt: new Date(),
      invoiceKey: env.BLU_INVOICE_IBAN + ":10000",
      matchedOrderId: invoice.orderId,
    },
  });
  assert.deepEqual(await pendingBluQaReceipts(), []);
  const otherReceipt = await prisma.receipt.create({
    data: {
      orderId: invoice.orderId,
      imageData: new Uint8Array([1]),
      mimeType: "image/png",
      reference: "883344",
    },
  });
  assert.deepEqual(
    (await pendingBluQaReceipts()).map(({ reference }) => reference),
    ["883344"],
  );
  await prisma.receipt.update({ where: { id: otherReceipt.id }, data: { status: "REJECTED" } });
  env.BLU_INVOICE_CARD_NUMBER = "6219860000000002";
  assert.equal((await post(adminToken)).statusCode, 409);
  env.BLU_INVOICE_CARD_NUMBER = "6219860000000001";
  const second = await prisma.user.create({
    data: { name: "Another QA user", passwordHash: "unused" },
  });
  env.BLU_INVOICE_QA_USER_ID = second.id;
  assert.equal((await post(adminToken)).statusCode, 409);
  env.BLU_INVOICE_QA_USER_ID = buyer.id;
  env.BLU_QA_INVOICE_CAMPAIGN = "00000000-0000-4000-8000-000000000002";
  assert.equal((await post(adminToken)).statusCode, 409);
  assert.equal(await prisma.order.count({ where: { userId: buyer.id } }), 1);
  env.BLU_QA_AMOUNT_IRR = "10010";
  const replacement = await post(adminToken);
  assert.equal(replacement.statusCode, 200, replacement.body);
  assert.equal(replacement.json().invoice.amountIrr, 10010);
  assert.notEqual(replacement.json().invoice.orderId, invoice.orderId);
  env.BLU_QA_AMOUNT_IRR = "10020";
  assert.equal((await post(adminToken)).statusCode, 409);
  env.BLU_QA_AMOUNT_IRR = "50000";
  assert.equal((await post(adminToken)).statusCode, 503);
  env.BLU_QA_AMOUNT_IRR = undefined;

  await prisma.user.update({ where: { id: admin.id }, data: { role: "USER" } });
  assert.equal((await status(adminToken)).statusCode, 403);
  assert.equal((await post(adminToken)).statusCode, 403);
  console.log(
    "PASS: private payment-only QA invoice authorization, replay, owner scope and no fulfillment",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
