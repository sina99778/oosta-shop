/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
require("tsx/cjs");
const {
  preflightVenteTest,
  sendVenteTest,
  lookupVenteTest,
  QA_PRODUCT_ID,
} = require("../apps/api/src/modules/suppliers/vente-purchase.ts");
const reference = "oosta-qa-00000000-0000-4000-8000-000000000001";
const order = {
  id: 42,
  delivery_type: "api_test",
  status: "COMPLETED",
  product_id: 2147483000,
  quantity: 1,
  amount_usd: 0.01,
  idempotency_key: reference,
  customer_reference: reference,
  items: [{ account_data: "SYNTHETIC-DELIVERY" }],
};
async function main() {
  const before = global.fetch;
  process.env.VENTEBOT_API_KEY = "SYNTHETIC-VENTE-KEY";
  let posts = 0;
  try {
    global.fetch = async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.origin, "https://web-production-1c7b1.up.railway.app");
      assert.equal(init.redirect, "error");
      assert.equal(init.headers["X-Reseller-Key"], "SYNTHETIC-VENTE-KEY");
      if (url.pathname.endsWith("/products"))
        return new Response(
          JSON.stringify({
            success: true,
            products: [
              { id: QA_PRODUCT_ID, name: "API Test", api_test: true, delivery_type: "api_test" },
            ],
          }),
        );
      if (url.pathname.endsWith("/quote"))
        return new Response(
          JSON.stringify({
            success: true,
            quote: {
              product_id: QA_PRODUCT_ID,
              quantity: 1,
              total: 0.01,
              delivery_type: "api_test",
              stock: 99,
            },
            wallet_balance: 1.58,
          }),
        );
      if (init.method === "POST") {
        posts++;
        const b = JSON.parse(init.body);
        assert.equal(b.idempotency_key, reference);
        assert.equal(b.quantity, 1);
        assert.equal(b.product_id, QA_PRODUCT_ID);
        return new Response(JSON.stringify({ success: true, order }));
      }
      return new Response(
        JSON.stringify({
          success: true,
          results: [
            {
              request_status: "completed",
              idempotency_key: reference,
              customer_reference: reference,
              order,
            },
          ],
        }),
      );
    };
    const validTransport = global.fetch;
    for (const invalid of [
      { total: "0.01", wallet_balance: "NaN" },
      { total: "0.01", wallet_balance: "Infinity" },
      { total: "0.0100001", wallet_balance: "1" },
    ]) {
      global.fetch = async (input, init) =>
        new URL(String(input)).pathname.endsWith("/quote")
          ? new Response(
              JSON.stringify({
                success: true,
                quote: {
                  product_id: QA_PRODUCT_ID,
                  quantity: 1,
                  total: invalid.total,
                  delivery_type: "api_test",
                  stock: 99,
                },
                wallet_balance: invalid.wallet_balance,
              }),
            )
          : validTransport(input, init);
      await assert.rejects(
        () => preflightVenteTest(),
        (e) => e.code === "TEST_COST_UNAVAILABLE",
        "Invalid wallet or unsupported price precision must be rejected before purchase",
      );
    }
    global.fetch = validTransport;
    assert.equal((await preflightVenteTest()).cost, "0.01");
    const result = await sendVenteTest(reference);
    assert.equal(result.state, "DELIVERED");
    assert.equal(result.delivery[0], "SYNTHETIC-DELIVERY");
    assert.equal(posts, 1);
    assert.equal((await lookupVenteTest(reference)).state, "DELIVERED");
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          success: true,
          results: [
            {
              request_status: "completed",
              idempotency_key: reference,
              customer_reference: reference,
              order: { ...order, id: -79 },
            },
          ],
        }),
      );
    assert.equal(
      (await lookupVenteTest(reference)).state,
      "DELIVERED",
      "Valid API-test order identifiers may be negative",
    );
    for (const id of [0, Number.MAX_SAFE_INTEGER + 1, Number.MIN_SAFE_INTEGER - 1]) {
      global.fetch = async () =>
        new Response(JSON.stringify({ success: true, order: { ...order, id } }));
      assert.equal((await sendVenteTest(reference)).state, "UNCERTAIN");
    }
    global.fetch = async () =>
      new Response(
        JSON.stringify({ success: true, order: { ...order, id: -79, delivery_type: "stock" } }),
      );
    assert.equal(
      (await sendVenteTest(reference)).state,
      "UNCERTAIN",
      "QA may not accept a non-test delivery type",
    );
    global.fetch = async () =>
      new Response(JSON.stringify({ success: true, order: { ...order, product_id: 1 } }));
    assert.equal((await sendVenteTest(reference)).state, "UNCERTAIN");
    global.fetch = async () =>
      new Response(JSON.stringify({ success: true, order: { ...order, amount_usd: 2 } }));
    assert.equal((await sendVenteTest(reference)).state, "UNCERTAIN");
    global.fetch = async () => new Response("{}", { status: 404 });
    assert.equal((await lookupVenteTest(reference)).state, "UNCERTAIN");
    global.fetch = async () => {
      throw new Error("SYNTHETIC-VENTE-KEY");
    };
    assert.equal((await sendVenteTest(reference)).state, "UNCERTAIN");
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          success: true,
          results: [
            {
              request_status: "failed_no_charge",
              idempotency_key: reference,
              customer_reference: reference,
              order: null,
            },
          ],
        }),
      );
    assert.equal((await lookupVenteTest(reference)).state, "FAILED_NO_CHARGE");
    for (const mismatch of [
      { quantity: 2 },
      { idempotency_key: "other" },
      { customer_reference: "other" },
      { amount_usd: 0 },
      { amount_usd: "NaN" },
      { status: "CANCELLED" },
      { items: [{ account_data: "one" }, { account_data: "two" }] },
    ]) {
      global.fetch = async () =>
        new Response(JSON.stringify({ success: true, order: { ...order, ...mismatch } }));
      assert.equal((await sendVenteTest(reference)).state, "UNCERTAIN");
    }
    global.fetch = async () =>
      new Response(JSON.stringify({ success: true, order: { ...order, items: [] } }));
    assert.equal((await sendVenteTest(reference)).state, "PENDING");
    for (const status of [400, 401, 403, 404, 409, 429, 500, 503]) {
      global.fetch = async () => new Response("SYNTHETIC-VENTE-KEY", { status });
      assert.deepEqual(await sendVenteTest(reference), { state: "UNCERTAIN", delivery: [] });
    }
    for (const payload of ["not-json", "x".repeat(512001)]) {
      global.fetch = async () => new Response(payload);
      assert.equal((await sendVenteTest(reference)).state, "UNCERTAIN");
    }
    for (const request_status of ["in_progress", "uncertain"]) {
      global.fetch = async () =>
        new Response(
          JSON.stringify({
            success: true,
            results: [
              {
                request_status,
                idempotency_key: reference,
                customer_reference: reference,
                order: null,
              },
            ],
          }),
        );
      assert.equal((await lookupVenteTest(reference)).state, "UNCERTAIN");
    }
    console.log(
      "PASS: bounded API-test transport, exact delivery binding, idempotency and no debit assumptions after ambiguity",
    );
  } finally {
    global.fetch = before;
    delete process.env.VENTEBOT_API_KEY;
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
