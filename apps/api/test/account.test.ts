// Integration tests for in-site notifications, back-in-stock watches and
// password recovery. Same setup as orders.test.ts (real Postgres via DATABASE_URL).

import "./env"; // must stay first: sets process.env before the config is parsed
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { signAccessToken, verifyAccessToken } from "../src/lib/jwt";
import { hashPassword, verifyPassword } from "../src/lib/password";
import * as orders from "../src/modules/orders/orders.service";
import * as admin from "../src/modules/admin/admin.service";
import * as auth from "../src/modules/auth/auth.service";
import * as notifications from "../src/modules/notifications/notifications.service";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const uid = () => randomBytes(5).toString("hex");

async function makeUser(password = "x") {
  return prisma.user.create({
    data: {
      name: "Test",
      email: `t-${uid()}@test.local`,
      passwordHash: password === "x" ? "x" : await hashPassword(password),
    },
  });
}

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
  if (stock > 0) await restock(plan.id, stock);
  return plan;
}

const restock = (planId: string, n: number) =>
  admin.bulkImportInventory({
    planId,
    items: Array.from({ length: n }, (_, i) => ({ licenseKey: `KEY-${uid()}-${i}` })),
  });

const kinds = async (userId: string) =>
  (await prisma.notification.findMany({ where: { userId } })).map((n) => n.kind);

after(async () => {
  await prisma.$disconnect();
});

describe("notifications", () => {
  test("an approved card-to-card receipt notifies the buyer; an online payment does not", async () => {
    const plan = await makePlan(5);
    const buyer = await makeUser();
    const card = await orders.createOrder(buyer.id, {
      items: [{ planId: plan.id, quantity: 1 }],
      method: "card_to_card",
    });
    const { receiptId } = await orders.uploadReceipt(buyer.id, card.order.id, {
      buffer: PNG,
      mimetype: "image/png",
    });
    await admin.approveReceipt(receiptId, {});
    assert.deepEqual(await kinds(buyer.id), ["ORDER_DELIVERED"]);

    const online = await orders.createOrder(buyer.id, {
      items: [{ planId: plan.id, quantity: 1 }],
      method: "online",
    });
    await orders.verifyAndDeliver(online.payment!.authority, "OK");
    assert.equal((await kinds(buyer.id)).length, 1, "the buyer was on the page for this one");
  });

  test("a staff reply notifies the ticket owner, and read-all clears the count", async () => {
    const owner = await makeUser();
    const staff = await makeUser();
    const ticket = await prisma.ticket.create({ data: { userId: owner.id, subject: "Help" } });
    await admin.replyTicket(ticket.id, staff.id, { body: "On it" });
    let list = await notifications.listNotifications(owner.id);
    assert.equal(list.unread, 1);
    assert.deepEqual(list.items[0].data, { ticketId: ticket.id, subject: "Help" });
    await notifications.markAllRead(owner.id);
    list = await notifications.listNotifications(owner.id);
    assert.equal(list.unread, 0);
  });

  test("restocking notifies each watcher once and drops their watch", async () => {
    const plan = await makePlan(0);
    const [a, b] = [await makeUser(), await makeUser()];
    await notifications.watchProduct(a.id, plan.productId);
    await notifications.watchProduct(a.id, plan.productId); // idempotent
    await notifications.watchProduct(b.id, plan.productId);
    const result = await restock(plan.id, 2);
    assert.equal(result.notified, 2);
    assert.deepEqual(await kinds(a.id), ["BACK_IN_STOCK"]);
    assert.equal(await notifications.isWatching(a.id, plan.productId), false);
    assert.equal((await restock(plan.id, 1)).notified, 0, "no second notice without a new watch");
  });
});

describe("password recovery", () => {
  test("a reset link works once, then sessions issued before it are cut off", async () => {
    const user = await makeUser("old-password-1");
    const { token } = await auth.createPasswordReset(user.id);
    await auth.resetPassword({ token, newPassword: "new-password-1" });
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.ok(await verifyPassword("new-password-1", saved.passwordHash));
    await assert.rejects(auth.resetPassword({ token, newPassword: "again-again" }), {
      code: "RESET_INVALID",
    });
    assert.ok(saved.sessionsValidAfter, "every session is ended");
  });

  test("a newer link replaces the old one; expired links are refused", async () => {
    const user = await makeUser();
    const first = await auth.createPasswordReset(user.id);
    const second = await auth.createPasswordReset(user.id);
    await assert.rejects(auth.resetPassword({ token: first.token, newPassword: "whatever-1" }), {
      code: "RESET_INVALID",
    });
    await prisma.passwordReset.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await assert.rejects(auth.resetPassword({ token: second.token, newPassword: "whatever-1" }), {
      code: "RESET_INVALID",
    });
  });

  test("changing the password returns a fresh session that survives the cut-off", async () => {
    const user = await makeUser("current-pass-1");
    const old = signAccessToken({ sub: user.id, role: user.role });
    await new Promise((r) => setTimeout(r, 1100)); // into the next JWT second
    const fresh = await auth.changePassword(user.id, {
      currentPassword: "current-pass-1",
      newPassword: "changed-pass-1",
    });
    const { sessionsValidAfter } = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const cutoff = sessionsValidAfter!.getTime();
    assert.ok(verifyAccessToken(old).iat * 1000 < cutoff, "the old session is cut off");
    assert.ok(verifyAccessToken(fresh).iat * 1000 >= cutoff, "the new one is not");
  });
});
