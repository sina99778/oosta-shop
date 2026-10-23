// Integration tests for the money/stock paths. They run against a real Postgres
// (DATABASE_URL, migrated) because the guarantees under test — row locks and
// SKIP LOCKED claims — only exist in the database:
//
//   DATABASE_URL=postgresql://… npm test -w @oosta/api
//
// Every test builds its own product/plan/users, so the suite is safe to re-run.

import "./env"; // must stay first: sets process.env before the config is parsed
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import * as orders from "../src/modules/orders/orders.service";
import * as admin from "../src/modules/admin/admin.service";
import * as creds from "../src/lib/credentials";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const uid = () => randomBytes(5).toString("hex");

async function makeUser() {
  return prisma.user.create({
    data: { name: "Test", email: `t-${uid()}@test.local`, passwordHash: "x" },
  });
}

// A product with one plan and `stock` license keys.
async function makePlan(stock: number) {
  const category = await prisma.category.create({ data: { name: "T", slug: `t-${uid()}` } });
  const product = await prisma.product.create({
    data: {
      name: `P ${uid()}`,
      slug: `p-${uid()}`,
      description: "test",
      type: "LICENSE",
      categoryId: category.id,
    },
  });
  const plan = await prisma.productPlan.create({
    data: { productId: product.id, label: "1M", price: 1000 },
  });
  if (stock > 0) {
    await admin.bulkImportInventory({
      planId: plan.id,
      items: Array.from({ length: stock }, (_, i) => ({ licenseKey: `KEY-${uid()}-${i}` })),
    });
  }
  return plan;
}

const countByStatus = async (planId: string, status: string) =>
  prisma.inventoryItem.count({
    where: { planId, status: status as "AVAILABLE" | "RESERVED" | "SOLD" | "REVOKED" },
  });

async function onlineOrder(userId: string, planId: string, quantity = 1) {
  const result = await orders.createOrder(userId, {
    items: [{ planId, quantity }],
    method: "online",
  });
  return { orderId: result.order.id, authority: result.payment!.authority };
}

before(async () => {
  await prisma.$connect();
});
after(async () => {
  await prisma.$disconnect();
});

describe("reservation", () => {
  test("creating an order reserves its units; the last unit cannot be sold twice", async () => {
    const plan = await makePlan(1);
    const [a, b] = [await makeUser(), await makeUser()];
    await onlineOrder(a.id, plan.id);
    assert.equal(await countByStatus(plan.id, "RESERVED"), 1);
    await assert.rejects(onlineOrder(b.id, plan.id), { code: "OUT_OF_STOCK" });
    assert.equal(await countByStatus(plan.id, "RESERVED"), 1, "failed order must hold nothing");
  });

  test("cancelling on the gateway releases the reservation", async () => {
    const plan = await makePlan(1);
    const user = await makeUser();
    const { authority } = await onlineOrder(user.id, plan.id);
    const result = await orders.verifyAndDeliver(authority, "NOK");
    assert.equal(result.status, "failed");
    assert.equal(await countByStatus(plan.id, "AVAILABLE"), 1);
  });

  test("a user cannot hold more than MAX_OPEN_ORDERS_PER_USER unpaid orders", async () => {
    const plan = await makePlan(10);
    const user = await makeUser();
    for (let i = 0; i < 3; i++) await onlineOrder(user.id, plan.id);
    await assert.rejects(onlineOrder(user.id, plan.id), { code: "TOO_MANY_OPEN_ORDERS" });
  });
});

describe("delivery", () => {
  test("concurrent payment callbacks deliver exactly once", async () => {
    const plan = await makePlan(10);
    const user = await makeUser();
    const { orderId, authority } = await onlineOrder(user.id, plan.id, 2);

    const results = await Promise.all(
      Array.from({ length: 6 }, () => orders.verifyAndDeliver(authority, "OK")),
    );
    assert.ok(results.every((r) => r.status === "paid"));
    assert.equal(await countByStatus(plan.id, "SOLD"), 2, "exactly the ordered quantity is sold");
    assert.equal(await countByStatus(plan.id, "AVAILABLE"), 8);

    const detail = await orders.getOrderDetail(user.id, orderId);
    assert.equal(detail.paymentStatus, "PAID");
    assert.equal(detail.items[0].credentials.length, 2);
    assert.match(String(detail.items[0].credentials[0].licenseKey), /^KEY-/, "decrypted for buyer");
  });

  test("concurrent deliverOrder calls: one winner", async () => {
    const plan = await makePlan(5);
    const user = await makeUser();
    const { orderId } = await onlineOrder(user.id, plan.id);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => orders.deliverOrder(orderId, "ref")),
    );
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(await countByStatus(plan.id, "SOLD"), 1);
  });

  test("expired order: stock released, a late payment still delivers from the shelf", async () => {
    const plan = await makePlan(1);
    const user = await makeUser();
    const { orderId, authority } = await onlineOrder(user.id, plan.id);
    await prisma.order.update({ where: { id: orderId }, data: { expiresAt: new Date(0) } });

    await orders.expireStaleOrders();
    const expired = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    assert.equal(expired.paymentStatus, "EXPIRED");
    assert.equal(await countByStatus(plan.id, "AVAILABLE"), 1);

    const result = await orders.verifyAndDeliver(authority, "OK");
    assert.equal(result.status, "paid");
    assert.equal(await countByStatus(plan.id, "SOLD"), 1);
  });

  test("paid while out of stock -> PAID_UNFULFILLED, then fulfilled after restock", async () => {
    const plan = await makePlan(1);
    const [a, b] = [await makeUser(), await makeUser()];
    const first = await onlineOrder(a.id, plan.id);
    await prisma.order.update({ where: { id: first.orderId }, data: { expiresAt: new Date(0) } });
    await orders.expireStaleOrders();
    // Someone else buys the released unit before the late payment lands.
    const second = await onlineOrder(b.id, plan.id);
    await orders.verifyAndDeliver(second.authority, "OK");

    const late = await orders.verifyAndDeliver(first.authority, "OK");
    assert.equal(late.status, "unfulfilled");
    const order = await prisma.order.findUniqueOrThrow({ where: { id: first.orderId } });
    assert.equal(order.paymentStatus, "PAID_UNFULFILLED");
    assert.ok(order.paidAt);

    await assert.rejects(orders.fulfillPaidOrder(first.orderId), { code: "OUT_OF_STOCK" });
    await admin.bulkImportInventory({ planId: plan.id, items: [{ licenseKey: `R-${uid()}` }] });
    const done = await orders.fulfillPaidOrder(first.orderId);
    assert.equal(done.paymentStatus, "PAID");
  });
});

