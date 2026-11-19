/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
require("tsx/cjs");
const {
  preflightVenteTest,
  sendVenteTest,
  lookupVenteTest,
} = require("../apps/api/src/modules/suppliers/vente-purchase.ts");
const selection = {
  productId: 54,
  deliveryType: "stock",
  name: "iLovePdf Premium 1Yr",
  maximumCostUsd: "0.4",
};
const ref = "oosta-qa-00000000-0000-4000-8000-000000000002";
async function main() {
  const before = global.fetch;
  process.env.VENTEBOT_API_KEY = "SYNTHETIC-STOCK-KEY";
  const order = {
    id: 100,
    status: "COMPLETED",
    delivery_type: "stock",
    product_id: 54,
    quantity: 1,
    amount_usd: 0.4,
    idempotency_key: ref,
    customer_reference: ref,
    items: [{ account_data: "SYNTHETIC-ACCOUNT-DELIVERY" }],
  };
  let calls = 0;
  try {
    global.fetch = async (input, init) => {
      calls++;
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/me"))
        return new Response(JSON.stringify({ success: true, wallet_balance: 1.57 }));
      if (path.endsWith("/products"))
        return new Response(
          JSON.stringify({
            success: true,
            products: [
              { id: 54, name: "iLovePdf Premium 1Yr", api_test: false, delivery_type: "stock" },
            ],
          }),
        );
      if (path.endsWith("/quote"))
        return new Response(
          JSON.stringify({
            success: true,
            quote: { product_id: 54, quantity: 1, total: 0.4, delivery_type: "stock", stock: 1 },
            wallet_balance: 1.57,
          }),
        );
      if (init.method === "POST") {
        assert.equal(JSON.parse(init.body).product_id, 54);
        return new Response(JSON.stringify({ success: true, order }));
      }
      return new Response(
        JSON.stringify({
          success: true,
          results: [
            { request_status: "completed", idempotency_key: ref, customer_reference: ref, order },
          ],
        }),
      );
    };
    await assert.rejects(preflightVenteTest(selection), { code: "QA_PRICE_LOCK_UNAVAILABLE" });
    await assert.rejects(sendVenteTest(ref, "0.4", selection), {
      code: "QA_PRICE_LOCK_UNAVAILABLE",
    });
    assert.equal(calls, 0, "Stock spending must be rejected before any network request");
    assert.equal((await lookupVenteTest(ref, "0.4", selection)).state, "DELIVERED");
    const approved = { ...selection, walletExposureUsd: "1.57" };
    assert.equal((await preflightVenteTest(approved)).cost, "0.4");
    assert.equal((await sendVenteTest(ref, "0.4", approved)).state, "DELIVERED");
    const validFetch = global.fetch;
    for (const invalid of ["NaN", "Infinity", 1.58]) {
      let purchasePosts = 0;
      global.fetch = async (input, init) => {
        const path = new URL(String(input)).pathname;
        if (path.endsWith("/me"))
          return new Response(JSON.stringify({ success: true, wallet_balance: invalid }));
        if (path.endsWith("/orders") && init?.method === "POST") purchasePosts++;
        return validFetch(input, init);
      };
      await assert.rejects(sendVenteTest(ref, "0.4", approved), {
        code: "QA_WALLET_EXPOSURE_CHANGED",
      });
      assert.equal(purchasePosts, 0);
    }
    global.fetch = validFetch;
    for (const altered of [
      { ...order, id: -100 },
      { ...order, amount_usd: 0.41 },
      { ...order, product_id: 55 },
    ]) {
      global.fetch = async () =>
        new Response(
          JSON.stringify({
            success: true,
            results: [
              {
                request_status: "completed",
                idempotency_key: ref,
                customer_reference: ref,
                order: altered,
              },
            ],
          }),
        );
      assert.equal((await lookupVenteTest(ref, "0.4", selection)).state, "UNCERTAIN");
    }
    console.log(
      "PASS: unbounded stock purchases are blocked; read-only lookup binds product, cost and identity",
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
