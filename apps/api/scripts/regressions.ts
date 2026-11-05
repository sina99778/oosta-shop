import assert from "node:assert/strict";
import { inject } from "light-my-request";
import { prisma } from "../src/lib/prisma";
import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";
import {
  deliverOrder,
  uploadReceipt,
  verifyAndDeliver,
  getOrderDetail,
} from "../src/modules/orders/orders.service";
import { getStats, approveReceipt, rejectReceipt } from "../src/modules/admin/admin.service";
import { signupSchema } from "../src/modules/auth/auth.schemas";
import { api, ApiError } from "../../web/lib/api";
import { safeReturnPath } from "../../web/lib/navigation";
import { createBackup, restoreFromFile } from "../src/lib/backup";

async function main() {
  assert.equal(process.env.ISOLATED_REGRESSION_DB, "1", "Use the isolated test runner");
  const app = createApp();
  const user = await prisma.user.create({
    data: { name: "Regression buyer", passwordHash: "unused" },
  });
  const category = await prisma.category.create({
    data: { name: "Regression", slug: "regression" },
  });
  const product = await prisma.product.create({
    data: {
      name: "Regression",
      slug: "regression",
      description: "Synthetic",
      type: "LICENSE",
      categoryId: category.id,
    },
  });
  const plan = await prisma.productPlan.create({
    data: { productId: product.id, label: "P", price: 100 },
  });
  await prisma.inventoryItem.createMany({
    data: Array.from({ length: 12 }, (_, index) => ({
      productId: product.id,
      planId: plan.id,
      type: "LICENSE" as const,
      licenseKey: `SYNTHETIC-${index}`,
    })),
  });
  const order = async (provider: "MANUAL" | "CARD_TO_CARD" = "MANUAL") =>
    prisma.order.create({
      data: {
        userId: user.id,
        totalAmount: 100,
        paymentProvider: provider,
        items: {
          create: {
            productId: product.id,
            planId: plan.id,
            quantity: 1,
            unitPrice: 100,
            lineTotal: 100,
          },
        },
      },
    });
  const online = await order();
  await Promise.all(Array.from({ length: 8 }, () => deliverOrder(online.id, "ref")));
  assert.equal(
    await prisma.inventoryItem.count({ where: { orderItem: { orderId: online.id } } }),
    1,
  );
  console.log("PASS: eight concurrent deliveries claim exactly one unit");
  await prisma.order.update({
    where: { id: online.id },
    data: { paymentAuthority: "regression-authority" },
  });
  await Promise.all([
    verifyAndDeliver("regression-authority", "NOK"),
    verifyAndDeliver("regression-authority", "OK"),
  ]);
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: online.id } })).paymentStatus,
    "PAID",
  );
  console.log("PASS: cancellation cannot overwrite a completed sale");

  const card = await order("CARD_TO_CARD");
  const file = { buffer: Buffer.from("synthetic receipt"), mimetype: "image/png" };
  const receipts = await Promise.all([
    uploadReceipt(user.id, card.id, file),
    uploadReceipt(user.id, card.id, file),
  ]);
  await Promise.allSettled([
    approveReceipt(receipts[0].receiptId, {}),
    approveReceipt(receipts[1].receiptId, {}),
    uploadReceipt(user.id, card.id, file),
  ]);
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: card.id } })).paymentStatus,
    "PAID",
  );
  assert.equal(await prisma.inventoryItem.count({ where: { orderItem: { orderId: card.id } } }), 1);
  const approved = await prisma.receipt.findFirstOrThrow({
    where: { orderId: card.id, status: "APPROVED" },
  });
  await rejectReceipt(approved.id, {});
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: card.id } })).paymentStatus,
    "REFUNDED",
  );
  assert.equal(
    await prisma.inventoryItem.count({
      where: { orderItem: { orderId: card.id }, status: "SOLD" },
    }),
    1,
  );
  await assert.rejects(deliverOrder(card.id, "retry"));
  const refunded = await getOrderDetail(user.id, card.id);
  assert.equal(refunded.cardToCard, null, "Closed orders must not return payment instructions");
  assert(refunded.items.every((item) => item.credentials.length === 0));
  const forgedAdminRole = signAccessToken({ sub: user.id, role: "ADMIN" });
  const forbidden = await inject(app, {
    method: "GET",
    url: "/admin/stats",
    remoteAddress: "203.0.113.41",
    headers: { authorization: `Bearer ${forgedAdminRole}` },
  });
  assert.equal(forbidden.statusCode, 403, "Current database role must override a stale admin JWT");
  console.log(
    "PASS: refunded orders hide payment details and credentials; stale admin claims cannot elevate access",
  );
  console.log(
    "PASS: concurrent receipt transitions stay paid; disclosed units never re-enter stock",
  );

  const waiting = await order();
  await prisma.order.update({
    where: { id: waiting.id },
    data: {
      paymentStatus: "PAID_PENDING_FULFILLMENT",
      paymentAuthority: "waiting-authority",
      paymentRefId: "confirmed-ref",
    },
  });
  const cancellation = await verifyAndDeliver("waiting-authority", "NOK");
  assert.equal(cancellation.status, "pending");
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: waiting.id } })).paymentStatus,
    "PAID_PENDING_FULFILLMENT",
  );
  const redelivered = await verifyAndDeliver("waiting-authority", "OK");
  assert.equal(redelivered.status, "paid");
  assert.equal(
    await prisma.inventoryItem.count({ where: { orderItem: { orderId: waiting.id } } }),
    1,
  );
  console.log(
    "PASS: confirmed pending payments survive cancellation and can fulfill without a second order",
  );
  const limited = await order("CARD_TO_CARD");
  for (let i = 0; i < 5; i++) await uploadReceipt(user.id, limited.id, file);
  await assert.rejects(
    uploadReceipt(user.id, limited.id, file),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "RECEIPT_LIMIT",
  );
  console.log("PASS: receipt quota enforced");
  const token = signAccessToken({ sub: user.id, role: "USER" });
  const boundary = "regression-boundary";
  const payload = `--${boundary}\r\nContent-Disposition: form-data; name="items[4294967294]"\r\n\r\na\r\n--${boundary}\r\nContent-Disposition: form-data; name="items[key]"\r\n\r\nb\r\n--${boundary}--\r\n`;
  const multipart = await inject(app, {
    method: "POST",
    url: "/orders/unused/receipt",
    remoteAddress: "203.0.113.10",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    payload,
  });
  assert.equal(multipart.statusCode, 400);
  for (let i = 0; i < 11; i++) {
    const result = await inject(app, {
      method: "POST",
      url: "/auth/login",
      remoteAddress: "203.0.113.20",
      headers: { "x-forwarded-for": `198.51.100.${i}`, "content-type": "application/json" },
      payload: "{}",
    });
    assert.equal(result.statusCode, i === 10 ? 429 : 400);
  }
  console.log("PASS: multipart attack rejected and forged forwarding headers cannot reset limiter");
  assert(
    signupSchema.safeParse({ name: "P", phone: "۰۹۱۲۱۲۳۴۵۶۷", password: "Secure123" }).success,
  );
  assert(
    !signupSchema.safeParse({ name: "P", email: "p@example.invalid", password: "a".repeat(73) })
      .success,
  );
  assert.equal(safeReturnPath("//evil.invalid", "/fa/dashboard"), "/fa/dashboard");
  assert.equal(safeReturnPath("/\\evil.invalid", "/fa/dashboard"), "/fa/dashboard");
  assert.equal(
    safeReturnPath("/fa/products/test?plan=123", "/fa/dashboard"),
    "/fa/products/test?plan=123",
  );
  const originalFetch = globalThis.fetch;
  let signal: AbortSignal | null | undefined;
  globalThis.fetch = async (_url, options) => {
    signal = options?.signal;
    return new Response("<html>bad</html>", { status: 200 });
  };
  await assert.rejects(
    api.get("/fixture"),
    (error: unknown) => error instanceof ApiError && error.code === "INVALID_RESPONSE",
  );
  assert(signal);
  globalThis.fetch = originalFetch;
  console.log(
    "PASS: password, Persian phone, return paths, invalid JSON and request timeout contracts",
  );
  const previousRevenue = (await getStats()).revenueTotal;
  await prisma.order.create({
    data: {
      userId: user.id,
      totalAmount: 10,
      currency: "IRT",
      paymentStatus: "PAID",
      paidAt: new Date(),
    },
  });
  const stats = await getStats();
  assert.equal(stats.currency, "IRR");
  assert.equal(stats.revenueTotal, previousRevenue + 100);
  console.log("PASS: dashboard normalizes Toman revenue to Rial before summing");
  const snapshot = await createBackup();
  try {
    await restoreFromFile(snapshot.file);
    assert.equal(
      (await prisma.order.findUniqueOrThrow({ where: { id: online.id } })).paymentStatus,
      "PAID",
    );
    assert.equal(
      await prisma.inventoryItem.count({
        where: { orderItem: { orderId: card.id }, status: "SOLD" },
      }),
      1,
    );
  } finally {
    await snapshot.cleanup();
  }
  console.log("PASS: compressed backup restores transactionally and preserves fulfillment history");
}
main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
