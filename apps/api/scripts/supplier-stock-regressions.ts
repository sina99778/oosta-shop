import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { inject } from "light-my-request";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";
async function main() {
  assert.equal(process.env.ISOLATED_REGRESSION_DB, "1");
  // This file runs only in the disposable DB; isolate its campaign from earlier fixtures.
  await prisma.supplierQaAttempt.deleteMany();
  const admin = await prisma.user.create({
      data: { name: "Stock QA admin", passwordHash: "unused", role: "ADMIN" },
    }),
    buyer = await prisma.user.create({ data: { name: "Stock QA buyer", passwordHash: "unused" } });
  const adminToken = signAccessToken({ sub: admin.id, role: "ADMIN" }),
    token = signAccessToken({ sub: buyer.id, role: "USER" });
  const app = createApp();
  const call = (method: "GET" | "POST", url: string, body?: unknown, t = adminToken) =>
    inject(app, { method, url, payload: body, headers: { authorization: `Bearer ${t}` } });
  const selection = {
    productId: 54,
    deliveryType: "stock",
    name: "iLovePdf Premium 1Yr",
    maximumCostUsd: "0.4",
  };
  const prior = globalThis.fetch;
  let posts = 0;
  let walletChanged = false,
    ambiguousStock = false;
  let latestOrder: Record<string, unknown> | null = null;
  process.env.VENTEBOT_API_KEY = "SYNTHETIC-STOCK-KEY";
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/me"))
      return new Response(
        JSON.stringify({ success: true, wallet_balance: walletChanged ? 1.58 : 1.57 }),
      );
    if (path.endsWith("/products"))
      return new Response(
        JSON.stringify({
          success: true,
          products: [
            { id: 2147483000, api_test: true, delivery_type: "api_test" },
            { id: 54, name: selection.name, api_test: false, delivery_type: "stock" },
          ],
        }),
      );
    if (path.endsWith("/quote"))
      return new Response(
        JSON.stringify({
          success: true,
          quote: {
            product_id: JSON.parse(String(init?.body)).product_id,
            quantity: 1,
            total: JSON.parse(String(init?.body)).product_id === 54 ? 0.4 : 0.05,
            delivery_type: JSON.parse(String(init?.body)).product_id === 54 ? "stock" : "api_test",
            stock: 99,
          },
          wallet_balance: 1.57,
        }),
      );
    if (path.includes("/orders/") && (!init?.method || init.method === "GET"))
      return new Response(
        JSON.stringify({
          success: true,
          results: [
            {
              request_status: "completed",
              idempotency_key: latestOrder?.idempotency_key,
              customer_reference: latestOrder?.customer_reference,
              order: latestOrder,
            },
          ],
        }),
      );
    assert(path.endsWith("/orders") && init?.method === "POST");
    posts++;
    const b = JSON.parse(String(init?.body));
    latestOrder = {
      id: b.product_id === 54 ? 101 : -101,
      product_id: b.product_id,
      delivery_type: b.product_id === 54 ? "stock" : "api_test",
      status: "COMPLETED",
      quantity: 1,
      amount_usd: b.product_id === 54 ? 0.4 : 0.05,
      idempotency_key: b.idempotency_key,
      customer_reference: b.customer_reference,
      items: [{ account_data: "SYNTHETIC-DELIVERY" }],
    };
    return new Response(
      JSON.stringify({
        success: true,
        order: {
          ...latestOrder,
          amount_usd: ambiguousStock ? 0.9 : latestOrder.amount_usd,
          status: "PAID_PENDING_DELIVERY",
          items: [],
        },
      }),
    );
  };
  const setPolicy = async (chosen: unknown) =>
    prisma.siteSetting.update({
      where: { key: "suppliers.qa.authorization" },
      data: {
        value: JSON.stringify({
          authorizationId: randomUUID(),
          enabled: true,
          userId: buyer.id,
          budgetUsd: "1.57",
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          selection: chosen,
        }),
      },
    });
  try {
    await setPolicy(selection);
    const countBefore = await prisma.supplierQaAttempt.count();
    const denied = await call("POST", "/admin/suppliers/qa/attempts", { requestKey: randomUUID() });
    assert.equal(denied.statusCode, 503, denied.body);
    assert.equal(denied.json().error.code, "QA_PRICE_LOCK_UNAVAILABLE");
    assert.equal(posts, 0);
    assert.equal(await prisma.supplierQaAttempt.count(), countBefore);
    await prisma.supplierQaAttempt.create({
      data: {
        authorizationId: randomUUID(),
        requestKey: randomUUID(),
        reference: "synthetic-prior-cent-" + randomUUID(),
        userId: buyer.id,
        requestedById: admin.id,
        expectedCost: ".01",
        chargedCost: ".01",
        state: "DELIVERED",
      },
    });
    await setPolicy({ ...selection, walletExposureUsd: "1.57" });
    const policyRow = await prisma.siteSetting.findUniqueOrThrow({
      where: { key: "suppliers.qa.authorization" },
    });
    const tooSmall = JSON.parse(policyRow.value);
    tooSmall.budgetUsd = "0.4";
    await prisma.siteSetting.update({
      where: { key: policyRow.key },
      data: { value: JSON.stringify(tooSmall) },
    });
    const underExposure = await call("POST", "/admin/suppliers/qa/attempts", {
      requestKey: randomUUID(),
    });
    assert.equal(underExposure.statusCode, 409, underExposure.body);
    assert.equal(underExposure.json().error.code, "QA_BUDGET_EXCEEDED");
    assert.equal(posts, 0);
    await setPolicy({ ...selection, walletExposureUsd: "1.57" });
    walletChanged = true;
    const noDispatch = await call("POST", "/admin/suppliers/qa/attempts", {
      requestKey: randomUUID(),
    });
    assert.equal(noDispatch.statusCode, 200, noDispatch.body);
    assert.equal(noDispatch.json().attempt.state, "FAILED_NO_CHARGE");
    assert.equal(posts, 0);
    walletChanged = false;
    const stockKey = randomUUID();
    const stockPurchase = await call("POST", "/admin/suppliers/qa/attempts", {
      requestKey: stockKey,
    });
    assert.equal(stockPurchase.statusCode, 200, stockPurchase.body);
    const stockAttempt = stockPurchase.json().attempt;
    assert.equal(stockAttempt.state, "PENDING");
    const replay = await call("POST", "/admin/suppliers/qa/attempts", { requestKey: stockKey });
    assert.equal(replay.statusCode, 200, replay.body);
    assert.equal(posts, 1);
    const completed = await call(
      "POST",
      `/admin/suppliers/qa/attempts/${stockAttempt.id}/reconcile`,
      {},
    );
    assert.equal(completed.json().attempt.state, "DELIVERED");
    const stockOwner = await call("GET", `/orders/${stockAttempt.orderId}`, undefined, token);
    assert.equal(stockOwner.statusCode, 200);
    assert.match(String(stockOwner.headers["cache-control"]), /no-store/);
    assert.equal(stockOwner.json().order.supplierQaKind, "REAL_STOCK");
    assert.equal(stockOwner.json().order.totalAmount, 0);
    assert.equal(stockOwner.json().order.items[0].credentials[0].licenseKey, "SYNTHETIC-DELIVERY");
    assert.equal((await call("GET", `/orders/${stockAttempt.orderId}`)).statusCode, 404);
    const rows = await prisma.supplierQaAttempt.findMany({
      where: { state: { not: "FAILED_NO_CHARGE" } },
    });
    const reserved = rows.reduce(
      (sum, r) => sum.add(r.chargedCost ?? r.expectedCost),
      new Prisma.Decimal(0),
    );
    let fill = new Prisma.Decimal("1.58").sub(reserved).sub("0.05");
    assert(fill.gt(0));
    while (fill.gt(0)) {
      const part = Prisma.Decimal.min(fill, "0.8");
      await prisma.supplierQaAttempt.create({
        data: {
          authorizationId: randomUUID(),
          requestKey: randomUUID(),
          reference: "synthetic-budget-fill-" + randomUUID(),
          userId: buyer.id,
          requestedById: admin.id,
          expectedCost: part,
          chargedCost: part,
          state: "DELIVERED",
        },
      });
      fill = fill.sub(part);
    }
    const apiSelection = {
      productId: 2147483000,
      deliveryType: "api_test",
      name: "VenteBot API Test",
      maximumCostUsd: "0.05",
    };
    await setPolicy(apiSelection);
    const bought = await call("POST", "/admin/suppliers/qa/attempts", { requestKey: randomUUID() });
    assert.equal(bought.statusCode, 200, bought.body);
    let a = bought.json().attempt;
    assert.equal(a.state, "PENDING");
    const policy = await prisma.siteSetting.findUniqueOrThrow({
      where: { key: "suppliers.qa.authorization" },
    });
    const changed = JSON.parse(policy.value);
    changed.selection = selection;
    await prisma.siteSetting.update({
      where: { key: policy.key },
      data: { value: JSON.stringify(changed) },
    });
    const reconciled = await call("POST", `/admin/suppliers/qa/attempts/${a.id}/reconcile`, {});
    assert.equal(reconciled.statusCode, 200, reconciled.body);
    a = reconciled.json().attempt;
    assert.equal(a.state, "DELIVERED");
    assert.equal(a.selection.productId, 2147483000);
    const own = await call("GET", `/orders/${a.orderId}`, undefined, token);
    assert.equal(own.json().order.supplierQaKind, "API_TEST");
    assert.equal(own.json().order.items[0].credentials[0].licenseKey, "SYNTHETIC-DELIVERY");
    await setPolicy(apiSelection);
    const over = await call("POST", "/admin/suppliers/qa/attempts", { requestKey: randomUUID() });
    assert.equal(over.statusCode, 409, over.body);
    assert.equal(over.json().error.code, "QA_CAMPAIGN_BUDGET_EXCEEDED");
    assert.equal(posts, 2);
    // Independent ambiguity scenario, still only in this disposable database.
    await prisma.supplierQaAttempt.deleteMany();
    await prisma.supplierQaAttempt.create({
      data: {
        authorizationId: randomUUID(),
        requestKey: randomUUID(),
        reference: "synthetic-prior-" + randomUUID(),
        userId: buyer.id,
        requestedById: admin.id,
        expectedCost: ".01",
        chargedCost: ".01",
        state: "DELIVERED",
      },
    });
    await setPolicy({ ...selection, walletExposureUsd: "1.57" });
    ambiguousStock = true;
    const ambiguous = await call("POST", "/admin/suppliers/qa/attempts", {
      requestKey: randomUUID(),
    });
    assert.equal(ambiguous.statusCode, 200, ambiguous.body);
    assert.equal(ambiguous.json().attempt.state, "UNCERTAIN");
    assert.equal(ambiguous.json().attempt.orderId, null);
    assert.equal(ambiguous.json().attempt.selection.walletExposureUsd, "1.57");
    const state = await call("GET", "/admin/suppliers/qa");
    assert.equal(state.json().campaignReservedUsd, "1.58");
    await setPolicy(apiSelection);
    const blocked = await call("POST", "/admin/suppliers/qa/attempts", {
      requestKey: randomUUID(),
    });
    assert.equal(blocked.statusCode, 409, blocked.body);
    assert.equal(blocked.json().error.code, "QA_CAMPAIGN_REQUIRES_REVIEW");
    assert.equal(posts, 3);
    console.log(
      "PASS: unbounded stock denied before reservation, immutable reconciliation selection and cumulative USD1.58 campaign cap",
    );
  } finally {
    globalThis.fetch = prior;
    delete process.env.VENTEBOT_API_KEY;
  }
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
