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
  const originalFetch = globalThis.fetch;
  const replies: string[] = [];
  const generatedFiles: { chat_id: number; document: { source: Buffer; filename: string } }[] = [];
  let failImageDelivery = false;
  const admin = 917000001;
  const started: Telegraf[] = [];
  Telegraf.prototype.launch = async function (this: Telegraf) {
    started.push(this);
  };
  Telegram.prototype.callApi = (async (method, payload) => {
    if (method === "sendDocument") {
      const file = payload as unknown as (typeof generatedFiles)[number];
      if (file.document.filename?.startsWith("oosta-image.")) {
        if (failImageDelivery) throw new Error("Fixture Telegram upload failed");
        generatedFiles.push(file);
        return { message_id: 700, date: 1, chat: { id: admin, type: "private" } };
      }
      return true;
    }
    if (
      method === "answerCallbackQuery" ||
      method === "sendPhoto" ||
      method === "sendChatAction" ||
      method === "deleteMessage"
    )
      return true;
    assert.equal(method, "sendMessage");
    replies.push(JSON.stringify(payload));
    return { message_id: 100 };
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
    const command = (name: string, sender = admin, group = false, replyTo?: number) =>
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
          reply_to_message: replyTo
            ? {
                message_id: replyTo,
                date: 1,
                chat: { id: sender, type: "private", first_name: "Fixture" },
              }
            : undefined,
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
    const { id: memberId, createdAt } = registered.json().user;
    const memberCode = memberId.slice(-8);
    const localTime = new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Asia/Tehran",
    }).format(new Date(createdAt));
    assert.equal(
      alert.text,
      [
        "👤 ثبت‌نام جدید در اوستا",
        "",
        "شناسهٔ عضو: " + memberCode,
        "روش ثبت‌نام: ایمیل",
        "ایمیل: telegram-signup@example.invalid",
        "شمارهٔ موبایل: ثبت نشده",
        "زمان ثبت‌نام (تهران): " + localTime,
      ].join("\n"),
    );
    assert(
      alert.entities.some(
        ({ type, offset, length }: { type: string; offset: number; length: number }) =>
          type === "code" && alert.text.slice(offset, offset + length) === memberCode,
      ),
    );
    assert(alert.entities.some(({ type }: { type: string }) => type === "bold"));
    assert.doesNotMatch(alert.text, /Synthetic signup|Synthetic-signup-pass1/);
    assert(!alert.text.includes(memberId));
    assert.equal((await signup()).statusCode, 409);
    assert.equal((await signup("short")).statusCode, 400);
    assert.equal(replies.length, beforeSignup + 1, "Failed signups must not send alerts");
    const phone = "09120000017";
    const phoneSignup = await inject(app, {
      method: "POST",
      url: "/auth/signup",
      payload: { name: "Synthetic <name>", phone, password: "Synthetic-signup-pass1" },
    });
    assert.equal(phoneSignup.statusCode, 201, phoneSignup.body);
    assert.equal(replies.length, beforeSignup + 2);
    const phoneAlert = JSON.parse(replies.at(-1)!);
    assert.equal(phoneAlert.chat_id, admin);
    assert.match(phoneAlert.text, /روش ثبت‌نام: شمارهٔ موبایل/);
    assert(phoneAlert.text.includes("شمارهٔ موبایل: " + phone));
    assert(phoneAlert.text.includes("ایمیل: ثبت نشده"));
    assert(!phoneAlert.text.includes("Synthetic"));
    const bothEmail = "telegram-both@example.invalid";
    const bothPhone = "09120000018";
    const bothSignup = await inject(app, {
      method: "POST",
      url: "/auth/signup",
      payload: {
        name: "Synthetic",
        email: bothEmail,
        phone: bothPhone,
        password: "Synthetic-signup-pass1",
      },
    });
    assert.equal(bothSignup.statusCode, 201, bothSignup.body);
    assert.equal(replies.length, beforeSignup + 3);
    const bothAlert = JSON.parse(replies.at(-1)!);
    assert.equal(bothAlert.chat_id, admin);
    assert.match(bothAlert.text, /روش ثبت‌نام: ایمیل و شمارهٔ موبایل/);
    assert(bothAlert.text.includes("ایمیل: " + bothEmail));
    assert(bothAlert.text.includes("شمارهٔ موبایل: " + bothPhone));
    assert(!bothAlert.text.includes(bothSignup.json().token));
    assert(!bothAlert.text.includes("Synthetic"));
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
    env.OPENROUTER_API_KEY = "fixture-openrouter";
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lPkAAAAASUVORK5CYII=",
      "base64",
    );
    let imageRequests = 0;
    let generationFails = false;
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), "https://openrouter.ai/api/v1/chat/completions");
      const request = JSON.parse(String(init?.body));
      if (request.modalities) {
        imageRequests++;
        return generationFails
          ? new Response("Fixture rejected", { status: 400 })
          : Response.json({
              choices: [
                {
                  message: {
                    images: [
                      { image_url: { url: `data:image/png;base64,${png.toString("base64")}` } },
                    ],
                  },
                },
              ],
            });
      }
      if (request.messages[1].content.startsWith("Use this image")) {
        assert.match(request.messages[1].content, /A photo is attached/);
        return Response.json({ choices: [{ message: { content: "Image available" } }] });
      }
      return Response.json({
        choices: [
          {
            message:
              request.messages.at(-1).role === "tool"
                ? { content: "Waiting for approval" }
                : {
                    tool_calls: [
                      {
                        id: "fixture",
                        type: "function",
                        function: {
                          name: "generate_image",
                          arguments: JSON.stringify({ prompt: "Fixture image" }),
                        },
                      },
                    ],
                  },
          },
        ],
      });
    };
    const latestApproval = () => {
      const callback = JSON.parse(replies.at(-1)!).reply_markup.inline_keyboard[0][0].callback_data;
      assert.match(callback, /^agent_confirm_[a-f0-9]{24}$/);
      return callback as string;
    };
    const approve = (callback: string, sender = admin, group = false) =>
      bot.handleUpdate({
        update_id: ++seq,
        callback_query: {
          id: String(seq),
          chat_instance: "fixture",
          data: callback,
          from: { id: sender, is_bot: false, first_name: "Fixture" },
          message: {
            message_id: seq,
            date: 1,
            chat: group
              ? { id: -10, type: "group", title: "Fixture" }
              : { id: sender, type: "private", first_name: "Fixture" },
          },
        },
      });
    await command("Make a fixture image");
    const callback = latestApproval();
    await approve(callback, admin + 1);
    await approve(callback, admin, true);
    assert.equal(imageRequests, 0);
    failImageDelivery = true;
    await approve(callback);
    assert.equal(imageRequests, 1);
    assert.equal(generatedFiles.length, 0);
    assert.match(replies.at(-1) ?? "", /\/lastimage/);
    await approve(callback);
    assert.equal(imageRequests, 1);
    failImageDelivery = false;
    await command("/lastimage", admin + 1);
    assert.equal(generatedFiles.length, 0);
    await command("/lastimage");
    assert.equal(imageRequests, 1);
    assert.equal(generatedFiles.length, 1);
    assert.equal(generatedFiles[0].chat_id, admin);
    assert.deepEqual(generatedFiles[0].document.source, png);
    await command("Use this image", admin, false, 700);
    assert.match(replies.at(-1) ?? "", /Image available/);

    generationFails = true;
    await command("Make another fixture image");
    const failing = latestApproval();
    await approve(failing);
    await approve(failing);
    assert.equal(imageRequests, 2);
    assert.equal(generatedFiles.length, 1);
    console.log(
      "PASS: Telegram command/menu, collector health, admin private-chat restriction and order display without buyer contacts",
    );
  } finally {
    globalThis.fetch = originalFetch;
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
