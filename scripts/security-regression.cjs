/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
Object.assign(process.env, {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
  JWT_SECRET: "regression-secret-for-local-testing-only",
  PAYMENT_PROVIDER: "zarinpal",
  ZARINPAL_MERCHANT_ID: "11111111-1111-4111-8111-111111111111",
  ZARINPAL_SANDBOX: "false",
  TELEGRAM_ADMIN_ID: "12345",
  TELEGRAM_BOT_TOKEN: "12345:SYNTHETIC",
  BACKUP_INTERVAL_HOURS: "0",
  OPENROUTER_API_KEY: "synthetic-not-a-key",
});
require("tsx/cjs");
global.fetch = async () => {
  throw new Error("Unexpected network call blocked");
};
async function main() {
  for (const patch of [
    { JWT_SECRET: "replace-with-a-long-random-secret" },
    { ZARINPAL_SANDBOX: "true" },
  ]) {
    const result = spawnSync(
      process.execPath,
      ["-r", "tsx/cjs", "-e", "require('./apps/api/src/config/env.ts')"],
      {
        cwd: path.resolve(__dirname, ".."),
        env: { ...process.env, ...patch },
        encoding: "utf8",
        timeout: 10000,
      },
    );
    assert.notEqual(result.status, 0);
  }
  const { Telegraf, Telegram } = require("telegraf");
  let bot;
  Telegraf.prototype.launch = async function () {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    bot = this;
  };
  const calls = [];
  Telegram.prototype.callApi = async function (method, payload) {
    calls.push({ method, payload });
    return { message_id: 1, date: 1, chat: { id: payload.chat_id, type: "private" } };
  };
  const { prisma } = require("../apps/api/src/lib/prisma.ts");
  prisma.order.findMany = async () => {
    throw new Error("Group must not read orders");
  };
  require("../apps/api/src/bot.ts").startBot();
  bot.botInfo = { id: 888, is_bot: true, first_name: "Audit", username: "audit_bot" };
  const from = { id: 12345, is_bot: false, first_name: "Admin" };
  await bot.handleUpdate({
    update_id: 1,
    callback_query: {
      id: "test",
      chat_instance: "test",
      from,
      data: "orders",
      message: { message_id: 1, date: 1, chat: { id: -100123, type: "supergroup", title: "Test" } },
    },
  });
  assert(calls.some((c) => c.method === "sendMessage" && c.payload.text.includes("Unauthorized")));
  for (const [index, caption] of ["do not restore", "restore"].entries()) {
    await bot.handleUpdate({
      update_id: 2 + index,
      message: {
        message_id: 2 + index,
        date: 1,
        from,
        chat: { id: 12345, type: "private" },
        caption,
        document: {
          file_id: "test",
          file_unique_id: "test",
          file_name: "x/../../target.sql",
          file_size: 10,
        },
      },
    });
  }
  assert(!calls.some((c) => c.method === "getFile"));
  assert(calls.some((c) => c.payload.text?.includes("Confirm within")));
  console.log("PASS: production guards, private chat and restore confirmation");
  const settings = new Map();
  prisma.siteSetting.findMany = async () => [...settings].map(([key, value]) => ({ key, value }));
  prisma.siteSetting.upsert = async ({ create }) => {
    settings.set(create.key, create.value);
    return create;
  };
  prisma.$transaction = async (operations) => Promise.all(operations);
  let step = 0;
  global.fetch = async () =>
    Response.json({
      choices: [
        {
          message:
            step++ === 0
              ? {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "write",
                      type: "function",
                      function: {
                        name: "update_payment_settings",
                        arguments: '{"cardHolder":"UNAPPROVED"}',
                      },
                    },
                  ],
                }
              : { role: "assistant", content: "Approval required" },
        },
      ],
    });
  const {
    runAgent,
    pendingAgentActions,
    approveAgentAction,
  } = require("../apps/api/src/lib/agent.ts");
  const approvals = new Set();
  await runAgent("Summarize only; do not change settings", { approvals });
  assert.equal(settings.has("pay.cardHolder"), false);
  const [action] = pendingAgentActions(approvals);
  assert(action.description.includes("UNAPPROVED"));
  await approveAgentAction(action.id);
  assert.equal(settings.get("pay.cardHolder"), "UNAPPROVED");
  await assert.rejects(approveAgentAction(action.id));
  await assert.rejects(
    require("../apps/api/src/lib/gatewayConfig.ts").patchGatewayConfig({ zarinpalSandbox: true }),
  );
  console.log("PASS: model mutations require single-use approval; runtime sandbox blocked");
  const { inject } = require("light-my-request");
  const { createApp } = require("../apps/api/src/app.ts");
  const app = createApp();
  for (const url of ["/auth/me", "/orders", "/tickets", "/admin/stats"]) {
    const response = await inject(app, { method: "GET", url, remoteAddress: "203.0.113.45" });
    assert.equal(response.statusCode, 401);
    assert.match(response.headers["cache-control"] || "", /no-store/, `${url} must not be cached`);
  }
  console.log("PASS: authentication, account, order and admin responses are never cached");
  const failure = new Error("Synthetic API key database outage");
  const originalLookup = prisma.apiKey.findUnique;
  prisma.apiKey.findUnique = async () => {
    throw failure;
  };
  try {
    let result;
    await require("../apps/api/src/middleware/auth.ts").authenticate(
      { headers: { authorization: "Bearer oosta_sk_synthetic" } },
      {},
      (error) => {
        result = error;
      },
    );
    assert.equal(
      result,
      failure,
      "API-key infrastructure failures must not be reported as bad credentials",
    );
  } finally {
    prisma.apiKey.findUnique = originalLookup;
  }
  console.log("PASS: API-key database outages preserve the session error contract");
  await prisma.$disconnect();
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
