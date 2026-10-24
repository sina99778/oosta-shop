// Customer Telegram bot (Telegraf) — separate from the admin bot in bot.ts.
// Disabled unless CUSTOMER_BOT_TOKEN is set.
//
// A buyer connects their site account with a single-use deep link made on the
// site (t.me/<bot>?start=<token>). Then, from the chat, they can: list orders
// and reveal delivered credentials, edit their name, open and answer support
// tickets, get a password reset link, and receive site notifications plus shop
// news/offers. Every lookup goes through the same user-scoped services as the
// web app, so a chat only ever sees its own account.

import { Markup, Telegraf, TelegramError } from "telegraf";
import type { Context } from "telegraf";
import { message } from "telegraf/filters";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";
import { getOrderDetail, listOrders } from "./modules/orders/orders.service";
import {
  addMyMessage,
  createTicket,
  getMyTicket,
  listMyTickets,
} from "./modules/tickets/tickets.service";
import { createPasswordReset, updateProfile } from "./modules/auth/auth.service";
import { updateProfileSchema } from "./modules/auth/auth.schemas";
import { createTicketSchema, ticketMessageSchema } from "./modules/tickets/tickets.schemas";
import * as tg from "./modules/telegram/telegram.service";

// ── Copy ─────────────────────────────────────────────────────────────

const BTN = {
  orders: "🧾 سفارش‌های من",
  support: "🎫 پشتیبانی",
  account: "👤 حساب من",
  offers: "🎁 پیشنهادهای ویژه",
} as const;

const STATUS: Record<string, string> = {
  PAID: "✅ تحویل شد",
  PENDING: "⏳ در انتظار پرداخت",
  PENDING_REVIEW: "🔎 در حال بررسی رسید",
  PAID_UNFULFILLED: "📦 پرداخت شد، در انتظار موجودی",
  FAILED: "❌ ناموفق",
  REJECTED: "❌ رسید رد شد",
  EXPIRED: "⌛ منقضی شد",
  REFUNDED: "↩️ بازگشت وجه",
};

const TICKET_STATUS: Record<string, string> = {
  OPEN: "🟡 باز",
  ANSWERED: "🟢 پاسخ داده شد",
  CLOSED: "⚪ بسته",
};

// Delivered credentials are removed from the chat after this long.
const CREDENTIALS_TTL_MS = 10 * 60 * 1000;
const OUTBOX_MS = 10_000;
const BROADCAST_MS = 15_000;

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = (n: number) => new Intl.NumberFormat("fa-IR").format(n);
const shortId = (id: string) => id.slice(-8).toUpperCase();
const date = (d: Date) =>
  new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(d);

// Same rule as the web app: IRR is stored in Rial and shown in Toman.
function price(amount: number, currency: string) {
  return currency === "IRR" ? `${num(amount / 10)} تومان` : `${num(amount)} ${currency}`;
}

const site = (path: string) => `${env.WEB_BASE_URL}/fa${path}`;
// Telegram refuses URL buttons that point at http://localhost, so dev builds
// show the address as text instead.
const canLink = () => env.WEB_BASE_URL.startsWith("https://");

function urlButton(text: string, path: string) {
  return canLink() ? [Markup.button.url(text, site(path))] : [];
}

type Row = ReturnType<typeof urlButton> | ReturnType<typeof Markup.button.callback>[];
// Inline keyboard without empty rows (Telegram rejects them).
function inline(rows: Row[]) {
  return Markup.inlineKeyboard(rows.filter((r) => r.length > 0));
}

const mainKeyboard = () =>
  Markup.keyboard([
    [BTN.orders, BTN.support],
    [BTN.account, BTN.offers],
  ]).resize();

// ── Per-chat conversation state (what the next text message means) ──

type Pending =
  | { kind: "name" }
  | { kind: "ticketSubject" }
  | { kind: "ticketBody"; subject: string }
  | { kind: "reply"; ticketId: string };

