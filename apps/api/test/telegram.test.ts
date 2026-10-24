// Customer bot tests: real handlers fed Telegram-shaped updates through
// handleUpdate, with the outgoing Bot API stubbed (no network). Same Postgres
// setup as the other suites.

import "./env"; // must stay first: sets process.env before the config is parsed
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomInt } from "node:crypto";
import { Telegram } from "telegraf";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import * as orders from "../src/modules/orders/orders.service";
import * as admin from "../src/modules/admin/admin.service";
import * as coupons from "../src/modules/coupons/coupons.service";
import * as tg from "../src/modules/telegram/telegram.service";
import { notify } from "../src/modules/notifications/notifications.service";
import { createCustomerBot, flushOutbox, runBroadcasts } from "../src/customerBot";

const uid = () => randomBytes(5).toString("hex");

// ── Bot API stub ─────────────────────────────────────────────────────
type Call = { method: string; payload: Record<string, unknown> };
let calls: Call[] = [];
let nextMessageId = 1;
const realCallApi = Telegram.prototype.callApi;
before(() => {
  Telegram.prototype.callApi = async function (method: string, payload: object = {}) {
    calls.push({ method, payload: payload as Record<string, unknown> });
    const chatId = (payload as { chat_id?: number }).chat_id ?? 0;
    return { message_id: nextMessageId++, date: 0, chat: { id: chatId, type: "private" } };
  } as typeof Telegram.prototype.callApi;
});
after(async () => {
  Telegram.prototype.callApi = realCallApi;
  await prisma.$disconnect();
});
beforeEach(() => {
  calls = [];
});

const scheduled: Array<{ ms: number; fn: () => void }> = [];
const bot = createCustomerBot("123:TEST", { schedule: (fn, ms) => scheduled.push({ fn, ms }) });
bot.botInfo = {
  id: 1,
  is_bot: true,
  first_name: "Oosta",
  username: "oosta_test_bot",
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
};

let updateId = 1;
const person = (chatId: number) => ({
  id: chatId,
  is_bot: false,
  first_name: "Ali",
  username: "ali",
});

async function send(chatId: number, text: string, chatType = "private") {
  const command = text.startsWith("/") ? text.split(" ")[0].length : 0;
  await bot.handleUpdate({
    update_id: updateId++,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: {
        id: chatId,
        type: chatType,
        first_name: "Ali",
        ...(chatType !== "private" ? { title: "G" } : {}),
      },
      from: person(chatId),
      text,
      ...(command ? { entities: [{ type: "bot_command", offset: 0, length: command }] } : {}),
    },
  } as never);
}

async function tap(chatId: number, data: string) {
  await bot.handleUpdate({
    update_id: updateId++,
    callback_query: {
      id: String(updateId),
      from: person(chatId),
      chat_instance: "x",
      data,
      message: { message_id: 1, date: 0, chat: { id: chatId, type: "private" }, text: "menu" },
    },
  } as never);
}

const replies = () =>
  calls.filter((c) => c.method === "sendMessage").map((c) => String(c.payload.text));
const lastReply = () => replies().at(-1) ?? "";
const noErrors = () =>
  assert.ok(!replies().some((r) => r.includes("مشکلی پیش آمد")), `handler error: ${replies()}`);

// ── Fixtures ─────────────────────────────────────────────────────────
async function makeUser() {
  return prisma.user.create({
    data: {
      name: "Test",
      email: `t-${uid()}@test.local`,
      passwordHash: await hashPassword("pw-12345678"),
    },
  });
}

async function linkedUser() {
  const user = await makeUser();
  const chatId = randomInt(10_000_000, 2_000_000_000);
  const { token } = await tg.createLinkToken(user.id);
  await send(chatId, `/start ${token}`);
  return { user, chatId };
}

