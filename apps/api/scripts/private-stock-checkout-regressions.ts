import assert from "node:assert/strict";
import { createHash, createHmac, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { inject } from "light-my-request";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";
import { signAccessToken } from "../src/lib/jwt";
import { issueHeldStockQaInvoice } from "../src/modules/orders/blu-invoice";
import { deliverOrder } from "../src/modules/orders/orders.service";
import { pendingBluQaReceipts } from "../src/modules/orders/blu-qa-poll";
import { qaSelectionSchema, sendVenteTest } from "../src/modules/suppliers/vente-purchase";

async function main() {
  assert.equal(process.env.ISOLATED_REGRESSION_DB, "1");
  await prisma.supplierQaAttempt.deleteMany();
  const admin = await prisma.user.create({
    data: { name: "Held QA admin", role: "ADMIN", passwordHash: "unused" },
  });
  const buyer = await prisma.user.create({
    data: { name: "Held QA buyer", passwordHash: "unused" },
  });
  const other = await prisma.user.create({
    data: { name: "Held QA other", passwordHash: "unused" },
  });
  const app = createApp();
  const token = (u: typeof buyer) => signAccessToken({ sub: u.id, role: u.role });
  const call = (method: "GET" | "POST", url: string, payload?: unknown, bearer = token(admin)) =>
    inject(app, { method, url, payload, headers: { authorization: "Bearer " + bearer } });
  const selection = qaSelectionSchema.parse({
    productId: 39,
    deliveryType: "stock",
    name: "Microsoft Office 365 E3",
    maximumCostUsd: "0.5",
    walletExposureUsd: "1.17",
    holdForCheckout: true,
  });
  for (const change of [
    { productId: 40 },
    { name: "Other" },
    { maximumCostUsd: "0.6" },
    { walletExposureUsd: "1.57" },
    { deliveryType: "api_test" },
  ])
    assert.equal(qaSelectionSchema.safeParse({ ...selection, ...change }).success, false);
  const policy = {
    authorizationId: randomUUID(),
    enabled: true,
    userId: buyer.id,
    budgetUsd: "1.17",
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    selection,
  };
  const setPolicy = async (extra = {}) =>
    prisma.siteSetting.upsert({
      where: { key: "suppliers.qa.authorization" },
      create: { key: "suppliers.qa.authorization", value: JSON.stringify({ ...policy, ...extra }) },
      update: { value: JSON.stringify({ ...policy, ...extra }) },
    });
  const previousFetch = globalThis.fetch;
  process.env.VENTEBOT_API_KEY = "SYNTHETIC-HELD-KEY";
  let posts = 0,
    wallet = 1.17;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://web-production-1c7b1.up.railway.app");
    assert.equal(new Headers(init?.headers).get("X-Reseller-Key"), "SYNTHETIC-HELD-KEY");
    if (url.pathname.endsWith("/products"))
      return Response.json({
        success: true,
        products: [{ id: 39, name: selection.name, api_test: false, delivery_type: "stock" }],
      });
    if (url.pathname.endsWith("/quote"))
      return Response.json({
        success: true,
        quote: { product_id: 39, quantity: 1, total: 0.5, delivery_type: "stock", stock: 1 },
        wallet_balance: wallet,
      });
    if (url.pathname.endsWith("/me"))
      return Response.json({ success: true, wallet_balance: wallet });
    assert.equal(url.pathname, "/api/reseller/orders");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.quantity, 1);
    assert.equal(body.product_id, 39);
    posts++;
    return Response.json({
      success: true,
      order: {
        id: 101,
        delivery_type: "stock",
        status: "COMPLETED",
        product_id: 39,
        quantity: 1,
        amount_usd: 0.5,
        idempotency_key: body.idempotency_key,
        customer_reference: body.customer_reference,
        items: [{ account_data: "SYNTHETIC-HELD-CREDENTIAL" }],
      },
    });
  };
  try {
    wallet = 1.18;
    await assert.rejects(sendVenteTest("oosta-qa-" + randomUUID(), "0.5", selection), {
      code: "QA_WALLET_EXPOSURE_CHANGED",
    });
    assert.equal(posts, 0);
    wallet = 1.17;
    // The prior campaign remains bounded unless the operator explicitly installs the new grant.
    await prisma.supplierQaAttempt.create({
      data: {
        authorizationId: randomUUID(),
        requestKey: randomUUID(),
        reference: randomUUID(),
        userId: buyer.id,
        requestedById: admin.id,
        state: "DELIVERED",
        expectedCost: "0.5",
        chargedCost: "0.5",
        selection,
      },
    });
    await setPolicy();
    assert.equal((await call("GET", "/admin/suppliers/qa")).json().campaignCapUsd, "1.58");
    const requestKey = randomUUID(),
      path = "/admin/suppliers/qa/attempts";
    assert.equal((await call("POST", path, { requestKey }, token(buyer))).statusCode, 403);
    assert.equal(
      (await call("POST", path, { requestKey })).json().error.code,
      "QA_CAMPAIGN_BUDGET_EXCEEDED",
    );
    assert.equal(posts, 0);
    await setPolicy({ campaignCapUsd: "2.41" });
    const purchases = await Promise.all([
      call("POST", path, { requestKey }),
      call("POST", path, { requestKey }),
    ]);
    for (const response of purchases) assert.equal(response.statusCode, 200, response.body);
    assert.equal(posts, 1);
    const attempt = (await call("POST", path, { requestKey })).json().attempt;
    assert.equal(attempt.state, "STOCK_READY");
    assert.equal(attempt.chargedCost, "0.5");
    assert.equal(attempt.orderId, null);
    assert(!JSON.stringify(purchases.map((r) => r.json())).includes("SYNTHETIC-HELD-CREDENTIAL"));
    const planId = "internal-held-qa-plan-" + attempt.id;
    const plan = await prisma.productPlan.findUniqueOrThrow({
      where: { id: planId },
      include: { product: true },
    });
    assert.equal(plan.isActive, false);
    assert.equal(plan.product.isActive, false);
    assert.equal(
      (await call("GET", "/products", undefined, token(buyer))).body.includes(plan.product.slug),
      false,
    );
    assert.equal(
      (await prisma.inventoryItem.findFirstOrThrow({ where: { planId } })).status,
      "AVAILABLE",
    );
    env.BLU_INVOICE_QA_USER_ID = buyer.id;
    env.BLU_INVOICE_IBAN = "IR230000000000000000000019";
    env.BLU_INVOICE_CARD_NUMBER = "6219860000000019";
    env.BLU_QA_CARD_HOLDER_B64 = Buffer.from("Synthetic Holder").toString("base64");
    env.BLU_QA_INVOICE_CAMPAIGN = randomUUID();
    env.BLU_STOCK_CHECKOUT_ENABLED = false;
    await prisma.user.update({ where: { id: buyer.id }, data: { role: "ADMIN" } });
    await assert.rejects(issueHeldStockQaInvoice(attempt.id), { code: "BLU_QA_STOCK_UNAVAILABLE" });
    await prisma.user.update({ where: { id: buyer.id }, data: { role: "USER" } });
    const invoices = await Promise.all([
      issueHeldStockQaInvoice(attempt.id),
      issueHeldStockQaInvoice(attempt.id),
    ]);
    assert.equal(invoices[0].orderId, invoices[1].orderId);
    const id = invoices[0].orderId;
    assert.equal(invoices[0].amountIrr, 10040);
    const detail = () => call("GET", "/orders/" + id, undefined, token(buyer));
    assert.equal((await inject(app, { method: "GET", url: "/orders/" + id })).statusCode, 401);
    assert.equal((await call("GET", "/orders/" + id, undefined, token(other))).statusCode, 404);
    const pending = await detail();
    assert.match(String(pending.headers["cache-control"]), /no-store/);
    assert.equal(pending.json().order.bluInvoice.privateStockQa, true);
    assert.equal(pending.json().order.items[0].credentials.length, 0);
    const adminOrder = await call("GET", "/admin/orders/" + id);
    assert.equal(adminOrder.statusCode, 200);
    assert.equal(adminOrder.json().order.items[0].reservedCount, 1);
    assert.equal(adminOrder.json().order.items[0].fulfilledCount, 0);
    assert.equal(
      (await prisma.inventoryItem.findFirstOrThrow({ where: { planId } })).status,
      "RESERVED",
    );
    await assert.rejects(deliverOrder(id, "unverified"), { code: "BLU_QA_NO_FULFILLMENT" });
    const proof = await inject(app, {
      method: "POST",
      url: "/orders/" + id + "/receipt",
      headers: {
        authorization: "Bearer " + token(buyer),
        "content-type": "multipart/form-data; boundary=held-receipt",
      },
      payload: Buffer.from(
        '--held-receipt\r\nContent-Disposition: form-data; name="reference"\r\n\r\n001234\r\n--held-receipt\r\nContent-Disposition: form-data; name="receipt"; filename="fixture.png"\r\nContent-Type: image/png\r\n\r\nsynthetic-image\r\n--held-receipt--\r\n',
      ),
    });
    assert.equal(proof.statusCode, 201, proof.body);
    const receiptId = proof.json().receiptId;
    await prisma.receipt.update({ where: { id: receiptId }, data: { reference: "001234" } });
    assert((await pendingBluQaReceipts()).some((job) => job.amountIrr === "10040"));
    const approval = "/admin/receipts/" + receiptId + "/approve";
    assert.equal((await call("POST", approval, {}, token(buyer))).statusCode, 403);
    assert.equal((await call("POST", approval, {})).statusCode, 409);
    await assert.rejects(deliverOrder(id, "unverified"), { code: "BLU_QA_NO_FULFILLMENT" });
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const key = Buffer.alloc(32, 71);
    env.BLU_EVENT_PUBLIC_KEY = publicKey.export({ format: "der", type: "spki" }).toString("base64");
    env.BLU_TRACKING_HMAC_KEY = key.toString("base64");
    const time = new Date().toISOString();
    const body = JSON.stringify({
      version: 1,
      currency: "IRR",
      direction: "CREDIT",
      amountIrr: "10040",
      accountDigest: createHash("sha256")
        .update("oosta:blu:account:v1\0")
        .update(env.BLU_INVOICE_IBAN)
        .digest("hex"),
      transactionDigest: createHash("sha256").update(id).digest("hex"),
      trackingDigest: createHmac("sha256", key)
        .update("oosta:blu:tracking:v1\0")
        .update("001234")
        .digest("hex"),
      occurredAt: time,
      observedAt: time,
    });
    const observed = await inject(app, {
      method: "POST",
      url: "/internal/blu-events",
      payload: body,
      headers: {
        "content-type": "application/json",
        "x-oosta-blu-signature": sign(null, Buffer.from(body), privateKey).toString("base64url"),
      },
    });
    assert.equal(observed.json().status, "matched", observed.body);
    const claim = await prisma.bluBankObservation.findUniqueOrThrow({
      where: { matchedOrderId: id },
    });
    await prisma.bluBankObservation.update({
      where: { transactionDigest: claim.transactionDigest },
      data: { reviewRequired: true },
    });
    assert.equal((await call("POST", approval, {})).statusCode, 409);
    await prisma.bluBankObservation.update({
      where: { transactionDigest: claim.transactionDigest },
      data: { reviewRequired: false },
    });
    await prisma.receipt.update({ where: { id: receiptId }, data: { reference: "999999" } });
    assert.equal((await call("POST", approval, {})).statusCode, 409);
    await prisma.receipt.update({ where: { id: receiptId }, data: { reference: "001234" } });
    // An already matched claim must recover through the scheduled poll, without another bank call.
    Object.assign(env, { BLU_AUTO_APPROVE_ENABLED: true });
    await prisma.user.update({ where: { id: buyer.id }, data: { role: "ADMIN" } });
    await pendingBluQaReceipts();
    assert.equal((await detail()).json().order.paymentStatus, "PENDING_REVIEW");
    await prisma.user.update({ where: { id: buyer.id }, data: { role: "USER" } });
    const heldUnit = await prisma.inventoryItem.findFirstOrThrow({ where: { planId } });
    await prisma.inventoryItem.update({
      where: { id: heldUnit.id },
      data: { status: "AVAILABLE" },
    });
    await pendingBluQaReceipts();
    assert.equal((await detail()).json().order.paymentStatus, "PENDING_REVIEW");
    await prisma.inventoryItem.update({ where: { id: heldUnit.id }, data: { status: "RESERVED" } });
    await Promise.all([pendingBluQaReceipts(), pendingBluQaReceipts()]);
    assert.equal((await call("POST", approval, {})).statusCode, 409);
    const delivered = await detail();
    assert.equal(delivered.json().order.paymentStatus, "PAID");
    assert.match(
      (await prisma.receipt.findUniqueOrThrow({ where: { id: receiptId } })).reviewerNote ?? "",
      /automatic/i,
    );
    assert.equal(
      delivered.json().order.items[0].credentials[0].licenseKey,
      "SYNTHETIC-HELD-CREDENTIAL",
    );
    assert.equal(
      (await prisma.supplierQaAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).state,
      "DELIVERED",
    );
    await deliverOrder(id, "replay");
    assert.equal(await prisma.inventoryItem.count({ where: { planId, status: "SOLD" } }), 1);
    assert.equal(posts, 1);
    assert.equal((await call("GET", "/orders/" + id, undefined, token(other))).statusCode, 404);
    assert(
      !(await call("GET", "/site-settings", undefined, token(other))).body.includes(
        "SYNTHETIC-HELD-CREDENTIAL",
      ),
    );
    console.log(
      "PASS: private stock purchase cap, one debit, inactive inventory, one invoice, role/ownership denial, bank-proof gate, receipt mismatch/review block and atomic delivery",
    );
  } finally {
    globalThis.fetch = previousFetch;
    await setPolicy({ enabled: false });
  }
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
