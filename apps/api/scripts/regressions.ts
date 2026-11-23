import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inject } from "light-my-request";
import { prisma } from "../src/lib/prisma";
import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";
import {
  deliverOrder,
  uploadReceipt,
  verifyAndDeliver,
  getOrderDetail,
  getPaymentConfig,
} from "../src/modules/orders/orders.service";
import {
  getStats,
  approveReceipt,
  rejectReceipt,
  deletePlan,
} from "../src/modules/admin/admin.service";
import { signupSchema } from "../src/modules/auth/auth.schemas";
import { api, ApiError } from "../../web/lib/api";
import { safeReturnPath } from "../../web/lib/navigation";
import { createBackup, createEncryptedBackup, restoreFromFile } from "../src/lib/backup";
import { env } from "../src/config/env";

async function main() {
  assert.equal(process.env.ISOLATED_REGRESSION_DB, "1", "Use the isolated test runner");
  const priorProduction = env.isProduction;
  const priorMockAllowed = env.ALLOW_MOCK_PAYMENTS_IN_PRODUCTION;
  const priorProvider = await prisma.siteSetting.findUnique({ where: { key: "pay.provider" } });
  try {
    await prisma.siteSetting.upsert({
      where: { key: "pay.provider" },
      create: { key: "pay.provider", value: "mock" },
      update: { value: "mock" },
    });
    env.isProduction = true;
    env.ALLOW_MOCK_PAYMENTS_IN_PRODUCTION = true;
    assert.equal(
      (await getPaymentConfig()).online,
      false,
      "Controlled production mock is not a customer payment method",
    );
    env.isProduction = false;
    assert.equal((await getPaymentConfig()).online, true, "Preserve development mock checkout");
  } finally {
    env.isProduction = priorProduction;
    env.ALLOW_MOCK_PAYMENTS_IN_PRODUCTION = priorMockAllowed;
    if (priorProvider)
      await prisma.siteSetting.update({
        where: { key: "pay.provider" },
        data: { value: priorProvider.value },
      });
    else await prisma.siteSetting.delete({ where: { key: "pay.provider" } });
  }
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
  const transitions = await Promise.all(Array.from({ length: 8 }, () => deliverOrder(online.id, "ref")));
  assert.equal(transitions.filter(Boolean).length, 1, "only the fulfillment winner may send a sale notification");
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
  const mixedCaseFile = { buffer: Buffer.from("89504e470d0a1a0a", "hex"), mimetype: "IMAGE/PNG" };
  await assert.rejects(uploadReceipt(user.id, card.id, { ...file, mimetype: "IMAGE/SVG+XML" }), {
    code: "BAD_FILE_TYPE",
  });
  const receipts = await Promise.all([
    uploadReceipt(user.id, card.id, mixedCaseFile),
    uploadReceipt(user.id, card.id, file),
  ]);
  assert.equal(
    (await prisma.receipt.findUniqueOrThrow({ where: { id: receipts[0].receiptId } })).mimeType,
    "image/png",
  );
  await assert.rejects(uploadReceipt("another-buyer", card.id, mixedCaseFile), { code: "NOT_FOUND" });
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
  const inventoryAdmin = await prisma.user.create({
    data: { name: "Inventory admin fixture", passwordHash: "unused", role: "ADMIN" },
  });
  const tracked = await prisma.product.create({
    data: {
      categoryId: category.id,
      name: "Inventory fixture",
      slug: "stock-dashboard-fixture",
      type: "LICENSE",
      description: "Synthetic",
    },
  });
  const activePlan = await prisma.productPlan.create({
    data: { productId: tracked.id, label: "Internal", price: 10 },
  });
  const supplierPlan = await prisma.productPlan.create({
    data: { productId: tracked.id, label: "Supplier", price: 10, source: "SUPPLIER" },
  });
  const inactivePlan = await prisma.productPlan.create({
    data: { productId: tracked.id, label: "Paused", price: 10, isActive: false },
  });
  await prisma.inventoryItem.createMany({
    data: [
      { planId: activePlan.id, status: "AVAILABLE" },
      { planId: activePlan.id, status: "RESERVED" },
      { planId: activePlan.id, status: "SOLD" },
      { planId: inactivePlan.id, status: "AVAILABLE" },
    ].map((unit) => ({
      ...unit,
      productId: tracked.id,
      type: "LICENSE",
      licenseKey: "INVENTORY-PREVIEW-SECRET",
    })),
  });
  const staffToken = signAccessToken({ sub: inventoryAdmin.id, role: "ADMIN" });
  const stockRead = (url: string, token = staffToken) =>
    inject(app, { method: "GET", url, headers: { authorization: `Bearer ${token}` } });
  assert.equal((await stockRead("/admin/products", forgedAdminRole)).statusCode, 403);
  const listing = await stockRead("/admin/products");
  assert.equal(listing.statusCode, 200);
  assert.match(String(listing.headers["cache-control"]), /private.*no-store/);
  const stock = listing.json().products.find((p: { id: string }) => p.id === tracked.id);
  assert.deepEqual(stock.inventory, { available: 1, reserved: 1, sold: 1, paused: 1 });
  assert.deepEqual(stock.sources, { internal: 1, supplier: 1 });
  const detail = await stockRead(`/admin/products/${tracked.id}`);
  const plans = detail.json().product.plans;
  assert.deepEqual(plans.find((p: { id: string }) => p.id === activePlan.id).inventory, {
    available: 1,
    reserved: 1,
    sold: 1,
  });
  assert.deepEqual(
    plans.find((p: { id: string }) => p.id === supplierPlan.id).supplierAvailability,
    { kind: "unconfirmed" },
  );
  assert(
    !listing.body.includes("INVENTORY-PREVIEW-SECRET") &&
      !detail.body.includes("INVENTORY-PREVIEW-SECRET"),
  );
  const importing = await prisma.productPlan.create({
    data: { productId: tracked.id, label: "Concurrent import", price: 10 },
  });
  let unlock!: () => void;
  let inserted!: () => void;
  const commit = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    inserted = resolve;
  });
  const importingUnit = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM product_plans WHERE id=${importing.id} FOR UPDATE`;
      const unit = await tx.inventoryItem.create({
        data: {
          productId: tracked.id,
          planId: importing.id,
          status: "AVAILABLE",
          type: "LICENSE",
          licenseKey: "CONCURRENT-INVENTORY-FIXTURE",
        },
      });
      inserted();
      await commit;
      return unit.id;
    },
    { timeout: 10000 },
  );
  await ready;
  const deletion = deletePlan(importing.id).then(
    () => "deleted",
    (err: { code?: string }) => err.code,
  );
  let blocked = false;
  try {
    for (let i = 0; i < 45 && !blocked; i++) {
      const [state] = await prisma.$queryRaw<
        { waiting: boolean }[]
      >`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%product_plans%') AS waiting`;
      blocked = state.waiting;
      if (!blocked) await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } finally {
    unlock();
  }
  const unitId = await importingUnit;
  assert(blocked, "Plan deletion entered the planned concurrent lock wait");
  assert.equal(await deletion, "CONFLICT");
  assert.equal(
    (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: unitId } })).planId,
    importing.id,
  );
  console.log("PASS: product stock summary and concurrent import protected from plan deletion");
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
  await assert.rejects(createEncryptedBackup(undefined), /public recipient is required/);
  await assert.rejects(createEncryptedBackup("age1invalid"), /public recipient is required/);
  const encryption = process.env.OOSTA_TEST_AGE === "1";
  const dir = await mkdtemp(path.join(os.tmpdir(), "oosta-backup-regression-"));
  try {
    if (encryption) {
      const identity = path.join(dir, "fixture.key");
      const wrongIdentity = path.join(dir, "wrong.key");
      for (const key of [identity, wrongIdentity])
        execFileSync("age-keygen", ["-o", key], { stdio: "ignore" });
      const recipient = execFileSync("age-keygen", ["-y", identity], { encoding: "utf8" }).trim();
      const sealed = await createEncryptedBackup(recipient);
      try {
        assert.match(sealed.file, /\.sql\.gz\.age$/);
        assert.deepEqual(await readdir(path.dirname(sealed.file)), [path.basename(sealed.file)]);
        const bytes = await readFile(sealed.file);
        assert.match(bytes.subarray(0, 40).toString(), /^age-encryption.org\/v1/);
        assert.notEqual(spawnSync("age", ["-d", "-i", wrongIdentity, sealed.file]).status, 0);
        const tampered = path.join(dir, "tampered.age");
        bytes[bytes.length - 1] ^= 1;
        await writeFile(tampered, bytes);
        assert.notEqual(spawnSync("age", ["-d", "-i", identity, tampered]).status, 0);
        const decrypted = path.join(dir, "decrypted.sql.gz");
        execFileSync("age", ["-d", "-i", identity, "-o", decrypted, sealed.file], {
          stdio: "ignore",
        });
        await prisma.order.update({ where: { id: online.id }, data: { paymentStatus: "PENDING" } });
        await restoreFromFile(decrypted);
      } finally {
        await sealed.cleanup();
      }
      console.log(
        "PASS: encrypted backup rejects wrong key and altered ciphertext, restores the synthetic DB",
      );
    } else {
      const snapshot = await createBackup();
      try {
        await restoreFromFile(snapshot.file);
      } finally {
        await snapshot.cleanup();
      }
    }
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
    await rm(dir, { recursive: true, force: true });
  }
  console.log("PASS: compressed backup restores transactionally and preserves fulfillment history");
}
main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