async function paidOrder(userId: string, key: string) {
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
  await admin.bulkImportInventory({ planId: plan.id, items: [{ licenseKey: key }] });
  const created = await orders.createOrder(userId, {
    items: [{ planId: plan.id, quantity: 1 }],
    method: "online",
  });
  await orders.verifyAndDeliver(created.payment!.authority, "OK");
  return created.order.id;
}

// ── Tests ────────────────────────────────────────────────────────────
describe("linking", () => {
  test("a link token connects the chat once; reusing it is refused", async () => {
    const user = await makeUser();
    const { token } = await tg.createLinkToken(user.id);
    assert.ok(token.length <= 64, "fits Telegram's start payload");
    await send(5551, `/start ${token}`);
    noErrors();
    assert.match(lastReply(), /وصل شد/);
    const link = await prisma.telegramLink.findUniqueOrThrow({ where: { userId: user.id } });
    assert.equal(link.chatId, 5551n);

    await send(5552, `/start ${token}`);
    assert.match(lastReply(), /معتبر نیست/);
    assert.equal(await prisma.telegramLink.count({ where: { chatId: 5552n } }), 0);
    await prisma.telegramLink.deleteMany({ where: { userId: user.id } });
  });

  test("an unlinked chat gets instructions; group chats are ignored", async () => {
    await send(5553, "🧾 سفارش‌های من");
    assert.match(lastReply(), /هنوز به حساب اوستا وصل نیست/);
    calls = [];
    await send(-100123, "🧾 سفارش‌های من", "group");
    assert.equal(calls.length, 0);
  });

  test("linking again moves the account to the new chat", async () => {
    const { user } = await linkedUser();
    const { token } = await tg.createLinkToken(user.id);
    await send(5554, `/start ${token}`);
    const links = await prisma.telegramLink.findMany({ where: { userId: user.id } });
    assert.deepEqual(
      links.map((l) => l.chatId),
      [5554n],
    );
    await prisma.telegramLink.deleteMany({ where: { userId: user.id } });
  });
});

describe("orders in the bot", () => {
  test("lists orders and reveals credentials, then schedules their removal", async () => {
    const { user, chatId } = await linkedUser();
    const key = `KEY-${uid()}`;
    const orderId = await paidOrder(user.id, key);

    calls = [];
    await send(chatId, "🧾 سفارش‌های من");
    noErrors();
    const list = calls.find((c) => c.method === "sendMessage")!;
    assert.match(JSON.stringify(list.payload.reply_markup), new RegExp(`o:${orderId}`));

    await tap(chatId, `o:${orderId}`);
    assert.match(lastReply(), /تحویل شد/);

    scheduled.length = 0;
    await tap(chatId, `oc:${orderId}`);
    noErrors();
    const reveal = calls.filter((c) => c.method === "sendMessage").at(-1)!;
    assert.equal(reveal.payload.parse_mode, "HTML");
    assert.match(String(reveal.payload.text), new RegExp(`<tg-spoiler>${key}</tg-spoiler>`));
    assert.equal(scheduled.length, 1);
    scheduled[0].fn();
    await new Promise((r) => setImmediate(r));
    assert.ok(
      calls.some((c) => c.method === "deleteMessage"),
      "credentials message is deleted",
    );
  });

  test("a chat cannot open another account's order", async () => {
    const owner = await makeUser();
    const orderId = await paidOrder(owner.id, `KEY-${uid()}`);
    const { chatId } = await linkedUser();
    await tap(chatId, `oc:${orderId}`);
    assert.ok(!replies().some((r) => r.includes("KEY-")), "no credentials leak");
    assert.match(lastReply(), /فقط برای سفارش‌های تحویل‌شده/);
  });
});

