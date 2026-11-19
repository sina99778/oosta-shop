import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { inject } from "light-my-request";
import { prisma } from "../src/lib/prisma";
import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";
import { normalizeCatalog } from "../src/modules/suppliers/catalog";
import { sendCapcut } from "../src/modules/suppliers/canboso-capcut";

async function main() {
  assert.equal(process.env.ISOLATED_REGRESSION_DB, "1");
  await prisma.supplierQaAttempt.deleteMany();
  const admin = await prisma.user.create({
    data: { name: "Capcut QA admin", role: "ADMIN", passwordHash: "unused" },
  });
  const buyer = await prisma.user.create({
    data: { name: "Capcut QA buyer", passwordHash: "unused" },
  });
  const other = await prisma.user.create({
    data: { name: "Capcut QA other", passwordHash: "unused" },
  });
  const token = (u: typeof buyer) => signAccessToken({ sub: u.id, role: u.role });
  const app = createApp();
  const product = {
    productId: "6af6f5d60f58e2de02d433a4",
    name: "CAPCUT 7D  7D warranty",
    description: "Synthetic account",
    productType: "account",
    price: { amount: 0.46, currency: "USD" },
    availability: { available: 1 },
  };
  const catalog = { success: true, products: [product] };
  const fingerprint = normalizeCatalog("canboso2", catalog).offers[0].fingerprint;
  const selection = {
    supplier: "canboso2" as const,
    productId: product.productId as "6af6f5d60f58e2de02d433a4",
    name: product.name as "CAPCUT 7D  7D warranty",
    deliveryType: "stock" as const,
    maximumCostUsd: "0.46" as const,
    walletExposureUsd: "0.47" as const,
    fingerprint,
  };
  const authorizationId = randomUUID();
  await prisma.siteSetting.upsert({
    where: { key: "suppliers.qa.authorization" },
    create: { key: "suppliers.qa.authorization", value: "" },
    update: {},
  });
  await prisma.siteSetting.update({
    where: { key: "suppliers.qa.authorization" },
    data: {
      value: JSON.stringify({
        authorizationId,
        enabled: true,
        userId: buyer.id,
        budgetUsd: "0.47",
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        selection,
      }),
    },
  });
  const priorFetch = globalThis.fetch;
  process.env.CANBOSO2_API_KEY = "SYNTHETIC-CAPCUT-KEY";
  let wallet = 2.41,
    posts = 0,
    ambiguous = false;
  globalThis.fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    assert.equal(new URL(String(url)).origin, "https://canboso.com");
    assert.equal(new Headers(init?.headers).get("x-buyer-key"), "SYNTHETIC-CAPCUT-KEY");
    if (path.endsWith("/products")) return Response.json(catalog);
    if (path.endsWith("/balance"))
      return Response.json({ success: true, balance: wallet, walletCurrency: "USD" });
    assert(path.endsWith("/purchase"));
    assert.equal(init?.method, "POST");
    assert.match(new Headers(init?.headers).get("Idempotency-Key") ?? "", /^oosta-qa-/);
    assert.deepEqual(JSON.parse(String(init?.body)), {
      key: "SYNTHETIC-CAPCUT-KEY",
      product_id: product.productId,
      quantity: 1,
    });
    posts++;
    if (ambiguous) throw new Error("Synthetic transport loss");
    wallet = 0.009999;
    return Response.json({
      success: true,
      order: {
        orderCode: "SYNTHETIC-ORDER",
        status: "completed",
        productId: product.productId,
        productName: product.name,
        productType: "account",
        quantity: 1,
        bonusQuantity: 0,
        finalQuantity: 1,
      },
      payment: { amount: 0.46, currency: "USD", balance: wallet },
      delivery: {
        accounts: [
          {
            user: "synthetic@example.invalid",
            password: "SYNTHETIC-PASSWORD",
            otherInfo: "Synthetic instructions",
          },
        ],
      },
    });
  };
  const call = (method: "GET" | "POST", path: string, payload?: unknown, bearer = token(admin)) =>
    inject(app, { method, url: path, payload, headers: { authorization: "Bearer " + bearer } });
  try {
    const requestKey = randomUUID();
    const denied = await call("POST", "/admin/suppliers/qa/attempts", { requestKey }, token(buyer));
    assert.equal(denied.statusCode, 403);
    const exposure = await call("POST", "/admin/suppliers/qa/attempts", { requestKey });
    assert.equal(exposure.statusCode, 409);
    assert.equal(posts, 0);
    wallet = 0.469999;
    const first = await call("POST", "/admin/suppliers/qa/attempts", { requestKey });
    assert.equal(first.statusCode, 200, first.body);
    const attempt = first.json().attempt;
    assert.equal(attempt.state, "DELIVERED");
    assert.equal(attempt.supplier, "canboso2");
    assert(!first.body.includes("SYNTHETIC-PASSWORD"));
    const replay = await call("POST", "/admin/suppliers/qa/attempts", { requestKey });
    assert.equal(replay.json().attempt.orderId, attempt.orderId);
    assert.equal(posts, 1);
    const own = await call("GET", "/orders/" + attempt.orderId, undefined, token(buyer));
    assert.equal(own.statusCode, 200);
    assert.match(own.headers["cache-control"] ?? "", /no-store/);
    assert.equal(own.json().order.items[0].credentials[0].accountPassword, "SYNTHETIC-PASSWORD");
    assert.equal(
      (await call("GET", "/orders/" + attempt.orderId, undefined, token(other))).statusCode,
      404,
    );
    const publicSettings = await inject(app, { method: "GET", url: "/site-settings" });
    assert(!publicSettings.body.includes("SYNTHETIC-PASSWORD"));
    assert(
      await prisma.siteSetting.findUnique({
        where: { key: "suppliers.qa.response." + attempt.id },
      }),
    );
    wallet = 0.469999;
    ambiguous = true;
    const uncertain = await sendCapcut(
      "oosta-qa-" + randomUUID(),
      "0.46",
      selection,
      async () => {},
    );
    assert.equal(uncertain.state, "UNCERTAIN");
    assert.equal(posts, 2);
    console.log(
      "PASS: bounded CapCut purchase, role denial, replay, retained response, private account vault and ambiguous debit",
    );
  } finally {
    globalThis.fetch = priorFetch;
    await prisma.siteSetting.update({
      where: { key: "suppliers.qa.authorization" },
      data: {
        value: JSON.stringify({
          authorizationId,
          enabled: false,
          userId: buyer.id,
          budgetUsd: "0.47",
          expiresAt: new Date().toISOString(),
          selection,
        }),
      },
    });
  }
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
