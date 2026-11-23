import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { inject } from "light-my-request";
import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";
import { prisma } from "../src/lib/prisma";
import { sweepStockAlerts } from "../src/modules/auth/stock-alerts";
import { variantKey, variantSchema } from "../src/modules/suppliers/variant";

async function main() {
  assert.equal(process.env.ISOLATED_REGRESSION_DB, "1");
  const app = createApp({ sendPasswordResetEmail: async () => {} });
  const email = `${randomUUID()}@example.invalid`;
  const user = await prisma.user.create({
    data: { name: "Watch buyer", email, verifiedRecoveryEmail: email, passwordHash: "unused" },
  });
  const other = await prisma.user.create({
    data: { name: "Other watch buyer", passwordHash: "unused" },
  });
  const admin = await prisma.user.create({
    data: { name: "Watch admin", passwordHash: "unused", role: "ADMIN" },
  });
  const category = await prisma.category.create({
    data: { name: "Watch test", slug: randomUUID() },
  });
  const product = await prisma.product.create({
    data: {
      name: "Restock fixture",
      slug: randomUUID(),
      description: "Fixture",
      categoryId: category.id,
      type: "ACCOUNT",
    },
  });
  const plan = await prisma.productPlan.create({
    data: { productId: product.id, label: "Fixture", price: 1000 },
  });
  const route = `/auth/stock-alerts/${plan.id}`;
  function call(
    method: "GET" | "POST" | "DELETE" | "PATCH",
    url: string,
    actor?: typeof user,
    body?: object,
  ) {
    return inject(app, {
      method,
      url,
      headers: {
        "content-type": "application/json",
        ...(actor
          ? { authorization: "Bearer " + signAccessToken({ sub: actor.id, role: actor.role }) }
          : {}),
      },
      ...(body ? { payload: JSON.stringify(body) } : {}),
    });
  }
  assert.equal((await call("GET", route)).statusCode, 401);
  assert.equal((await call("POST", route, admin, { locale: "en" })).statusCode, 403);
  assert.equal((await call("POST", route, user, { locale: "bad" })).statusCode, 400);
  const results = await Promise.all([1, 2].map(() => call("POST", route, user, { locale: "en" })));
  assert(results.every((res) => res.statusCode === 200));
  assert.equal(await prisma.stockAlert.count({ where: { userId: user.id } }), 1);
  assert.deepEqual((await call("GET", route, other)).json(), { active: false });
  assert.equal((await call("DELETE", route, other)).statusCode, 204);
  assert.deepEqual((await call("GET", route, user)).json(), { active: true });
  await sweepStockAlerts(null);
  assert.equal(await prisma.userNotification.count({ where: { userId: user.id } }), 0);
  await prisma.inventoryItem.create({
    data: { productId: product.id, planId: plan.id, status: "AVAILABLE", type: "ACCOUNT" },
  });
  await Promise.all([sweepStockAlerts(null), sweepStockAlerts(null)]);
  assert.deepEqual((await call("GET", "/auth/notifications/count", user)).json(), { count: 1 });
  const list = await call("GET", "/auth/notifications", user);
  assert.match(String(list.headers["cache-control"]), /private.*no-store/);
  const note = list.json().notifications[0];
  assert.equal(note.href, `/en/products/${product.slug}?plan=${plan.id}`);
  assert.equal(
    await prisma.emailOutbox.count({ where: { orderId: note.id, kind: "STOCK_AVAILABLE" } }),
    1,
  );
  assert.equal(
    (await call("PATCH", "/auth/notifications/read", other, { id: note.id })).statusCode,
    404,
  );
  assert.equal(
    (await call("PATCH", "/auth/notifications/read", user, { id: note.id })).statusCode,
    204,
  );
  assert.deepEqual((await call("GET", "/auth/notifications/count", user)).json(), { count: 0 });
  assert.equal((await call("POST", route, user, { locale: "en" })).statusCode, 409);
  const variant = variantSchema.parse({
    plan: "Fixture",
    access: "PERSONAL",
    fulfillment: "ACCOUNT",
    delivery: "MANUAL",
    warranty: { kind: "NONE" },
    region: "GLOBAL",
    quota: "MONTHLY",
  });
  const fingerprint = "c".repeat(64);
  const supplier = "ventebot";
  const snapshotKey = "suppliers.catalog." + supplier;
  const previous = await prisma.siteSetting.findUnique({ where: { key: snapshotKey } });
  const supplierPlan = await prisma.productPlan.create({
    data: {
      productId: product.id,
      label: "Supplier fixture",
      price: 1000,
      source: "SUPPLIER",
      durationDays: 30,
      variant,
      supplierMappings: [
        { supplier, externalId: "watch-fixture", fingerprint, variantKey: variantKey(variant, 30) },
      ],
    },
  });
  const supplierRoute = `/auth/stock-alerts/${supplierPlan.id}`;
  async function snapshot(priceStock: number | null, age: number) {
    const value = JSON.stringify({
      supplier,
      fetchedAt: new Date(Date.now() - age).toISOString(),
      rejected: 0,
      offers: [
        {
          supplier,
          externalId: "watch-fixture",
          name: "Fixture",
          description: "Fixture",
          cost: "1",
          currency: "USD",
          stock: priceStock,
          onRequest: priceStock === null,
          delivery: "MANUAL",
          warranty: { kind: "NONE", days: 0 },
          flags: [],
          fingerprint,
        },
      ],
    });
    await prisma.siteSetting.upsert({
      where: { key: snapshotKey },
      create: { key: snapshotKey, value },
      update: { value },
    });
  }
  try {
    await snapshot(null, 0);
    assert.equal((await call("POST", supplierRoute, other, { locale: "fa" })).statusCode, 409);
    await snapshot(5, 60_001);
    assert.equal((await call("POST", supplierRoute, other, { locale: "fa" })).statusCode, 200);
    await sweepStockAlerts(null);
    assert.deepEqual((await call("GET", "/auth/notifications/count", other)).json(), { count: 0 });
    await snapshot(5, 0);
    await sweepStockAlerts(null);
    const supplierNote = (await call("GET", "/auth/notifications", other)).json().notifications[0];
    assert.equal(supplierNote.href, `/fa/products/${product.slug}?plan=${supplierPlan.id}`);
    assert.equal(await prisma.emailOutbox.count({ where: { orderId: supplierNote.id } }), 0);
    assert.equal((await call("PATCH", "/auth/notifications/read", other, {})).statusCode, 204);
    assert.deepEqual((await call("GET", "/auth/notifications/count", other)).json(), { count: 0 });
  } finally {
    if (previous)
      await prisma.siteSetting.update({
        where: { key: snapshotKey },
        data: { value: previous.value },
      });
    else await prisma.siteSetting.deleteMany({ where: { key: snapshotKey } });
    await prisma.emailOutbox.deleteMany({ where: { to: email } });
  }
  console.log(
    "PASS: private stock subscriptions, concurrent restock delivery, one email and owner-only inbox",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