describe("card-to-card", () => {
  async function cardOrderWithReceipt(planStock = 2) {
    const plan = await makePlan(planStock);
    const user = await makeUser();
    const created = await orders.createOrder(user.id, {
      items: [{ planId: plan.id, quantity: 1 }],
      method: "card_to_card",
    });
    const upload = await orders.uploadReceipt(user.id, created.order.id, {
      buffer: PNG,
      mimetype: "image/png",
    });
    return { plan, user, orderId: created.order.id, receiptId: upload.receiptId };
  }

  test("receipt type is sniffed from bytes, not the declared mimetype", async () => {
    const plan = await makePlan(1);
    const user = await makeUser();
    const created = await orders.createOrder(user.id, {
      items: [{ planId: plan.id, quantity: 1 }],
      method: "card_to_card",
    });
    await assert.rejects(
      orders.uploadReceipt(user.id, created.order.id, {
        buffer: Buffer.from("<svg onload=alert(1)>"),
        mimetype: "image/png",
      }),
      { code: "BAD_FILE_TYPE" },
    );
  });

  test("double approval delivers once", async () => {
    const { plan, receiptId } = await cardOrderWithReceipt();
    const results = await Promise.allSettled([
      admin.approveReceipt(receiptId, {}),
      admin.approveReceipt(receiptId, {}),
      admin.approveReceipt(receiptId, {}),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await countByStatus(plan.id, "SOLD"), 1);
  });

  test("undoing an approved sale revokes the revealed units instead of reselling them", async () => {
    const { plan, orderId, receiptId } = await cardOrderWithReceipt(1);
    await admin.approveReceipt(receiptId, {});
    await admin.rejectReceipt(receiptId, {});

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    assert.equal(order.paymentStatus, "REFUNDED");
    assert.equal(await countByStatus(plan.id, "REVOKED"), 1);
    assert.equal(await countByStatus(plan.id, "AVAILABLE"), 0, "revealed key must not be resold");
  });

  test("rejecting an unpaid order releases its reservation", async () => {
    const { plan, orderId, receiptId } = await cardOrderWithReceipt(1);
    assert.equal(await countByStatus(plan.id, "RESERVED"), 1);
    await admin.rejectReceipt(receiptId, {});
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    assert.equal(order.paymentStatus, "REJECTED");
    assert.equal(await countByStatus(plan.id, "AVAILABLE"), 1);
  });
});

describe("credential encryption", () => {
  test("stock is stored sealed and opens to the original value", async () => {
    const plan = await makePlan(1);
    const row = await prisma.inventoryItem.findFirstOrThrow({ where: { planId: plan.id } });
    assert.ok(creds.isEncrypted(row.licenseKey!));
    assert.match(String(creds.openCredential(row.licenseKey)), /^KEY-/);
  });

  test("legacy plaintext rows are sealed at boot", async () => {
    const plan = await makePlan(0);
    const legacy = await prisma.inventoryItem.create({
      data: {
        type: "ACCOUNT",
        productId: plan.productId,
        planId: plan.id,
        accountEmail: "old@x.com",
        accountPassword: "hunter2",
      },
    });
    await creds.encryptLegacyCredentials();
    const sealed = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: legacy.id } });
    assert.ok(creds.isEncrypted(sealed.accountPassword!));
    assert.equal(creds.openCredential(sealed.accountPassword), "hunter2");
    assert.equal(creds.openCredential(sealed.accountEmail), "old@x.com");
  });

  test("the agent's inventory view is masked", async () => {
    const plan = await makePlan(1);
    const list = await admin.listInventory(
      { planId: plan.id, page: 1, pageSize: 10 },
      { mask: true },
    );
    assert.match(String(list.items[0].licenseKey), /^••••/);
  });
});
