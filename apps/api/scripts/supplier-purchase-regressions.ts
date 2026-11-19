import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { inject } from "light-my-request";
import { prisma } from "../src/lib/prisma";
import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";

async function main() {
  assert.equal(process.env.ISOLATED_REGRESSION_DB, "1");
  const admin = await prisma.user.create({
      data: { name: "QA fixture admin", passwordHash: "unused", role: "ADMIN" },
    }),
    buyer = await prisma.user.create({
      data: { name: "QA fixture buyer", passwordHash: "unused" },
    }),
    stranger = await prisma.user.create({
      data: { name: "QA fixture stranger", passwordHash: "unused" },
    });
  const adminToken = signAccessToken({ sub: admin.id, role: "ADMIN" }),
    buyerToken = signAccessToken({ sub: buyer.id, role: "USER" }),
    strangerToken = signAccessToken({ sub: stranger.id, role: "USER" });
  const app = createApp();
  const call = (
    method: "GET" | "POST",
    url: string,
    payload?: unknown,
    token: string | null = adminToken,
  ) =>
    inject(app, {
      method,
      url,
      payload,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  assert.equal((await call("GET", "/admin/suppliers/qa", undefined, null)).statusCode, 401);
  assert.equal((await call("GET", "/admin/suppliers/qa", undefined, buyerToken)).statusCode, 403);
  assert.equal((await call("GET", "/admin/suppliers/qa")).statusCode, 200);
  const before = globalThis.fetch;
  let posts = 0;
  process.env.VENTEBOT_API_KEY = "SYNTHETIC-QA-KEY";
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://web-production-1c7b1.up.railway.app");
    if (url.pathname.endsWith("/products"))
      return new Response(
        JSON.stringify({
          success: true,
          products: [{ id: 2147483000, api_test: true, delivery_type: "api_test" }],
        }),
      );
    if (url.pathname.endsWith("/quote"))
      return new Response(
        JSON.stringify({
          success: true,
          quote: {
            product_id: 2147483000,
            quantity: 1,
            total: 0.01,
            delivery_type: "api_test",
            stock: 99,
          },
          wallet_balance: 1,
        }),
      );
    posts++;
    const body = JSON.parse(String(init?.body));
    await new Promise((resolve) => setTimeout(resolve, 30));
    return new Response(
      JSON.stringify({
        success: true,
        order: {
          id: 42,
          delivery_type: "api_test",
          status: "COMPLETED",
          product_id: 2147483000,
          quantity: 1,
          amount_usd: 0.01,
          idempotency_key: body.idempotency_key,
          customer_reference: body.customer_reference,
          items: [{ account_data: "SYNTHETIC-PRIVATE-DELIVERY" }],
        },
      }),
    );
  };
  try {
    const url = "/admin/suppliers/qa/attempts";
    assert.equal((await call("POST", url, { requestKey: randomUUID() })).statusCode, 403);
    assert.equal(posts, 0);
    const policy = {
      authorizationId: randomUUID(),
      enabled: true,
      userId: buyer.id,
      budgetUsd: "0.03",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };
    await prisma.siteSetting.upsert({
      where: { key: "suppliers.qa.authorization" },
      create: { key: "suppliers.qa.authorization", value: JSON.stringify(policy) },
      update: { value: JSON.stringify(policy) },
    });
    const requestKey = randomUUID();
    const answers = await Promise.all([
      call("POST", url, { requestKey }),
      call("POST", url, { requestKey }),
    ]);
    for (const r of answers) assert.equal(r.statusCode, 200, r.body);
    assert.equal(posts, 1);
    const qa = (await call("GET", "/admin/suppliers/qa")).json();
    const attempt = qa.attempts[0];
    assert.equal(attempt.state, "DELIVERED");
    assert(attempt.orderId);
    const categories = await call("GET", "/categories", undefined, buyerToken);
    assert(
      !categories.body.includes("internal-supplier-qa"),
      "QA categories must stay out of public navigation",
    );
    assert(!JSON.stringify(qa).includes("SYNTHETIC-PRIVATE-DELIVERY"));
    assert(!JSON.stringify(qa).includes("SYNTHETIC-QA-KEY"));
    const own = await call("GET", `/orders/${attempt.orderId}`, undefined, buyerToken);
    assert.equal(own.statusCode, 200);
    assert.equal(own.json().order.isSupplierQa, true);
    assert.equal(own.json().order.totalAmount, 0);
    assert.equal(own.json().order.items[0].credentials[0].licenseKey, "SYNTHETIC-PRIVATE-DELIVERY");
    assert.match(String(own.headers["cache-control"]), /no-store/);
    assert.equal(
      (await call("GET", `/orders/${attempt.orderId}`, undefined, strangerToken)).statusCode,
      404,
    );
    assert.equal((await call("POST", url, { requestKey })).statusCode, 200);
    assert.equal(posts, 1);
    assert.equal((await call("POST", url, { requestKey: randomUUID() })).statusCode, 409);
    assert.equal(posts, 1);
    await prisma.user.update({ where: { id: admin.id }, data: { role: "USER" } });
    assert.equal((await call("POST", url, { requestKey: randomUUID() })).statusCode, 403);
    await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
    const next = { ...policy, authorizationId: randomUUID() };
    await prisma.siteSetting.update({
      where: { key: "suppliers.qa.authorization" },
      data: { value: JSON.stringify(next) },
    });
    const previous = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (new URL(String(input)).pathname.endsWith("/orders")) {
        posts++;
        throw new Error("SYNTHETIC-QA-KEY");
      }
      return previous(input, init);
    };
    const uncertain = await call("POST", url, { requestKey: randomUUID() });
    assert.equal(uncertain.statusCode, 200, uncertain.body);
    assert.equal(uncertain.json().attempt.state, "UNCERTAIN");
    const uncertainId = uncertain.json().attempt.id;
    globalThis.fetch = async () => new Response("{}", { status: 404 });
    const reconciled = await call("POST", `${url}/${uncertainId}/reconcile`, {});
    assert.equal(reconciled.json().attempt.state, "UNCERTAIN");
    assert.equal((await call("POST", url, { requestKey: randomUUID() })).statusCode, 409);
    assert.equal(posts, 2);
    await prisma.siteSetting.update({
      where: { key: "suppliers.qa.authorization" },
      data: { value: JSON.stringify({ ...policy, authorizationId: randomUUID() }) },
    });
    globalThis.fetch = previous;
    const blockedCampaign = await call("POST", url, { requestKey: randomUUID() });
    assert.equal(blockedCampaign.statusCode, 409, blockedCampaign.body);
    assert.equal(blockedCampaign.json().error.code, "QA_CAMPAIGN_REQUIRES_REVIEW");
    assert.equal(posts, 2);
    // Resolve the synthetic unknown via an explicit supplier no-charge lookup.
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          success: true,
          results: [
            {
              request_status: "failed_no_charge",
              idempotency_key: uncertain.json().attempt.requestKey
                ? "oosta-qa-" + uncertain.json().attempt.requestKey
                : "",
              customer_reference: "oosta-qa-" + uncertain.json().attempt.requestKey,
              order: null,
            },
          ],
        }),
      );
    assert.equal(
      (await call("POST", `${url}/${uncertainId}/reconcile`, {})).json().attempt.state,
      "FAILED_NO_CHARGE",
    );
    // Deferred delivery is reconciled with GET only and must not reopen closed orders.
    for (const closed of [null, "REFUNDED", "EXPIRED"] as const) {
      const pendingKey = randomUUID(),
        reference = "oosta-qa-" + pendingKey;
      await prisma.siteSetting.update({
        where: { key: "suppliers.qa.authorization" },
        data: { value: JSON.stringify({ ...policy, authorizationId: randomUUID() }) },
      });
      let delivered = false;
      const remoteOrder = () => ({
        id: closed === null ? -50 : closed === "REFUNDED" ? -51 : -52,
        delivery_type: "api_test",
        status: delivered ? "COMPLETED" : "PAID_PENDING_DELIVERY",
        product_id: 2147483000,
        quantity: 1,
        amount_usd: 0.01,
        idempotency_key: reference,
        customer_reference: reference,
        items: delivered ? [{ account_data: "SYNTHETIC-DEFERRED-DELIVERY" }] : [],
      });
      globalThis.fetch = async (input, init) => {
        const path = new URL(String(input)).pathname;
        if (path.endsWith("/orders/lookup"))
          return new Response(
            JSON.stringify({
              success: true,
              results: [
                {
                  request_status: "completed",
                  idempotency_key: reference,
                  customer_reference: reference,
                  order: remoteOrder(),
                },
              ],
            }),
          );
        if (path.endsWith("/orders")) {
          posts++;
          return new Response(JSON.stringify({ success: true, order: remoteOrder() }));
        }
        return previous(input, init);
      };
      const pending = await call("POST", url, { requestKey: pendingKey });
      assert.equal(pending.statusCode, 200, pending.body);
      assert.equal(pending.json().attempt.state, "PENDING");
      const a = pending.json().attempt;
      if (closed)
        await prisma.order.update({ where: { id: a.orderId }, data: { paymentStatus: closed } });
      delivered = true;
      const replies = await Promise.all(
        Array.from({ length: 4 }, () => call("POST", `${url}/${a.id}/reconcile`, {})),
      );
      for (const reply of replies)
        assert.equal(reply.json().attempt.state, closed ? "REVIEW" : "DELIVERED");
      const units = await prisma.inventoryItem.count({
        where: { orderItem: { orderId: a.orderId } },
      });
      assert.equal(units, closed ? 0 : 1);
      assert.equal(
        (await prisma.order.findUniqueOrThrow({ where: { id: a.orderId } })).paymentStatus,
        closed ?? "PAID",
      );
      const vault = await call("GET", `/orders/${a.orderId}`, undefined, buyerToken);
      assert.equal(vault.json().order.items[0].credentials.length, closed ? 0 : 1);
      // Independent closed-order cases use disposable fixtures; remove only their QA attempt
      // after assertions so the intentional REVIEW cannot authorize another campaign spend.
      if (closed) await prisma.supplierQaAttempt.delete({ where: { id: a.id } });
    }
    const beforeDenied = posts;
    for (const override of [
      { budgetUsd: "0.001" },
      { expiresAt: new Date(Date.now() - 1000).toISOString() },
    ]) {
      await prisma.siteSetting.update({
        where: { key: "suppliers.qa.authorization" },
        data: { value: JSON.stringify({ ...policy, authorizationId: randomUUID(), ...override }) },
      });
      globalThis.fetch = previous;
      const denied = await call("POST", url, { requestKey: randomUUID() });
      assert.equal(denied.statusCode, "expiresAt" in override ? 403 : 409);
      assert.equal(posts, beforeDenied);
    }
    console.log(
      "PASS: bounded operator-funded QA, denied access, concurrent/replayed purchase, private profile delivery and ambiguous result isolation",
    );
  } finally {
    globalThis.fetch = before;
    delete process.env.VENTEBOT_API_KEY;
  }
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
