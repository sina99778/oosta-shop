/* eslint-disable @typescript-eslint/no-require-imports */
// Windows-only, isolated PostgreSQL concurrency reproduction. Never uses .env.
// Binds a temporary cluster to 127.0.0.1:55483; stops/removes it in finally.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const bin = path.join(process.env.LOCALAPPDATA, "Programs/pgsql/bin");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oosta-security-review-pg-"));
const data = path.join(dir, "data");
const dbUrl = "postgresql://audit@127.0.0.1:55483/postgres?schema=public";
let started = false;
let prisma;
function run(executable, args, extraEnv) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000,
    env: { ...process.env, ...extraEnv },
    maxBuffer: 1000000,
  });
  if (result.status !== 0)
    throw new Error(
      `${path.basename(executable)} failed: ${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`,
    );
  return result.stdout;
}
async function main() {
  try {
    run(path.join(bin, "initdb.exe"), [
      "-D",
      data,
      "-U",
      "audit",
      "-A",
      "trust",
      "--encoding=UTF8",
      "--locale=C",
    ]);
    run(path.join(bin, "pg_ctl.exe"), [
      "-D",
      data,
      "-l",
      path.join(dir, "server.log"),
      "-o",
      "-h 127.0.0.1 -p 55483",
      "-w",
      "start",
    ]);
    started = true;
    run(
      process.execPath,
      [
        path.join(root, "node_modules/prisma/build/index.js"),
        "migrate",
        "deploy",
        "--schema",
        path.join(root, "apps/api/prisma/schema.prisma"),
      ],
      { DATABASE_URL: dbUrl },
    );
    process.env.DATABASE_URL = dbUrl;
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = "isolated-audit-only-secret";
    process.env.PAYMENT_PROVIDER = "mock";
    process.env.TELEGRAM_BOT_TOKEN = "";
    require("tsx/cjs");
    ({ prisma } = require("../apps/api/src/lib/prisma.ts"));
    const { deliverOrder } = require("../apps/api/src/modules/orders/orders.service.ts");
    const user = await prisma.user.create({
      data: { name: "Synthetic audit buyer", passwordHash: "not-a-real-password" },
    });
    const category = await prisma.category.create({ data: { name: "audit", slug: "audit" } });
    const product = await prisma.product.create({
      data: {
        name: "audit",
        slug: "audit",
        description: "audit",
        type: "LICENSE",
        categoryId: category.id,
      },
    });
    const plan = await prisma.productPlan.create({
      data: { productId: product.id, label: "audit", price: 100 },
    });
    await prisma.inventoryItem.createMany({
      data: [1, 2].map((i) => ({
        productId: product.id,
        planId: plan.id,
        type: "LICENSE",
        licenseKey: `SYNTHETIC-AUDIT-${i}`,
      })),
    });
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        totalAmount: 100,
        paymentProvider: "MANUAL",
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
    const originalTransaction = prisma.$transaction.bind(prisma);
    let arrived = 0;
    let release;
    const barrier = new Promise((r) => {
      release = r;
    });
    // Only scheduling is controlled: all reads, writes, inventory locks, commits
    // and constraints execute against the real isolated PostgreSQL instance.
    prisma.$transaction = (fn) =>
      originalTransaction(
        async (tx) =>
          fn({
            order: {
              findUnique: async (args) => {
                const result = await tx.order.findUnique(args);
                if (++arrived === 2) release();
                await barrier;
                return result;
              },
              update: (args) => tx.order.update(args),
            },
            inventoryItem: { updateMany: (args) => tx.inventoryItem.updateMany(args) },
            $queryRaw: (...args) => tx.$queryRaw(...args),
          }),
        { timeout: 10000 },
      );
    await Promise.all([
      deliverOrder(order.id, "synthetic-ref"),
      deliverOrder(order.id, "synthetic-ref"),
    ]);
    const result = await prisma.order.findUnique({
      where: { id: order.id },
      include: { items: { include: { fulfilledItems: true } } },
    });
    const evidence = {
      database: "isolated PostgreSQL 16.4",
      controlledScheduling: true,
      expectedQuantity: result.items[0].quantity,
      deliveredUnits: result.items[0].fulfilledItems.length,
      paymentStatus: result.paymentStatus,
      uniqueDeliveredUnits: new Set(result.items[0].fulfilledItems.map((x) => x.id)).size,
    };
    assert.equal(evidence.expectedQuantity, 1);
    assert.equal(evidence.deliveredUnits, 2);
    assert.equal(evidence.uniqueDeliveredUnits, 2);
    fs.writeFileSync(
      path.join(root, "security-review-pg-results.json"),
      JSON.stringify(evidence, null, 2),
    );
    console.log(JSON.stringify(evidence));
  } finally {
    if (prisma) await prisma.$disconnect();
    if (started) run(path.join(bin, "pg_ctl.exe"), ["-D", data, "-m", "fast", "-w", "stop"]);
    const resolved = path.resolve(dir);
    const relative = path.relative(path.resolve(os.tmpdir()), resolved);
    if (
      !relative.startsWith("..") &&
      !path.isAbsolute(relative) &&
      path.basename(resolved).startsWith("oosta-security-review-pg-")
    ) {
      fs.rmSync(resolved, { recursive: true, force: true });
      console.log("Isolated PostgreSQL cluster stopped and removed.");
    }
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
