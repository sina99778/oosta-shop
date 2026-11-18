import assert from "node:assert/strict";
import { Telegram, Telegraf } from "telegraf";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startBot } from "../src/bot";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";
import { inject } from "light-my-request";
import { createApp } from "../src/app";

async function main() {
  assert.equal(process.env.ISOLATED_REGRESSION_DB, "1");
  const dir = await mkdtemp(join(tmpdir(), "oosta-bot-fixture-"));
  const launch = Telegraf.prototype.launch;
  const callApi = Telegram.prototype.callApi;
  const replies: string[] = [];
  const admin = 917000001;
  const started: Telegraf[] = [];
  Telegraf.prototype.launch = async function (this: Telegraf) {
    started.push(this);
  };
  Telegram.prototype.callApi = (async (method, payload) => {
    if (method === "answerCallbackQuery" || method === "sendPhoto" || method === "sendDocument")
      return true;
    assert.equal(method, "sendMessage");
    replies.push(JSON.stringify(payload));
    return {};
  }) as typeof callApi;
  try {
    env.TELEGRAM_BOT_TOKEN = "1001:SYNTHETIC";
    env.TELEGRAM_ADMIN_ID = admin;
    env.BACKUP_INTERVAL_HOURS = 0;
    env.BLU_AUTO_APPROVE_ENABLED = true;
    env.BLU_POLL_STATUS_FILE = join(dir, "status");
    await writeFile(
      env.BLU_POLL_STATUS_FILE,
      `${Math.floor(Date.now() / 1000)} enrollmentRequired\n`,
    );
    startBot();
    const [bot] = started;
    assert(bot);
    bot.botInfo = {
      id: 1001,
      is_bot: true,
      first_name: "Fixture",
      username: "fixture_bot",
      can_join_groups: false,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
    };
    let seq = 0;
    const command = (name: string, sender = admin, group = false) =>
      bot.handleUpdate({
        update_id: ++seq,
        message: {
          message_id: seq,
          date: 1,
          from: { id: sender, is_bot: false, first_name: "Fixture" },
          chat: group
            ? { id: -10, type: "group", title: "Fixture" }
            : { id: sender, type: "private", first_name: "Fixture" },
          text: name,
          entities: name.startsWith("/")
            ? [{ type: "bot_command", offset: 0, length: name.length }]
            : undefined,
        },
      });
    await command("/start");
    assert.match(replies.at(-1) ?? "", /وضعیت بلو/);
    const keyboard = JSON.parse(replies.at(-1)!).reply_markup;
    assert.equal(keyboard.is_persistent, true);
    assert.deepEqual(
      keyboard.keyboard
        .flat()
        .map((button: string | { text: string }) =>
          typeof button === "string" ? button : button.text,
        ),
      ["🧾 سفارش‌های اخیر", "💳 وضعیت بلو", "📥 رسیدهای در انتظار", "⚙️ همه ابزارها"],
    );
    await command("/menu");
    assert.match(replies.at(-1) ?? "", /وضعیت بلو/);
    await command("💳 وضعیت بلو");
    assert.match(replies.at(-1) ?? "", /ورود مجدد به بلو/);
    await command("⚙️ همه ابزارها");
    assert.match(replies.at(-1) ?? "", /"inline_keyboard"/);
    await command("📥 رسیدهای در انتظار");
    assert.match(replies.at(-1) ?? "", /رسید/);
    await command("/blu");
    assert.match(replies.at(-1) ?? "", /ورود مجدد به بلو/);
    assert.match(replies.at(-1) ?? "", /تأیید خودکار.*روشن/);
    const count = replies.length;
    await command("💳 وضعیت بلو", admin + 1);
    await command("💳 وضعیت بلو", admin, true);
    for (const denial of replies.slice(count)) {
      assert.match(denial, /Unauthorized/);
      assert(!denial.includes("ورود مجدد به بلو"));
    }
    assert.equal(replies.length, count + 2);
    const app = createApp();
    const signup = (password = "Synthetic-signup-pass1") =>
      inject(app, {
        method: "POST",
        url: "/auth/signup",
        headers: { "content-type": "application/json" },
        payload: { name: "Synthetic signup", email: "telegram-signup@example.invalid", password },
      });
    const beforeSignup = replies.length;
    const registered = await signup();
    assert.equal(registered.statusCode, 201, registered.body);
    assert.equal(
      replies.length,
      beforeSignup + 1,
      "Successful signup must alert the Telegram admin",
    );
    const alert = JSON.parse(replies.at(-1)!);
    assert.equal(alert.chat_id, admin);
    assert.match(alert.text, /ثبت‌نام جدید/);
    assert(alert.text.includes(registered.json().user.id.slice(-8)));
    assert.doesNotMatch(alert.text, /telegram-signup@example\.invalid|Synthetic-signup-pass1/);
    assert.equal((await signup()).statusCode, 409);
    assert.equal((await signup("short")).statusCode, 400);
    assert.equal(replies.length, beforeSignup + 1, "Failed signups must not send alerts");
    const buyer = await prisma.user.create({
      data: {
        email: "private-order-fixture@example.invalid",
        name: "Fixture",
        passwordHash: "unused",
      },
    });
    const id = randomUUID();
    const plan = await prisma.productPlan.findFirstOrThrow({
      include: { product: { select: { name: true } } },
    });
    await prisma.order.create({
      data: {
        id,
        userId: buyer.id,
        paymentProvider: "CARD_TO_CARD",
        paymentStatus: "PAID_PENDING_FULFILLMENT",
        totalAmount: 10040,
        currency: "IRR",
        items: {
          create: {
            productId: plan.productId,
            planId: plan.id,
            quantity: 1,
            unitPrice: 10040,
            lineTotal: 10040,
          },
        },
      },
    });
    await command("🧾 سفارش‌های اخیر");
    const orders = replies.at(-1) ?? "";
    assert(orders.includes(id.slice(-8)));
    assert.match(orders, /پرداخت شده، در انتظار تحویل/);
    assert.match(orders, /۱٬۰۰۴ تومان/);
    assert(orders.includes(plan.product.name));
    assert(!orders.includes("private-order-fixture@example.invalid"));
    console.log(
      "PASS: Telegram command/menu, collector health, admin private-chat restriction and order display without buyer contacts",
    );
  } finally {
    Telegraf.prototype.launch = launch;
    Telegram.prototype.callApi = callApi;
    await rm(dir, { recursive: true, force: true });
  }
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