export type CustomerBotOptions = {
  // Injectable for tests (no real timers there).
  schedule?: (fn: () => void, ms: number) => void;
};

export function createCustomerBot(token: string, options: CustomerBotOptions = {}) {
  const bot = new Telegraf(token, {
    ...(env.CUSTOMER_BOT_API_ROOT ? { telegram: { apiRoot: env.CUSTOMER_BOT_API_ROOT } } : {}),
  });
  const pending = new Map<number, Pending>();
  const schedule = options.schedule ?? ((fn, ms) => void setTimeout(fn, ms).unref());

  type Linked = NonNullable<Awaited<ReturnType<typeof tg.linkForChat>>>;
  async function requireLink(ctx: Context): Promise<Linked | null> {
    const link = ctx.chat ? await tg.linkForChat(ctx.chat.id) : null;
    if (link) {
      if (link.blockedAt) await tg.markChatBlocked(link.chatId, false);
      return link;
    }
    await ctx.reply(
      [
        "این گفتگو هنوز به حساب اوستا وصل نیست.",
        "",
        "۱. در سایت وارد شوید و به «حساب کاربری» بروید.",
        "۲. «اتصال به ربات» را بزنید و لینک را باز کنید.",
        ...(canLink() ? [] : ["", site("/dashboard/account")]),
      ].join("\n"),
      inline([urlButton("🔗 رفتن به حساب کاربری", "/dashboard/account")]),
    );
    return null;
  }

  // Only private chats: a group would expose the account to everyone in it.
  bot.use(async (ctx, next) => {
    if (ctx.chat && ctx.chat.type !== "private") return;
    return next();
  });

  bot.catch(async (error, ctx) => {
    console.error("[customer-bot] handler error", error);
    await ctx.reply("مشکلی پیش آمد؛ لطفاً دوباره امتحان کنید.").catch(() => {});
  });

  // ── /start (with or without a link token) ──────────────────────────
  bot.start(async (ctx) => {
    pending.delete(ctx.chat.id);
    const payload = ctx.payload?.trim();
    if (payload) {
      try {
        const user = await tg.linkChat(payload, {
          id: ctx.chat.id,
          username: ctx.from?.username,
          firstName: ctx.from?.first_name,
        });
        await ctx.reply(
          [
            `✅ حساب «${user.name}» به این گفتگو وصل شد.`,
            "",
            "از این به بعد خبر تحویل سفارش‌ها و پاسخ پشتیبانی همین‌جا می‌رسد.",
            "از دکمه‌های پایین صفحه استفاده کنید.",
          ].join("\n"),
          mainKeyboard(),
        );
      } catch {
        await ctx.reply(
          "این لینک اتصال معتبر نیست یا مهلتش (۳۰ دقیقه) تمام شده. از «حساب کاربری» در سایت یک لینک تازه بگیرید.",
        );
      }
      return;
    }
    const link = await requireLink(ctx);
    if (link) await ctx.reply(`سلام ${link.user.name} 👋`, mainKeyboard());
  });

  bot.help(async (ctx) => {
    await ctx.reply(
      [
        `${BTN.orders} — وضعیت سفارش‌ها و اطلاعات تحویل`,
        `${BTN.support} — تیکت تازه یا پاسخ به تیکت`,
        `${BTN.account} — نام، بازیابی رمز، خبرها، قطع اتصال`,
        `${BTN.offers} — کدهای تخفیف مخصوص اعضای ربات`,
      ].join("\n"),
      mainKeyboard(),
    );
  });

  // ── Orders ─────────────────────────────────────────────────────────
  async function showOrders(ctx: Context) {
    const link = await requireLink(ctx);
    if (!link) return;
    const orders = (await listOrders(link.userId)).slice(0, 10);
    if (orders.length === 0) {
      await ctx.reply(
        "هنوز سفارشی ثبت نکرده‌اید.",
        inline([urlButton("🛍 دیدن محصولات", "/products")]),
      );
      return;
    }
    await ctx.reply(
      "سفارش‌های اخیر شما (برای جزئیات روی هرکدام بزنید):",
      Markup.inlineKeyboard(
        orders.map((o) => [
          Markup.button.callback(
            `#${shortId(o.id)} · ${STATUS[o.paymentStatus] ?? o.paymentStatus} · ${price(o.totalAmount, o.currency)}`,
            `o:${o.id}`,
          ),
        ]),
      ),
    );
  }

  bot.action(/^o:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const link = await requireLink(ctx);
    if (!link) return;
    const order = await getOrderDetail(link.userId, ctx.match[1]).catch(() => null);
    if (!order) {
      await ctx.reply("این سفارش پیدا نشد.");
      return;
    }
    const lines = [
      `🧾 سفارش #${shortId(order.id)}`,
      `وضعیت: ${STATUS[order.paymentStatus] ?? order.paymentStatus}`,
      `تاریخ: ${date(order.createdAt)}`,
      "",
      ...order.items.map((i) => `• ${i.product.name} — ${i.plan.label} × ${num(i.quantity)}`),
      "",
      ...(order.discountAmount > 0
        ? [`تخفیف: ${price(order.discountAmount, order.currency)}`]
        : []),
      `مبلغ: ${price(order.totalAmount, order.currency)}`,
    ];
    const buttons = [];
    if (order.paymentStatus === "PAID") {
      buttons.push([Markup.button.callback("🔐 نمایش اطلاعات تحویل", `oc:${order.id}`)]);
    }
    if (order.cardToCard) {
      buttons.push(urlButton("💳 ادامهٔ پرداخت کارت‌به‌کارت", `/checkout/card/${order.id}`));
    }
    buttons.push(urlButton("🌐 دیدن در سایت", `/dashboard/orders/${order.id}`));
    await ctx.reply(lines.join("\n"), inline(buttons));
  });

  bot.action(/^oc:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const link = await requireLink(ctx);
    if (!link) return;
    const order = await getOrderDetail(link.userId, ctx.match[1]).catch(() => null);
    if (!order || order.paymentStatus !== "PAID") {
      await ctx.reply("اطلاعات تحویل فقط برای سفارش‌های تحویل‌شده نمایش داده می‌شود.");
      return;
    }
    const blocks = order.items.flatMap((item) =>
      item.credentials.map((c) => {
        const rows = [
          c.accountEmail && `ایمیل: <code>${escape(c.accountEmail)}</code>`,
          c.accountPassword && `رمز: <tg-spoiler>${escape(c.accountPassword)}</tg-spoiler>`,
          c.licenseKey && `لایسنس: <tg-spoiler>${escape(c.licenseKey)}</tg-spoiler>`,
          c.giftCardCode && `کد: <tg-spoiler>${escape(c.giftCardCode)}</tg-spoiler>`,
        ].filter(Boolean);
        return `<b>${escape(item.product.name)}</b> — ${escape(item.plan.label)}\n${rows.join("\n")}`;
      }),
    );
    if (blocks.length === 0) {
      await ctx.reply("اطلاعات تحویلی برای این سفارش ثبت نشده؛ به پشتیبانی پیام دهید.");
      return;
    }
    const sent = await ctx.reply(
      [
        `🔐 اطلاعات تحویل سفارش #${shortId(order.id)}`,
        "",
        blocks.join("\n\n"),
        "",
        "⚠️ این پیام تا ۱۰ دقیقهٔ دیگر از گفتگو پاک می‌شود. اطلاعات را جای امنی نگه دارید و برای کسی نفرستید.",
      ].join("\n"),
      { parse_mode: "HTML" },
    );
    schedule(() => {
      void ctx.telegram.deleteMessage(sent.chat.id, sent.message_id).catch(() => {});
    }, CREDENTIALS_TTL_MS);
  });

  // ── Support tickets ────────────────────────────────────────────────
  async function showTickets(ctx: Context) {
    const link = await requireLink(ctx);
    if (!link) return;
    const tickets = (await listMyTickets(link.userId)).slice(0, 8);
    await ctx.reply(
      tickets.length ? "تیکت‌های شما:" : "هنوز تیکتی ندارید.",
      Markup.inlineKeyboard([
        ...tickets.map((t) => [
          Markup.button.callback(
            `${TICKET_STATUS[t.status] ?? t.status} · ${t.subject}`,
            `t:${t.id}`,
          ),
        ]),
        [Markup.button.callback("➕ تیکت تازه", "t_new")],
      ]),
    );
  }

  bot.action("t_new", async (ctx) => {
    await ctx.answerCbQuery();
    if (!(await requireLink(ctx))) return;
    pending.set(ctx.chat!.id, { kind: "ticketSubject" });
    await ctx.reply("موضوع تیکت را در یک خط بنویسید:", cancelKeyboard());
  });

  bot.action(/^t:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const link = await requireLink(ctx);
    if (!link) return;
    const ticket = await getMyTicket(link.userId, ctx.match[1]).catch(() => null);
    if (!ticket) {
      await ctx.reply("این تیکت پیدا نشد.");
      return;
    }
    const recent = ticket.messages.slice(-5).map((m) => {
      const who = m.isStaff ? "🛟 پشتیبانی" : "🙂 شما";
      return `${who} · ${date(new Date(m.createdAt))}\n${m.body}`;
    });
    await ctx.reply(
      [`🎫 ${ticket.subject}`, TICKET_STATUS[ticket.status] ?? ticket.status, "", ...recent].join(
        "\n\n",
      ),
      Markup.inlineKeyboard([[Markup.button.callback("✍️ پاسخ", `tr:${ticket.id}`)]]),
    );
  });

  bot.action(/^tr:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!(await requireLink(ctx))) return;
    pending.set(ctx.chat!.id, { kind: "reply", ticketId: ctx.match[1] });
    await ctx.reply("پاسخ خود را بنویسید:", cancelKeyboard());
  });

  // ── Account ────────────────────────────────────────────────────────
  async function showAccount(ctx: Context) {
    const link = await requireLink(ctx);
    if (!link) return;
    const { user } = link;
    await ctx.reply(
      [
        "👤 حساب شما",
        `نام: ${user.name}`,
        ...(user.email ? [`ایمیل: ${user.email}`] : []),
        ...(user.phone ? [`موبایل: ${user.phone}`] : []),
        `وصل از: ${date(link.linkedAt)}`,
        `خبرها و پیشنهادها: ${link.newsOptIn ? "روشن" : "خاموش"}`,
      ].join("\n"),
      Markup.inlineKeyboard([
        [Markup.button.callback("✏️ تغییر نام", "acc_name")],
        [Markup.button.callback("🔑 بازیابی رمز عبور سایت", "acc_reset")],
        [
          Markup.button.callback(
            link.newsOptIn ? "🔕 خاموش کردن خبرها" : "🔔 روشن کردن خبرها",
            "acc_news",
          ),
        ],
        [Markup.button.callback("🔌 قطع اتصال از این گفتگو", "acc_unlink")],
      ]),
    );
  }

  bot.action("acc_name", async (ctx) => {
    await ctx.answerCbQuery();
    if (!(await requireLink(ctx))) return;
    pending.set(ctx.chat!.id, { kind: "name" });
    await ctx.reply("نام تازه را بنویسید:", cancelKeyboard());
  });

  // A connected chat is proof of ownership, so it can get a reset link directly.
  bot.action("acc_reset", async (ctx) => {
    await ctx.answerCbQuery();
    const link = await requireLink(ctx);
    if (!link) return;
    const { token } = await createPasswordReset(link.userId);
    const url = site(`/reset-password/${token}`);
    await ctx.reply(
      [
        "🔑 لینک تغییر رمز عبور سایت:",
        ...(canLink() ? [] : [url]),
        "",
        "یک بار کار می‌کند و تا ۲۴ ساعت معتبر است. بعد از تغییر رمز، از همهٔ دستگاه‌ها خارج می‌شوید.",
        "این لینک را برای هیچ‌کس نفرستید.",
      ].join("\n"),
      inline([canLink() ? [Markup.button.url("تغییر رمز", url)] : []]),
    );
  });

  bot.action("acc_news", async (ctx) => {
    await ctx.answerCbQuery();
    const link = await requireLink(ctx);
    if (!link) return;
    await tg.setNewsOptIn(link.userId, !link.newsOptIn);
    await ctx.reply(
      link.newsOptIn
        ? "🔕 خبرها و پیشنهادها خاموش شد. خبر سفارش‌ها و پشتیبانی همچنان می‌رسد."
        : "🔔 خبرها و پیشنهادهای ویژه روشن شد.",
    );
  });

  bot.action("acc_unlink", async (ctx) => {
    await ctx.answerCbQuery();
    if (!(await requireLink(ctx))) return;
    await ctx.reply(
      "اتصال این گفتگو به حساب سایت قطع شود؟ دیگر خبری اینجا نمی‌رسد.",
      Markup.inlineKeyboard([
        [Markup.button.callback("بله، قطع کن", "acc_unlink_yes")],
        [Markup.button.callback("نه", "cancel")],
      ]),
    );
  });

  bot.action("acc_unlink_yes", async (ctx) => {
    await ctx.answerCbQuery();
    await tg.unlinkChat(ctx.chat!.id);
    pending.delete(ctx.chat!.id);
    await ctx.reply(
      "اتصال قطع شد. هر وقت خواستید از «حساب کاربری» در سایت دوباره وصل شوید.",
      Markup.removeKeyboard(),
    );
  });

  // ── Offers: bot-only discount codes + recent news ──────────────────
  async function showOffers(ctx: Context) {
    if (!(await requireLink(ctx))) return;
    const now = new Date();
    const [coupons, news] = await Promise.all([
      prisma.coupon.findMany({
        where: {
          botOnly: true,
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      tg.listBroadcasts(),
    ]);
    const lines = ["🎁 پیشنهادهای مخصوص اعضای ربات", ""];
    if (coupons.length === 0) lines.push("فعلاً کد تخفیف ویژه‌ای فعال نیست.");
    for (const c of coupons) {
      lines.push(
        `<code>${escape(c.code)}</code> — ${num(c.percent)}٪ تخفیف` +
          (c.expiresAt ? ` · تا ${date(c.expiresAt)}` : ""),
      );
    }
    const recent = news.filter((b) => b.doneAt).slice(0, 3);
    if (recent.length) {
      lines.push("", "📰 آخرین خبرها:");
      for (const b of recent) lines.push("", `${date(b.createdAt)}\n${escape(b.text)}`);
    }
    lines.push("", "کد را هنگام پرداخت در «پاکت» سایت وارد کنید.");
    await ctx.reply(lines.join("\n"), {
      parse_mode: "HTML",
      ...inline([urlButton("🛍 رفتن به فروشگاه", "/products")]),
    });
  }

  // ── Menu buttons, commands and free text ───────────────────────────
  function cancelKeyboard() {
    return Markup.inlineKeyboard([[Markup.button.callback("❌ انصراف", "cancel")]]);
  }

  bot.action("cancel", async (ctx) => {
    await ctx.answerCbQuery();
    pending.delete(ctx.chat!.id);
    await ctx.reply("لغو شد.", mainKeyboard());
  });

  const routes: Array<[string, string, (ctx: Context) => Promise<void>]> = [
    [BTN.orders, "orders", showOrders],
    [BTN.support, "support", showTickets],
    [BTN.account, "account", showAccount],
    [BTN.offers, "offers", showOffers],
  ];
  for (const [label, command, handler] of routes) {
    bot.hears(label, async (ctx) => {
      pending.delete(ctx.chat.id);
      await handler(ctx);
    });
    bot.command(command, async (ctx) => {
      pending.delete(ctx.chat.id);
      await handler(ctx);
    });
  }

  bot.on(message("text"), async (ctx) => {
    const state = pending.get(ctx.chat.id);
    const text = ctx.message.text.trim();
    if (!state) {
      const link = await requireLink(ctx);
      if (link) await ctx.reply("از دکمه‌های پایین صفحه استفاده کنید 👇", mainKeyboard());
      return;
    }
    const link = await requireLink(ctx);
    if (!link) {
      pending.delete(ctx.chat.id);
      return;
    }
    switch (state.kind) {
      case "name": {
        const parsed = updateProfileSchema.safeParse({ name: text });
        if (!parsed.success) {
          await ctx.reply("نام باید بین ۱ تا ۱۰۰ نویسه باشد. دوباره بنویسید:", cancelKeyboard());
          return;
        }
        const user = await updateProfile(link.userId, parsed.data);
        pending.delete(ctx.chat.id);
        await ctx.reply(`✅ نام شما «${user.name}» شد.`, mainKeyboard());
        return;
      }
      case "ticketSubject": {
        const subject = createTicketSchema.shape.subject.safeParse(text);
        if (!subject.success) {
          await ctx.reply("موضوع باید بین ۱ تا ۲۰۰ نویسه باشد:", cancelKeyboard());
          return;
        }
        pending.set(ctx.chat.id, { kind: "ticketBody", subject: subject.data });
        await ctx.reply("حالا متن پیامتان را بنویسید:", cancelKeyboard());
        return;
      }
      case "ticketBody": {
        if (!ticketMessageSchema.shape.body.safeParse(text).success) {
          await ctx.reply("متن پیام خالی است یا خیلی طولانی است:", cancelKeyboard());
          return;
        }
        const ticket = await createTicket(link.userId, state.subject, text);
        pending.delete(ctx.chat.id);
        await ctx.reply(
          `✅ تیکت #${shortId(ticket.id)} ثبت شد. پاسخ پشتیبانی همین‌جا خبر داده می‌شود.`,
          mainKeyboard(),
        );
        return;
      }
      case "reply": {
        if (!ticketMessageSchema.shape.body.safeParse(text).success) {
          await ctx.reply("متن پیام خالی است یا خیلی طولانی است:", cancelKeyboard());
          return;
        }
        const ok = await addMyMessage(link.userId, state.ticketId, text).catch(() => null);
        pending.delete(ctx.chat.id);
        await ctx.reply(ok ? "✅ پاسخ شما ثبت شد." : "این تیکت پیدا نشد.", mainKeyboard());
        return;
      }
    }
  });

  return bot;
}

// ── Outbox + broadcasts (run alongside the bot) ──────────────────────

type Sender = Telegraf["telegram"];

// Telegram's answer for a user who blocked the bot or deleted their account
// (other 400s, e.g. a too-long message, are not about the chat).
const isGone = (error: unknown) =>
  error instanceof TelegramError &&
  (error.code === 403 || (error.code === 400 && /chat not found/i.test(error.description)));

export function notificationText(kind: string, data: Record<string, string>) {
  switch (kind) {
    case "ORDER_DELIVERED":
      return {
        text: `✅ سفارش #${shortId(data.orderId ?? "")} تحویل شد.\nاطلاعات تحویل را از «${BTN.orders}» ببینید.`,
        path: `/dashboard/orders/${data.orderId}`,
      };
    case "TICKET_REPLY":
      return {
        text: `🛟 پشتیبانی به «${data.subject ?? ""}» پاسخ داد.\nاز «${BTN.support}» پاسخ را ببینید.`,
        path: `/support/${data.ticketId}`,
      };
    default:
      return {
        text: `📦 «${data.name ?? ""}» دوباره موجود شد؛ تا تمام نشده سر بزنید.`,
        path: `/products/${data.slug}`,
      };
  }
}

export async function flushOutbox(telegram: Sender): Promise<number> {
  const items = await tg.pendingNotifications();
  const done: string[] = [];
  for (const n of items) {
    const chatId = n.user.telegram?.chatId;
    if (!chatId) {
      done.push(n.id);
      continue;
    }
    const { text, path } = notificationText(n.kind, n.data as Record<string, string>);
    try {
      await telegram.sendMessage(
        chatId.toString(),
        text,
        inline([urlButton("🌐 باز کردن در سایت", path)]),
      );
      done.push(n.id);
    } catch (error) {
      if (!isGone(error)) break; // network trouble: retry on the next tick
      await tg.markChatBlocked(chatId, true);
      done.push(n.id);
    }
  }
  await tg.markNotificationsSent(done);
  return done.length;
}

// Sends the oldest unfinished broadcast in batches, saving progress after each
// batch so a restart resumes where it stopped. ~20 messages/second.
export async function runBroadcasts(
  telegram: Sender,
  pause = (ms: number) => new Promise((r) => setTimeout(r, ms)),
): Promise<void> {
  const b = await tg.nextPendingBroadcast();
  if (!b) return;
  let cursor = b.lastLinkId;
  for (;;) {
    const batch = await tg.broadcastBatch(cursor);
    if (batch.length === 0) break;
    let sent = 0;
    let failed = 0;
    for (const r of batch) {
      try {
        await telegram.sendMessage(r.chatId.toString(), b.text);
        sent++;
      } catch (error) {
        failed++;
        if (isGone(error)) await tg.markChatBlocked(r.chatId, true);
      }
      await pause(50);
    }
    cursor = batch[batch.length - 1].id;
    await tg.recordBroadcastProgress(b.id, cursor, sent, failed);
  }
  await tg.finishBroadcast(b.id);
}

let customerBot: Telegraf | undefined;
let botUsername: string | undefined;

export const isCustomerBotEnabled = () => Boolean(customerBot && botUsername);

// The deep link a signed-in user opens to connect this chat to their account.
export function customerBotLink(token: string): string | null {
  if (!botUsername) return null;
  return `${env.CUSTOMER_BOT_LINK_BASE}/${botUsername}?start=${token}`;
}

export function startCustomerBot(): () => void {
  const token = env.CUSTOMER_BOT_TOKEN;
  if (!token) {
    console.log("[customer-bot] disabled (set CUSTOMER_BOT_TOKEN to enable)");
    return () => {};
  }
  const bot = createCustomerBot(token);
  customerBot = bot;
  const timers: ReturnType<typeof setInterval>[] = [];
  let outboxBusy = false;
  let broadcastBusy = false;

  void bot.telegram
    .getMe()
    .then((me) => {
      botUsername = me.username;
      console.log(`[customer-bot] @${me.username} ready`);
      timers.push(
        setInterval(() => {
          if (outboxBusy) return;
          outboxBusy = true;
          flushOutbox(bot.telegram)
            .catch((error) => console.error("[customer-bot] outbox failed", error))
            .finally(() => (outboxBusy = false));
        }, OUTBOX_MS),
        setInterval(() => {
          if (broadcastBusy) return;
          broadcastBusy = true;
          runBroadcasts(bot.telegram)
            .catch((error) => console.error("[customer-bot] broadcast failed", error))
            .finally(() => (broadcastBusy = false));
        }, BROADCAST_MS),
      );
      for (const t of timers) t.unref();
      return bot.launch();
    })
    .catch((error) => console.error("[customer-bot] failed to start", error));

  return () => {
    for (const t of timers) clearInterval(t);
    try {
      bot.stop("shutdown");
    } catch {
      // never launched (e.g. getMe failed) — nothing to stop
    }
  };
}
