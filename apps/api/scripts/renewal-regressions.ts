import assert from "node:assert/strict";
import { inject } from "light-my-request";
import type { PaymentStatus } from "@prisma/client";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { signAccessToken } from "../src/lib/jwt";
import { sendNextOrderEmail } from "../src/lib/mailer";
import { prisma } from "../src/lib/prisma";

const day = 86400000;

async function main() {
  assert.equal(process.env.ISOLATED_REGRESSION_DB, "1");
  assert(!env.TELEGRAM_BOT_TOKEN);
  const app = createApp();
  const buyerEmail = "renewal-buyer@example.invalid";
  const buyer = await prisma.user.create({
    data: {
      name: "Renewal buyer",
      email: buyerEmail,
      verifiedRecoveryEmail: buyerEmail,
      passwordHash: "unused",
    },
  });
  const other = await prisma.user.create({
    data: { name: "Other renewal buyer", passwordHash: "unused" },
  });
  const unverified = await prisma.user.create({
    data: {
      name: "Unverified renewal recipient",
      email: "unverified-renewal@example.invalid",
      passwordHash: "unused",
    },
  });
  const verifiedThenRevokedEmail = "revoked-renewal@example.invalid";
  const verifiedThenRevoked = await prisma.user.create({
    data: {
      name: "Revoked verified renewal recipient",
      email: verifiedThenRevokedEmail,
      verifiedRecoveryEmail: verifiedThenRevokedEmail,
      passwordHash: "unused",
    },
  });
  const category = await prisma.category.create({
    data: { name: "Renewal test", slug: "renewal-test" },
  });
  const product = await prisma.product.create({
    data: {
      name: "Renewal test",
      slug: "renewal-test",
      description: "Test",
      type: "ACCOUNT",
      categoryId: category.id,
    },
  });
  const plan = await prisma.productPlan.create({
    data: { productId: product.id, label: "Monthly test", durationDays: 30, price: 10000 },
  });
  const now = new Date(Date.now() - 7200000);
  const paidAt = new Date(now.getTime() - 29 * day);
  const soldAt = new Date(now.getTime() - 27.5 * day);
  const estimatedEndAt = new Date(soldAt.getTime() + 30 * day).toISOString();
  const snapshot = { label: plan.label, source: "INTERNAL", durationDays: 30, variant: null };
  async function makeOrder({
    userId = buyer.id,
    status = "PAID",
    deliveredAt = soldAt,
    durationDays = snapshot.durationDays as number | null,
    purchased = true,
  }: {
    userId?: string;
    status?: PaymentStatus;
    deliveredAt?: Date | null;
    durationDays?: number | null;
    purchased?: boolean;
  } = {}) {
    return prisma.order.create({
      data: {
        userId,
        paymentStatus: status,
        paidAt,
        createdAt: new Date(paidAt.getTime() - day),
        totalAmount: 10000,
        items: {
          create: {
            productId: product.id,
            planId: plan.id,
            unitPrice: 10000,
            lineTotal: 10000,
            ...(purchased && { planSnapshot: { ...snapshot, durationDays } }),
            fulfilledItems: {
              create: {
                productId: product.id,
                planId: plan.id,
                type: "ACCOUNT",
                status: status === "PAID_PENDING_FULFILLMENT" ? "RESERVED" : "SOLD",
                soldAt: deliveredAt,
                accountPassword: "RENEWAL-PRIVATE-DELIVERY",
              },
            },
          },
        },
      },
      include: { items: true },
    });
  }
  const good = await makeOrder();
  await prisma.orderItem.update({
    where: { id: good.items[0].id },
    data: {
      quantity: 2,
      fulfilledItems: {
        create: {
          productId: product.id,
          planId: plan.id,
          type: "ACCOUNT",
          status: "SOLD",
          soldAt: new Date(soldAt.getTime() - day),
        },
      },
    },
  });
  const legacy = await makeOrder({ deliveredAt: null });
  const unknown = await makeOrder({ purchased: false });
  const perpetual = await makeOrder({ durationDays: null });
  const unpaid = await makeOrder({ status: "PAID_PENDING_FULFILLMENT" });
  const refunded = await makeOrder({ status: "REFUNDED" });
  const qa = await makeOrder();
  await prisma.order.update({
    where: { id: qa.id },
    data: { paymentMetadata: { purpose: "SUPPLIER_QA" } },
  });
  const noEmail = await makeOrder({ userId: other.id });
  const noVerification = await makeOrder({ userId: unverified.id });
  const revokedVerification = await makeOrder({ userId: verifiedThenRevoked.id });
  const soon = await makeOrder({ deliveredAt: new Date(now.getTime() - 26.5 * day) });
  const expired = await makeOrder({ deliveredAt: new Date(now.getTime() - 30.5 * day) });
  const get = (orderId: string, who = buyer) =>
    inject(app, {
      method: "GET",
      url: "/orders/" + orderId,
      headers: { authorization: "Bearer " + signAccessToken({ sub: who.id, role: who.role }) },
    });
  const path = "/orders/" + good.id;
  assert.equal((await inject(app, { method: "GET", url: path })).statusCode, 401);
  assert.equal((await get(good.id, other)).statusCode, 404);
  const detail = await get(good.id);
  assert.equal(detail.statusCode, 200);
  assert.match(String(detail.headers["cache-control"]), /private.*no-store/);
  assert.deepEqual(detail.json().order.items[0].renewal, {
    estimatedEndAt,
    daysRemaining: 3,
    planId: plan.id,
  });
  assert.deepEqual((await get(noVerification.id, unverified)).json().order.items[0].renewal, {
    estimatedEndAt,
    daysRemaining: 3,
    planId: plan.id,
  });
  assert.equal(
    (await get(legacy.id)).json().order.items[0].renewal.estimatedEndAt,
    new Date(paidAt.getTime() + 30 * day).toISOString(),
  );
  for (const order of [unknown, perpetual, unpaid, refunded, qa]) {
    assert.equal((await get(order.id)).json().order.items[0].renewal, null);
  }

  const add = (who = buyer, renewalOrderItemId = good.items[0].id) =>
    inject(app, {
      method: "POST",
      url: "/cart/items",
      payload: { planId: detail.json().order.items[0].renewal.planId, renewalOrderItemId },
      headers: { authorization: "Bearer " + signAccessToken({ sub: who.id, role: who.role }) },
    });
  assert.equal((await add(other)).statusCode, 404);
  assert.equal((await add(buyer, "bad/id")).statusCode, 400);
  assert.equal((await add()).statusCode, 409);
  await prisma.inventoryItem.create({
    data: { productId: product.id, planId: plan.id, type: "ACCOUNT" },
  });
  assert.equal((await add()).statusCode, 201);
  assert.equal((await add()).statusCode, 201);
  assert.equal(await prisma.cartLine.count({ where: { userId: buyer.id, planId: plan.id } }), 1);
  await prisma.user.update({ where: { id: buyer.id }, data: { role: "ADMIN" } });
  assert.equal((await get(good.id)).json().order.items[0].renewal, null);
  assert.equal((await add()).statusCode, 403);
  await prisma.user.update({ where: { id: buyer.id }, data: { role: "USER" } });
  await prisma.productPlan.update({ where: { id: plan.id }, data: { isActive: false } });
  assert.deepEqual((await get(good.id)).json().order.items[0].renewal, {
    estimatedEndAt,
    daysRemaining: 3,
    planId: null,
  });
  const renewals = await import("../src/modules/orders/renewals");
  await renewals.queueRenewalReminders(now);
  assert.equal(await prisma.emailOutbox.count({ where: { orderId: good.id } }), 0);
  await prisma.productPlan.update({
    where: { id: plan.id },
    data: { isActive: true, durationDays: 60 },
  });
  assert.deepEqual((await get(good.id)).json().order.items[0].renewal, {
    estimatedEndAt,
    daysRemaining: 3,
    planId: null,
  });
  assert.equal((await add()).json().error.code, "CART_CHANGED");
  await prisma.productPlan.update({ where: { id: plan.id }, data: { durationDays: 30 } });
  await renewals.queueRenewalReminders(now);
  assert.equal(await prisma.emailOutbox.count({ where: { orderId: noEmail.id } }), 0);
  assert.equal(await prisma.emailOutbox.count({ where: { orderId: noVerification.id } }), 0);
  const otherEmail = "old-renewal-recipient@example.invalid";
  await prisma.user.update({
    where: { id: other.id },
    data: { email: otherEmail, verifiedRecoveryEmail: otherEmail },
  });
  const changedEmail = await makeOrder({ userId: other.id });
  await prisma.order.update({ where: { id: noEmail.id }, data: { paymentStatus: "REFUNDED" } });
  await Promise.all([renewals.queueRenewalReminders(now), renewals.queueRenewalReminders(now)]);
  const tracked = [
    good,
    legacy,
    unknown,
    perpetual,
    unpaid,
    refunded,
    qa,
    noEmail,
    noVerification,
    revokedVerification,
    soon,
    expired,
    changedEmail,
  ];
  const jobs = await prisma.emailOutbox.findMany({
    where: { orderId: { in: tracked.map(({ id }) => id) } },
  });
  assert.deepEqual(
    jobs.map(({ orderId }) => orderId).sort(),
    [good.id, legacy.id, changedEmail.id, revokedVerification.id].sort(),
  );
  await prisma.order.update({ where: { id: legacy.id }, data: { paymentStatus: "REFUNDED" } });
  await prisma.user.update({
    where: { id: other.id },
    data: { email: "new-renewal-recipient@example.invalid" },
  });
  await prisma.user.update({
    where: { id: verifiedThenRevoked.id },
    data: { verifiedRecoveryEmail: null },
  });
  const sent: { to: string; subject: string; text: string }[] = [];
  for (let i = 0; i < jobs.length; i++) {
    await sendNextOrderEmail(async (message) => void sent.push(message));
  }
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, buyer.email);
  assert.match(sent[0].text, /\/fa\/dashboard$/);
  assert(!sent[0].text.includes("RENEWAL-PRIVATE-DELIVERY"));
  assert(!sent[0].text.includes(product.name));
  assert(!sent[0].text.includes(good.id));
  assert(!sent[0].text.includes(plan.id));
  assert.equal(
    (
      await prisma.emailOutbox.findUniqueOrThrow({
        where: { id: jobs.find((job) => job.orderId === good.id)!.id },
      })
    ).status,
    "SENT",
  );
  console.log(
    "[PASS] subscription renewal estimates, owner-only responses, cart checks and deduplicated reminders",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