describe("account and support in the bot", () => {
  test("open a ticket in two steps, and reply to it", async () => {
    const { user, chatId } = await linkedUser();
    await tap(chatId, "t_new");
    await send(chatId, "Activation help");
    await send(chatId, "How do I activate my key?");
    noErrors();
    const ticket = await prisma.ticket.findFirstOrThrow({
      where: { userId: user.id },
      include: { messages: true },
    });
    assert.equal(ticket.subject, "Activation help");
    await tap(chatId, `tr:${ticket.id}`);
    await send(chatId, "Thanks!");
    assert.equal(await prisma.ticketMessage.count({ where: { ticketId: ticket.id } }), 2);
  });

  test("edit the name; get a password reset link; toggle news; unlink", async () => {
    const { user, chatId } = await linkedUser();
    await tap(chatId, "acc_name");
    await send(chatId, "Sara");
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name, "Sara");

    await tap(chatId, "acc_reset");
    noErrors();
    assert.equal(await prisma.passwordReset.count({ where: { userId: user.id, usedAt: null } }), 1);

    await tap(chatId, "acc_news");
    assert.equal((await tg.linkStatus(user.id))?.newsOptIn, false);

    await tap(chatId, "acc_unlink_yes");
    assert.equal(await tg.isLinked(user.id), false);
  });

  test("a pending step does not leak into the menu", async () => {
    const { user, chatId } = await linkedUser();
    await tap(chatId, "acc_name");
    await send(chatId, "👤 حساب من"); // menu button cancels the pending name edit
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name, "Test");
  });
});

describe("outbox and broadcasts", () => {
  type Sender = Parameters<typeof flushOutbox>[0];
  const fakeTelegram = (sent: string[]) =>
    ({
      sendMessage: async (chatId: string, text: string) => {
        sent.push(`${chatId}:${text}`);
        return {};
      },
    }) as unknown as Sender;

  test("only notices created after linking are sent, each once", async () => {
    const user = await makeUser();
    await notify(prisma, user.id, "TICKET_REPLY", { ticketId: "x", subject: "Old" });
    const { token } = await tg.createLinkToken(user.id);
    const chatId = randomInt(10_000_000, 2_000_000_000);
    await send(chatId, `/start ${token}`);
    await notify(prisma, user.id, "TICKET_REPLY", { ticketId: "y", subject: "New" });

    const sent: string[] = [];
    await flushOutbox(fakeTelegram(sent));
    const mine = sent.filter((s) => s.startsWith(`${chatId}:`));
    assert.equal(mine.length, 1);
    assert.match(mine[0], /New/);
    sent.length = 0;
    await flushOutbox(fakeTelegram(sent));
    assert.equal(sent.filter((s) => s.startsWith(`${chatId}:`)).length, 0);
  });

  test("a broadcast reaches opted-in chats only, and finishes", async () => {
    await prisma.broadcast.updateMany({ where: { doneAt: null }, data: { doneAt: new Date() } });
    const a = await linkedUser();
    const b = await linkedUser();
    await tg.setNewsOptIn(b.user.id, false);
    const audience = await tg.broadcastAudience();
    const created = await tg.createBroadcast("🎉 Yalda sale");
    assert.equal(created.total, audience);

    const sent: string[] = [];
    await runBroadcasts(fakeTelegram(sent), async () => {});
    assert.ok(sent.includes(`${a.chatId}:🎉 Yalda sale`));
    assert.ok(!sent.some((s) => s.startsWith(`${b.chatId}:`)));
    const done = await prisma.broadcast.findUniqueOrThrow({ where: { id: created.id } });
    assert.ok(done.doneAt);
    assert.equal(done.sent, audience);
  });

  test("bot-only coupons need a connected bot", async () => {
    const code = `bot-${uid()}`;
    await coupons.createCoupon({ code, percent: 10, botOnly: true });
    const stranger = await makeUser();
    const { user } = await linkedUser();
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
    const items = [{ planId: plan.id, quantity: 1 }];
    await assert.rejects(orders.quoteOrder(stranger.id, { items, couponCode: code }), {
      code: "COUPON_BOT_ONLY",
    });
    const quote = await orders.quoteOrder(user.id, { items, couponCode: code });
    assert.equal(quote.discount, 100);
  });
});
