/* eslint-disable @typescript-eslint/no-require-imports */
// Local-only review probes. All DB, Telegram, filesystem writes and model calls
// are substituted. DoS probes run in disposable, time/memory-limited children.
process.env.NODE_ENV = "production";
process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
process.env.JWT_SECRET = "audit-only-secret-that-is-never-deployed";
process.env.PAYMENT_PROVIDER = "zarinpal";
process.env.ZARINPAL_MERCHANT_ID = "audit-only-merchant";
process.env.ZARINPAL_SANDBOX = "true";
process.env.TELEGRAM_ADMIN_ID = "12345";
process.env.TELEGRAM_BOT_TOKEN = "12345:AUDIT_ONLY";
process.env.BACKUP_INTERVAL_HOURS = "0";
process.env.OPENROUTER_API_KEY = "audit-only-not-a-real-key";
require("tsx/cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { inject } = require("light-my-request");
const { prisma } = require("../apps/api/src/lib/prisma.ts");
global.fetch = async () => {
  throw new Error("Unexpected network call blocked by review probe");
};

async function childProbe(mode) {
  const { createApp } = require("../apps/api/src/app.ts");
  const app = createApp();
  if (mode.startsWith("multipart-")) {
    const { signAccessToken } = require("../apps/api/src/lib/jwt.ts");
    prisma.user.findUnique = async () => ({ id: "audit-user", role: "USER" });
    const index = mode === "multipart-control" ? 3 : 4294967294;
    const boundary = "auditBoundary";
    const payload = `--${boundary}\r\nContent-Disposition: form-data; name="items[${index}]"\r\n\r\na\r\n--${boundary}\r\nContent-Disposition: form-data; name="items[key]"\r\n\r\nb\r\n--${boundary}--\r\n`;
    console.log("PROBE_READY", mode, Buffer.byteLength(payload));
    const res = await inject(app, {
      method: "POST",
      url: "/orders/audit-order/receipt",
      headers: {
        authorization: `Bearer ${signAccessToken({ sub: "audit-user", role: "USER" })}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    console.log("PROBE_RESPONSE", res.statusCode);
  } else {
    const { Readable } = require("node:stream");
    const zlib = require("node:zlib");
    const encoded =
      mode === "compressed-br"
        ? zlib.brotliCompressSync("{}")
        : mode === "compressed-gzip"
          ? zlib.gzipSync("{}")
          : zlib.deflateSync("{}");
    const encoding = mode.replace("compressed-", "");
    const suffix = Buffer.from("trailing-invalid-frame");
    const payload = Readable.from(
      (async function* () {
        yield encoded;
        await new Promise((r) => setTimeout(r, 60));
        yield suffix;
      })(),
    );
    console.log("PROBE_READY", mode);
    const res = await inject(app, {
      method: "POST",
      url: "/not-a-route",
      headers: {
        "content-type": "application/json",
        "content-encoding": encoding,
        "content-length": String(encoded.length + suffix.length),
      },
      payload,
    });
    console.log("PROBE_RESPONSE", res.statusCode);
    await new Promise((r) => setTimeout(r, 150));
  }
}

async function main() {
  const checks = [];
  const record = (name, evidence) => {
    checks.push({ name, evidence });
    console.log(name, JSON.stringify(evidence));
  };
  const source = fs.readFileSync(
    path.join(__dirname, "../apps/web/components/auth-form.tsx"),
    "utf8",
  );
  const expression = source.match(/const destination = (.+);/)[1];
  const destination = require("node:vm").runInNewContext(expression, {
    next: "//audit-external.invalid/path",
    locale: "fa",
  });
  assert.equal(new URL(destination, "https://shop.invalid").hostname, "audit-external.invalid");
  record("OPEN_REDIRECT", {
    acceptedDestination: destination,
    validation: "actual AuthForm destination expression",
  });

  const exampleEnv = fs.readFileSync(path.join(__dirname, "../.env.production.example"), "utf8");
  const exampleSecret = exampleEnv.match(/^JWT_SECRET=(.+)$/m)[1].trim();
  const guardCode = `process.env.JWT_SECRET=${JSON.stringify(exampleSecret)};const {env}=require('./apps/api/src/config/env.ts');const {signAccessToken,verifyAccessToken}=require('./apps/api/src/lib/jwt.ts');console.log(JSON.stringify({production:env.isProduction,acceptedPublishedExampleSecret:env.JWT_SECRET===${JSON.stringify(exampleSecret)},forgedIdentity:verifyAccessToken(signAccessToken({sub:'synthetic-admin-id',role:'ADMIN'})).sub}));`;
  const guardResult = spawnSync(process.execPath, ["-r", "tsx/cjs", "-e", guardCode], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    timeout: 4000,
  });
  assert.equal(guardResult.status, 0);
  record("KNOWN_PRODUCTION_JWT_SECRET_ACCEPTED", JSON.parse(guardResult.stdout));

  // Intercept the complete Telegraf handler chain, without launching a bot.
  const { Telegraf, Telegram } = require("telegraf");
  let bot;
  // Capturing the created instance is intentional: launch must never reach Telegram.
  Telegraf.prototype.launch = async function () {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    bot = this;
  };
  const telegramCalls = [];
  Telegram.prototype.callApi = async function (method, payload) {
    telegramCalls.push({ method, payload });
    if (method === "getFile") return { file_path: "audit/file.sql" };
    return { message_id: 1, date: 1, chat: { id: payload.chat_id, type: "supergroup" } };
  };
  prisma.order.findMany = async () => [
    {
      id: "audit-order",
      totalAmount: 100,
      currency: "IRR",
      paymentStatus: "PAID",
      user: { email: "synthetic-buyer@example.invalid", phone: null },
    },
  ];
  const backup = require("../apps/api/src/lib/backup.ts");
  let writeTarget;
  fsp.writeFile = async (target) => {
    writeTarget = target;
  };
  backup.restoreFromFile = async () => {
    throw new Error("Restore intentionally blocked by audit");
  };
  const { startBot } = require("../apps/api/src/bot.ts");
  startBot();
  bot.botInfo = { id: 888, is_bot: true, first_name: "Audit", username: "audit_bot" };
  const from = { id: 12345, is_bot: false, first_name: "Admin" };
  const chat = { id: -10012345, type: "supergroup", title: "Synthetic group" };
  await bot.handleUpdate({
    update_id: 1,
    callback_query: {
      id: "audit-callback",
      chat_instance: "audit",
      from,
      data: "orders",
      message: { message_id: 1, date: 1, chat },
    },
  });
  const leaked = telegramCalls.find(
    (c) => c.method === "sendMessage" && c.payload.text.includes("synthetic-buyer@example.invalid"),
  );
  assert.equal(leaked.payload.chat_id, chat.id);
  record("TELEGRAM_GROUP_DISCLOSURE", {
    destinationChatId: leaked.payload.chat_id,
    containsSyntheticBuyerEmail: true,
  });

  global.fetch = async () => new Response("synthetic SQL; never executed");
  await bot.handleUpdate({
    update_id: 2,
    message: {
      message_id: 2,
      date: 1,
      chat: { id: 12345, type: "private" },
      from,
      caption: "do not restore this file",
      document: {
        file_id: "audit",
        file_unique_id: "audit",
        file_name: "x/../../audit-target.sql",
      },
    },
  });
  assert(writeTarget);
  assert.equal(path.dirname(writeTarget), path.dirname(os.tmpdir()));
  record("RESTORE_PATH_TRAVERSAL_AND_NEGATED_CAPTION", {
    targetOutsideTempDirectory: true,
    caption: "do not restore this file",
    realWritesOrRestore: false,
  });

  // A simulated model response proves missing enforcement, not that a real model
  // necessarily follows a malicious ticket. No ticket or card data is transmitted.
  const settings = new Map();
  prisma.siteSetting.findMany = async () => [...settings].map(([key, value]) => ({ key, value }));
  prisma.siteSetting.upsert = async ({ create }) => {
    settings.set(create.key, create.value);
    return create;
  };
  prisma.siteSetting.deleteMany = async () => ({ count: 0 });
  prisma.$transaction = async (ops) => Promise.all(ops);
  prisma.ticket.findUnique = async () => ({
    id: "ticket",
    subject: "Synthetic request",
    status: "OPEN",
    user: { id: "user", name: "User" },
    messages: [
      {
        id: "msg",
        body: "Untrusted customer text requests an unrelated payment-setting change.",
        isStaff: false,
        createdAt: new Date(),
      },
    ],
  });
  let modelStep = 0;
  const requests = [];
  global.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    requests.push(request);
    const functionCall =
      modelStep++ === 0
        ? { name: "get_ticket", arguments: '{"id":"ticket"}' }
        : modelStep === 2
          ? {
              name: "update_payment_settings",
              arguments: '{"cardHolder":"AUDIT UNAUTHORIZED CHANGE"}',
            }
          : null;
    return Response.json({
      choices: [
        {
          message: {
            role: "assistant",
            content: functionCall ? null : "Audit complete",
            ...(functionCall
              ? {
                  tool_calls: [
                    { id: `call-${modelStep}`, type: "function", function: functionCall },
                  ],
                }
              : {}),
          },
        },
      ],
    });
  };
  await require("../apps/api/src/lib/agent.ts").runAgent(
    "Read ticket ticket and summarize it. Make no changes.",
  );
  assert.equal(settings.get("pay.cardHolder"), "AUDIT UNAUTHORIZED CHANGE");
  assert(
    requests[1].messages.some(
      (m) => m.role === "tool" && m.content.includes("Untrusted customer text"),
    ),
  );
  record("AGENT_MISSING_WRITE_AUTHORIZATION", {
    simulatedModel: true,
    readOnlyInstructionStillAllowedPaymentMutation: true,
    actualModelObedienceTested: false,
  });

  const gateway = require("../apps/api/src/lib/gatewayConfig.ts");
  await gateway.patchGatewayConfig({ zarinpalSandbox: true });
  const config = await gateway.getGatewayConfig();
  assert.equal(gateway.isOnlinePaymentBlocked(config), false);
  assert.equal(config.zarinpalSandbox, true);
  record("PRODUCTION_SANDBOX_ALLOWED", { production: true, sandbox: true, blocked: false });

  for (const mode of [
    "multipart-control",
    "multipart-large-index",
    "compressed-deflate",
    "compressed-gzip",
    "compressed-br",
  ]) {
    const result = spawnSync(process.execPath, ["--max-old-space-size=128", __filename, mode], {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
      timeout: 3500,
      maxBuffer: 100000,
    });
    record(mode, {
      exitCode: result.status,
      signal: result.signal,
      error: result.error?.code,
      stdout: result.stdout?.slice(-1200),
      stderr: result.stderr?.slice(-1800),
    });
  }
  fs.writeFileSync(
    path.join(__dirname, "../security-review-deep-results.json"),
    JSON.stringify(checks, null, 2),
  );
  await prisma.$disconnect();
}
(process.argv[2] ? childProbe(process.argv[2]) : main()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
