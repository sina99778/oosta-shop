// Telegram admin bot (Telegraf). Disabled unless TELEGRAM_BOT_TOKEN and
// TELEGRAM_ADMIN_ID are set. Access is restricted strictly to the admin id.
// Features: stats, recent orders, and on-demand + scheduled encrypted backups.

import { Telegraf, Markup, type Context } from "telegraf";
import { message } from "telegraf/filters";
import { bold, code, fmt, type FmtString } from "telegraf/format";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";
import { isMaintenance } from "./lib/maintenance";
import { createEncryptedBackup } from "./lib/backup";
import { deliverBackup } from "./lib/telegram-backup";
import {
  approveAgentAction,
  pendingAgentActions,
  isAgentEnabled,
  runAgent,
  type PendingImage,
} from "./lib/agent";
import { isOpenRouterEnabled } from "./lib/openrouter";
import { getVisitStats } from "./modules/analytics/analytics.service";
import {
  IMAGE_MODELS,
  TEXT_MODELS,
  getAgentModels,
  setAgentImageModel,
  setAgentTextModel,
} from "./lib/agentPrefs";
import {
  approveReceipt,
  getReceiptImage,
  getStats,
  listReceipts,
  listTickets,
  rejectReceipt,
} from "./modules/admin/admin.service";
import { getGatewayConfig, maskCard, patchGatewayConfig } from "./lib/gatewayConfig";
import { readBluPollStatus } from "./modules/orders/blu-poll-status";
import type { SupplierRegistry } from "./modules/suppliers/fulfillment";
import { liveSupplierRegistry } from "./modules/suppliers/live-adapters";
import { registerSupplierTelegram } from "./modules/suppliers/telegram-actions";

let bot: Telegraf | undefined;
let sendPaidSupplierCard: ((orderId: string) => Promise<void>) | undefined;
let backupTimer: ReturnType<typeof setInterval> | undefined;
let backupInProgress = false;

const shortcuts = {
  orders: "🧾 سفارش‌های اخیر",
  blu: "💳 وضعیت بلو",
  receipts: "📥 رسیدهای در انتظار",
  tools: "⚙️ همه ابزارها",
};

const quickKeyboard = Markup.keyboard([
  [shortcuts.orders, shortcuts.blu],
  [shortcuts.receipts, shortcuts.tools],
])
  .resize()
  .persistent();

function mainMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("📊 آمار فروش", "stats"),
      Markup.button.callback(shortcuts.orders, "orders"),
    ],
    [Markup.button.callback(shortcuts.blu, "blu_status")],
    [
      Markup.button.callback(shortcuts.receipts, "receipts"),
      Markup.button.callback("🗂 تاریخچه رسیدها", "receipts_history"),
    ],
    [
      Markup.button.callback("🎫 تیکت‌های باز", "tickets"),
      Markup.button.callback("💳 درگاه‌ها", "gateways"),
    ],
    [
      Markup.button.callback("🧠 مدل‌ها", "models"),
      Markup.button.callback("📈 بازدیدها", "visits"),
    ],
    [
      Markup.button.callback("💾 بکاپ فوری", "backup"),
      Markup.button.callback("♻️ بازیابی", "restore"),
    ],
  ]);
}

const fmtAmount = (n: number) => new Intl.NumberFormat("fa-IR").format(Math.round(n));

async function bluStatusMessage(): Promise<string> {
  const { state, checkedAt } = await readBluPollStatus();
  const labels: Record<string, string> = {
    disabled: "جمع‌آوری وضعیت تنظیم نشده",
    waiting: "در انتظار اولین بررسی",
    idle: "رسیدی در صف بررسی نیست",
    matched: "آخرین بررسی، واریز مطابق رسید پیدا کرد",
    pending: "هنوز واریزی مطابق رسید پیدا نشده",
    review: "آخرین نتیجه نیاز به بررسی مدیر دارد",
    enrollmentRequired: "ورود مجدد به بلو لازم است",
    unavailable: "وضعیت بررسی در دسترس نیست",
    stale: "بیش از ۱۰ دقیقه از آخرین بررسی گذشته",
  };
  const lines = [
    "💳 وضعیت بلو",
    `تأیید خودکار: ${env.BLU_AUTO_APPROVE_ENABLED ? "روشن" : "خاموش"}`,
    `بررسی رسید: ${labels[state] ?? labels.unavailable}`,
  ];
  if (checkedAt) {
    const lastCheck = new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Asia/Tehran",
    }).format(new Date(checkedAt));
    lines.push(`آخرین بررسی به وقت تهران: ${lastCheck}`);
  }
  return lines.join("\n");
}

// Gateway status + one-tap toggles. Card details change via the AI agent in chat.
async function gatewaysView() {
  const gw = await getGatewayConfig();
  const text = [
    "💳 درگاه‌های پرداخت",
    "",
    `درگاه آنلاین: ${gw.provider === "zarinpal" ? "زرین‌پال ✅" : "تستی (mock) ⚠️"}`,
    ...(gw.provider === "zarinpal"
      ? [
          `  مرچنت: ${gw.zarinpalMerchantId.slice(0, 8)}…`,
          `  سندباکس: ${gw.zarinpalSandbox ? "روشن ⚠️" : "خاموش ✅"}`,
        ]
      : []),
    "",
    `کارت‌به‌کارت: ${gw.cardEnabled ? "فعال ✅" : "غیرفعال ❌"}`,
    ...(gw.cardEnabled
      ? [`  کارت: ${maskCard(gw.cardNumber)}`, `  ${gw.cardHolder || "—"} · ${gw.cardBank || "—"}`]
      : []),
    "",
    "برای تغییر شماره کارت/مرچنت، همین‌جا به دستیار بگو — مثلاً:",
    "«شماره کارت کارت‌به‌کارت را به ۶۲۱۹۸۶۱۰۱۲۳۴۵۶۷۸ تغییر بده»",
  ].join("\n");

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback(
        gw.provider === "zarinpal" ? "🔁 برو روی حالت تستی" : "🔁 برو روی زرین‌پال",
        "gw_provider",
      ),
    ],
    [
      Markup.button.callback(
        gw.cardEnabled ? "❌ غیرفعال‌کردن کارت‌به‌کارت" : "✅ فعال‌کردن کارت‌به‌کارت",
        "gw_card",
      ),
    ],
    ...(gw.provider === "zarinpal"
      ? [
          [
            Markup.button.callback(
              gw.zarinpalSandbox ? "🔌 خاموش‌کردن سندباکس" : "🧪 روشن‌کردن سندباکس",
              "gw_sandbox",
            ),
          ],
        ]
      : []),
  ]);
  return { text, keyboard };
}

// "IR" -> 🇮🇷 (regional-indicator pair); unknown country -> 🌐.
function countryFlag(cc: string): string {
  if (!/^[A-Z]{2}$/.test(cc)) return "🌐";
  return String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0)));
}

async function visitsMessage(): Promise<string> {
  const s = await getVisitStats();
  const range = (label: string, r: { views: number; visitors: number }) =>
    `${label}: ${r.views} بازدید · ${r.visitors} بازدیدکننده`;
  const lines = [
    "📈 آمار بازدید سایت",
    "",
    range("امروز", s.today),
    range("۷ روز اخیر", s.week),
    range("۳۰ روز اخیر", s.month),
  ];
  if (s.daily.length > 0) {
    lines.push("", "📅 روز به روز (هفته‌ی اخیر):");
    for (const d of s.daily) lines.push(`  ${d.day} — ${d.views} بازدید · ${d.visitors} نفر`);
  }
  if (s.countriesMonth.length > 0) {
    lines.push("", "🌍 کشورها (۳۰ روز اخیر):");
    for (const c of s.countriesMonth) {
      lines.push(
        `  ${countryFlag(c.country)} ${c.country === "??" ? "نامشخص" : c.country} — ${c.views}`,
      );
    }
  }
  if (s.stepsWeek.length) {
    lines.push("", "مراحل انتخاب و استعلام در ۷ روز اخیر (تعداد رخداد)");
    const counts = new Map(s.stepsWeek.map(({ step, count }) => [step, count]));
    for (const [step, label] of Object.entries({
      product_viewed: "مشاهدهٔ محصول",
      plan_selected: "انتخاب دستی پلن",
      quote_received: "دریافت استعلام",
      plan_login_started: "رفتن به ورود از پلن",
      plan_restored: "بازگشت به همان پلن پس از ورود",
    }))
      lines.push(`${label}: ${counts.get(step) ?? 0}`);
  }
  if (s.month.views === 0) {
    lines.push(
      "",
      "هنوز بازدیدی ثبت نشده. ردیابی از همین نسخه فعال شد — بعد از deploy آمار جمع می‌شود.",
    );
  }
  return lines.join("\n");
}

// One row per model; the active one is marked. callback data carries the index
// (kept short — Telegram caps callback_data at 64 bytes).
function modelKeyboard(kind: "t" | "i", current: string) {
  const list = kind === "t" ? TEXT_MODELS : IMAGE_MODELS;
  return Markup.inlineKeyboard(
    list.map((m, i) => [
      Markup.button.callback(
        `${m.slug === current ? "✅ " : ""}${m.label} — ${m.price}`,
        `mdl_${kind}_${i}`,
      ),
    ]),
  );
}

function receiptCaption(r: {
  id: string;
  reference: string | null;
  status: string;
  createdAt: Date;
  order: {
    id: string;
    totalAmount: number;
    currency: string;
    user: { name: string; email: string | null; phone: string | null };
  };
}): string {
  const when = new Date(r.createdAt).toISOString().replace("T", " ").slice(0, 16);
  const statusIcon = r.status === "APPROVED" ? "✅" : r.status === "REJECTED" ? "❌" : "🕒";
  return [
    `🧾 Receipt — order #${r.order.id.slice(-8)}`,
    `💰 ${r.order.totalAmount} ${r.order.currency}`,
    `🏷 Note: ${r.reference ?? "—"}`,
    `${statusIcon} Status: ${r.status}`,
    `🕒 ${when}`,
  ].join("\n");
}

// Send each receipt's image + (for pending ones) Approve/Reject buttons.
async function sendReceipts(chatId: number, status: "PENDING" | undefined): Promise<void> {
  if (!bot) return;
  const { items, pendingCount } = await listReceipts({ status, page: 1, pageSize: 10 });
  if (items.length === 0) {
    await bot.telegram.sendMessage(
      chatId,
      status === "PENDING" ? "✅ رسیدی در انتظار بررسی نیست." : "هنوز رسیدی ثبت نشده.",
      mainMenu(),
    );
    return;
  }
  await bot.telegram.sendMessage(
    chatId,
    status === "PENDING"
      ? `🧾 ${fmtAmount(pendingCount)} رسید در انتظار بررسی`
      : `🗂 ${fmtAmount(items.length)} رسید اخیر`,
  );
  for (const r of items) {
    const caption = receiptCaption(r);
    const buttons =
      r.status === "PENDING"
        ? Markup.inlineKeyboard([
            [
              Markup.button.callback("✅ Approve", `rcp_ok_${r.id}`),
              Markup.button.callback("❌ Reject", `rcp_no_${r.id}`),
            ],
          ])
        : undefined;
    try {
      // Loading the image is inside the try so one unreadable receipt is skipped
      // (text-only fallback) instead of aborting the whole queue.
      const { data, mimeType } = await getReceiptImage(r.id);
      if (mimeType === "application/pdf") {
        await bot.telegram.sendDocument(
          chatId,
          { source: data, filename: `receipt-${r.id}.pdf` },
          { caption, ...(buttons ?? {}) },
        );
      } else {
        await bot.telegram.sendPhoto(chatId, { source: data }, { caption, ...(buttons ?? {}) });
      }
    } catch {
      // Fall back to a text-only card if the media can't be sent.
      await bot.telegram.sendMessage(chatId, caption, buttons ?? {});
    }
  }
}

async function statsMessage(): Promise<string> {
  const s = await getStats();
  const lines = [
    "📊 آمار فروش",
    "",
    `💰 درآمد کل: ${fmtAmount(s.revenueTotal)} ${s.currency}`,
    `📆 درآمد ۳۰ روز اخیر: ${fmtAmount(s.revenue30)} ${s.currency}`,
    `✅ سفارش‌های موفق: ${s.paidOrders} از ${s.totalOrders}`,
    `🕒 در انتظار بررسی رسید: ${s.pendingReview}`,
    `👤 مشتری‌ها: ${s.customers}`,
  ];
  if (s.salesByDay.length > 0) {
    lines.push("", "📅 فروش روزهای اخیر:");
    for (const d of s.salesByDay.slice(-7)) {
      lines.push(`  ${d.day} — ${d.count} سفارش · ${fmtAmount(d.revenue)} ${s.currency}`);
    }
  }
  if (s.topProducts.length > 0) {
    lines.push("", "🏆 پرفروش‌ها:");
    for (const p of s.topProducts) lines.push(`  • ${p.name} — ${p.unitsSold} فروش`);
  }
  if (s.lowStock.length > 0) {
    lines.push("", "⚠️ موجودی کم:");
    for (const p of s.lowStock) lines.push(`  • ${p.name} — ${p.stock} عدد`);
  }
  return lines.join("\n");
}

async function ordersMessage(): Promise<string> {
  const orders = await prisma.order.findMany({
    take: 8,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      paymentStatus: true,
      totalAmount: true,
      currency: true,
      items: {
        take: 3,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { quantity: true, product: { select: { name: true } } },
      },
    },
  });
  if (orders.length === 0) return "هنوز سفارشی ثبت نشده.";
  const status = {
    PAID: "✅ تحویل‌شده",
    PENDING: "🕒 در انتظار پرداخت",
    PENDING_REVIEW: "🧾 در انتظار بررسی رسید",
    PAID_PENDING_FULFILLMENT: "📦 پرداخت شده، در انتظار تحویل",
    FAILED: "❌ پرداخت ناموفق",
    REJECTED: "🚫 رسید رد شده",
    REFUNDED: "↩️ سفارش بازگشت داده شده",
    EXPIRED: "⌛ مهلت گذشته",
  };
  const money = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 3 });
  const lines = orders.map((order) => {
    const amount = Number(order.totalAmount) / (order.currency === "IRR" ? 10 : 1);
    const currency = ["IRR", "IRT"].includes(order.currency) ? "تومان" : order.currency;
    const products = order.items.slice(0, 2).map(({ product, quantity }) => {
      const name = product.name.replace(/\s+/g, " ").trim().slice(0, 80);
      return `${name} × ${fmtAmount(quantity)}`;
    });
    if (order.items.length > 2) products.push("و موارد دیگر");
    const summary = `${status[order.paymentStatus]} · #${order.id.slice(-8)} · ${money.format(amount)} ${currency}`;
    return products.length ? `${summary}\n${products.join("، ")}` : summary;
  });
  return `🧾 ${fmtAmount(orders.length)} سفارش اخیر\n\n${lines.join("\n\n")}`;
}

async function ticketsMessage(): Promise<string> {
  const { items, openCount } = await listTickets({ status: "OPEN", page: 1, pageSize: 10 });
  if (items.length === 0) return "🎫 تیکت بازی وجود ندارد. ✅";
  const lines = items.map(
    (t) => `• #${t.id.slice(-8)} — ${t.subject}\n  از ${t.user.name} · ${t.messageCount} پیام`,
  );
  const header =
    openCount > items.length
      ? `🎫 ${openCount} تیکت باز (${items.length} مورد اخیر):`
      : `🎫 ${openCount} تیکت باز:`;
  return [
    header,
    "",
    ...lines,
    "",
    "برای پاسخ، همین‌جا به دستیار بگو — مثلاً: «تیکت #xxxxxxxx را بخوان و جواب مناسب بده»",
  ].join("\n");
}

async function sendBackup(chatId: number): Promise<void> {
  if (!bot || backupInProgress) return;
  const telegram = bot.telegram;
  backupInProgress = true;
  try {
    await deliverBackup({
      chatId,
      recipient: env.BACKUP_AGE_RECIPIENT,
      create: createEncryptedBackup,
      send: (id, document, caption) => telegram.sendDocument(id, document, { caption }),
    });
  } finally {
    backupInProgress = false;
  }
}

// Fire-and-forget notification to the admin (used by e.g. the tickets module).
export async function notifyAdmin(
  text: string | FmtString,
  button?: { label: string; data: string },
): Promise<void> {
  const adminId = env.TELEGRAM_ADMIN_ID;
  if (!bot || !adminId) return;
  try {
    await bot.telegram.sendMessage(
      adminId,
      text,
      button
        ? Markup.inlineKeyboard([Markup.button.callback(button.label, button.data)])
        : undefined,
    );
  } catch {
    console.error("[telegram] notifyAdmin failed");
  }
}

const signupTime = new Intl.DateTimeFormat("fa-IR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Tehran",
});

export function notifyNewSignup(user: {
  id: string;
  email: string | null;
  phone: string | null;
  createdAt: Date;
}) {
  const method = user.email ? (user.phone ? "ایمیل و شمارهٔ موبایل" : "ایمیل") : "شمارهٔ موبایل";
  return notifyAdmin(fmt`${bold("👤 ثبت‌نام جدید در اوستا")}

${bold("شناسهٔ عضو:")} ${code(user.id.slice(-8))}
${bold("روش ثبت‌نام:")} ${method}
${bold("ایمیل:")} ${user.email ? code(user.email) : "ثبت نشده"}
${bold("شمارهٔ موبایل:")} ${user.phone ? code(user.phone) : "ثبت نشده"}
${bold("زمان ثبت‌نام (تهران):")} ${signupTime.format(user.createdAt)}`);
}

export async function notifySupplierReceipt(receiptId: string, orderId: string) {
  const chatId = env.TELEGRAM_ADMIN_ID;
  if (!bot || !chatId) return;
  try {
    const { data, mimeType } = await getReceiptImage(receiptId);
    const caption = "رسید سفارش تأمین‌کننده " + orderId.slice(-8);
    const buttons = Markup.inlineKeyboard([
      [
        Markup.button.callback("تأیید رسید", "rcp_ok_" + receiptId),
        Markup.button.callback("رد رسید", "rcp_no_" + receiptId),
      ],
    ]);
    await bot.telegram.sendDocument(
      chatId,
      {
        source: data,
        filename:
          mimeType === "application/pdf"
            ? "receipt.pdf"
            : mimeType === "image/png"
              ? "receipt.png"
              : "receipt.jpg",
      },
      { caption, ...buttons },
    );
  } catch {
    console.error("[telegram] supplier receipt notification failed");
  }
}

export async function notifyPaidSupplierOrder(orderId: string) {
  try {
    await sendPaidSupplierCard?.(orderId);
  } catch {
    console.error("[telegram] paid supplier notification failed");
  }
}

export function startBot(registry: () => SupplierRegistry = liveSupplierRegistry): void {
  const token = env.TELEGRAM_BOT_TOKEN;
  const adminId = env.TELEGRAM_ADMIN_ID;

  if (!token || !adminId) {
    console.log(
      "[telegram] admin bot disabled (set TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_ID to enable)",
    );
    return;
  }

  bot = new Telegraf(token);

  // Restrict every incoming update (messages AND button taps) strictly to the admin.
  bot.use(async (ctx, next) => {
    if (ctx.from?.id !== adminId || ctx.chat?.type !== "private" || ctx.chat.id !== adminId) {
      await ctx.reply("⛔ Unauthorized.");
      return;
    }
    if (isMaintenance()) {
      await ctx.reply("A database restore is in progress. Please retry shortly.");
      return;
    }
    return next();
  });

  // Global safety net: any handler error is reported to the admin instead of
  // crashing the update (Telegraf's default handler sets exitCode=1 and rethrows).
  bot.catch(async (error, ctx) => {
    console.error("[telegram] handler error", error);
    await ctx
      .reply(`❌ ${error instanceof Error ? error.message : String(error)}`, mainMenu())
      .catch(() => {});
  });

  // Register keyboard labels before the generic AI text handler.
  bot.command(["start", "menu"], (ctx) =>
    ctx.reply("پنل مدیریت اوستا\nیکی از دکمه‌های پایین را انتخاب کن.", quickKeyboard),
  );
  bot.command("blu", async (ctx) => ctx.reply(await bluStatusMessage(), mainMenu()));
  bot.command("orders", async (ctx) => ctx.reply(await ordersMessage(), mainMenu()));
  bot.hears(shortcuts.blu, async (ctx) => ctx.reply(await bluStatusMessage()));
  bot.hears(shortcuts.orders, async (ctx) => ctx.reply(await ordersMessage()));
  bot.hears(shortcuts.receipts, async (ctx) => sendReceipts(ctx.chat.id, "PENDING"));
  bot.hears(shortcuts.tools, (ctx) => ctx.reply("ابزارهای مدیریت اوستا", mainMenu()));
  bot.action("blu_status", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(await bluStatusMessage(), mainMenu());
  });

  bot.action("stats", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(await statsMessage(), mainMenu());
  });
  bot.action("orders", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(await ordersMessage(), mainMenu());
  });
  bot.action("backup", async (ctx) => {
    if (!env.BACKUP_AGE_RECIPIENT) {
      await ctx.answerCbQuery();
      await ctx.reply("کلید عمومی بکاپ تنظیم نشده است.", mainMenu());
      return;
    }
    if (backupInProgress) {
      await ctx.answerCbQuery("بکاپ در حال آماده‌سازی است.");
      return;
    }
    await ctx.answerCbQuery("آماده‌سازی بکاپ رمزنگاری‌شده…");
    try {
      await sendBackup(adminId);
    } catch {
      console.error("[telegram] encrypted backup failed");
      await ctx.reply("تهیه یا ارسال بکاپ انجام نشد. وضعیت سرور را بررسی کن.", mainMenu());
    }
  });
  bot.action("restore", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      "بازیابی از تلگرام غیرفعال است. فایل بکاپ را با کلید بازیابی باز کن و طبق راهنمای سرور پیش برو.",
      mainMenu(),
    );
  });

  bot.action("tickets", async (ctx) => {
    await ctx.answerCbQuery("Loading…");
    try {
      await ctx.reply(await ticketsMessage(), mainMenu());
    } catch (error) {
      await ctx.reply(`❌ ${error instanceof Error ? error.message : String(error)}`, mainMenu());
    }
  });

  // Payment gateways: status + one-tap toggles.
  bot.action("gateways", async (ctx) => {
    await ctx.answerCbQuery();
    const view = await gatewaysView();
    await ctx.reply(view.text, view.keyboard);
  });

  const gwToggle = async (
    ctx: {
      answerCbQuery: (t?: string) => Promise<unknown>;
      editMessageText: (t: string, k?: object) => Promise<unknown>;
    },
    patch: () => Promise<unknown>,
    note: string,
  ) => {
    try {
      await patch();
      await ctx.answerCbQuery(note);
      const view = await gatewaysView();
      await ctx.editMessageText(view.text, view.keyboard).catch(() => {});
    } catch (error) {
      await ctx.answerCbQuery(error instanceof Error ? error.message.slice(0, 60) : "Failed");
    }
  };

  bot.action("gw_provider", async (ctx) => {
    const gw = await getGatewayConfig();
    const next = gw.provider === "zarinpal" ? "mock" : "zarinpal";
    await gwToggle(ctx, () => patchGatewayConfig({ provider: next }), `✅ ${next}`);
  });
  bot.action("gw_card", async (ctx) => {
    const gw = await getGatewayConfig();
    await gwToggle(
      ctx,
      () => patchGatewayConfig({ cardEnabled: !gw.cardEnabled }),
      gw.cardEnabled ? "❌ غیرفعال شد" : "✅ فعال شد",
    );
  });
  bot.action("gw_sandbox", async (ctx) => {
    const gw = await getGatewayConfig();
    await gwToggle(
      ctx,
      () => patchGatewayConfig({ zarinpalSandbox: !gw.zarinpalSandbox }),
      gw.zarinpalSandbox ? "🔌 خاموش شد" : "🧪 روشن شد",
    );
  });

  bot.action("visits", async (ctx) => {
    await ctx.answerCbQuery("Loading…");
    try {
      await ctx.reply(await visitsMessage(), mainMenu());
    } catch (error) {
      await ctx.reply(`❌ ${error instanceof Error ? error.message : String(error)}`, mainMenu());
    }
  });

  // Runtime model selection (persisted in the DB; env stays the default).
  bot.action("models", async (ctx) => {
    await ctx.answerCbQuery();
    if (!isOpenRouterEnabled()) {
      await ctx.reply(
        "🧠 انتخاب مدل فقط با OPENROUTER_API_KEY فعال است (الان ایجنت روی Gemini مستقیم کار می‌کند).",
        mainMenu(),
      );
      return;
    }
    const current = await getAgentModels();
    await ctx.reply(
      `🧠 مدل متن (دستورات، توضیحات، بلاگ):\nفعلی: ${current.text}`,
      modelKeyboard("t", current.text),
    );
    await ctx.reply(`🎨 مدل تولید عکس:\nفعلی: ${current.image}`, modelKeyboard("i", current.image));
    await ctx.reply(
      "نکته: برای یک دستورِ تکی هم می‌توانی مدل را عوض کنی — مثلاً «با کلود توضیحات محصول X را بنویس» یا «این عکس را با جی‌پی‌تی بساز».",
      mainMenu(),
    );
  });

  bot.action(/^mdl_([ti])_(\d+)$/, async (ctx) => {
    const kind = ctx.match[1] as "t" | "i";
    const list = kind === "t" ? TEXT_MODELS : IMAGE_MODELS;
    const model = list[Number(ctx.match[2])];
    if (!model) {
      await ctx.answerCbQuery("Unknown model");
      return;
    }
    try {
      await (kind === "t" ? setAgentTextModel(model.slug) : setAgentImageModel(model.slug));
      await ctx.answerCbQuery(`✅ ${model.label}`);
      // Cosmetic refresh; re-clicking the active model makes Telegram throw
      // "message is not modified" — the preference is already saved, so ignore.
      await ctx
        .editMessageText(
          `${kind === "t" ? "🧠 مدل متن" : "🎨 مدل تولید عکس"}:\nفعلی: ${model.slug}`,
          modelKeyboard(kind, model.slug),
        )
        .catch(() => {});
    } catch (error) {
      await ctx.answerCbQuery("Failed");
      await ctx.reply(`❌ ${error instanceof Error ? error.message : String(error)}`, mainMenu());
    }
  });

  // Card-to-card receipts.
  bot.action("receipts", async (ctx) => {
    await ctx.answerCbQuery("Loading…");
    await sendReceipts(ctx.chat?.id ?? adminId, "PENDING");
  });
  bot.action("receipts_history", async (ctx) => {
    await ctx.answerCbQuery("Loading…");
    await sendReceipts(ctx.chat?.id ?? adminId, undefined);
  });

  sendPaidSupplierCard = registerSupplierTelegram(bot, adminId, registry);
  bot.action(/^rcp_ok_([a-z0-9]{1,100})$/, async (ctx) => {
    const id = ctx.match[1];
    try {
      const receipt = await approveReceipt(
        id,
        {},
        false,
        process.env.SUPPLIER_TELEGRAM_ADMIN_USER_ID,
      );
      await ctx.answerCbQuery("✅ Approved");
      await ctx.editMessageReplyMarkup(undefined).catch(() => {});
      await ctx.reply(
        `✅ Approved — order #${receipt.order.id.slice(-8)}: ${receipt.order.paymentStatus}.`,
        mainMenu(),
      );
    } catch (error) {
      await ctx.answerCbQuery("Failed");
      await ctx.reply(
        `❌ Could not approve: ${error instanceof Error ? error.message : String(error)}`,
        mainMenu(),
      );
    }
  });

  bot.action(/^rcp_no_([a-z0-9]{1,100})$/, async (ctx) => {
    const id = ctx.match[1];
    try {
      const receipt = await rejectReceipt(id, {}, process.env.SUPPLIER_TELEGRAM_ADMIN_USER_ID);
      await ctx.answerCbQuery("❌ Rejected");
      await ctx.editMessageReplyMarkup(undefined).catch(() => {});
      await ctx.reply(
        `❌ Rejected — order #${receipt.order.id.slice(-8)} marked ${receipt.order.paymentStatus}. The receipt is kept in history.`,
        mainMenu(),
      );
    } catch (error) {
      await ctx.answerCbQuery("Failed");
      await ctx.reply(
        `❌ Could not reject: ${error instanceof Error ? error.message : String(error)}`,
        mainMenu(),
      );
    }
  });

  bot.on(message("document"), async (ctx) => {
    if ((ctx.message.caption ?? "").trim().toLowerCase() === "restore") {
      await ctx.reply("بازیابی از تلگرام غیرفعال است.", mainMenu());
    }
  });
  bot.action(/^restore_confirm_[a-f0-9]{24}$/, (ctx) =>
    ctx.answerCbQuery("بازیابی از تلگرام غیرفعال است."),
  );

  // Run the agent for a chat message (optionally with an attached photo) and reply.
  async function runAgentForChat(
    chatId: number,
    instruction: string,
    image?: { buffer: Buffer; mimeType: string },
  ): Promise<void> {
    if (!bot) return;
    if (!isAgentEnabled()) {
      await bot.telegram.sendMessage(
        chatId,
        "🤖 AI is not configured (set OPENROUTER_API_KEY or GEMINI_API_KEY).",
        mainMenu(),
      );
      return;
    }
    await bot.telegram.sendChatAction(chatId, "typing").catch(() => {});
    const thinking = await bot.telegram.sendMessage(chatId, "🤖 در حال انجام…").catch(() => null);
    try {
      const approvals = new Set<string>();
      const result = await runAgent(instruction, {
        approvals,
        image,
        onStep: (note) => {
          void bot?.telegram.sendChatAction(chatId, "typing").catch(() => {});
          console.log(`[agent] tool: ${note}`);
        },
      });
      if (thinking) await bot.telegram.deleteMessage(chatId, thinking.message_id).catch(() => {});
      await bot.telegram.sendMessage(
        chatId,
        approvals.size
          ? "تغییرات پیشنهادی آماده‌اند و فقط پس از تأیید عملیات مشخص توسط شما اجرا می‌شوند."
          : result.slice(0, 3800),
        mainMenu(),
      );
      for (const action of pendingAgentActions(approvals)) {
        const chunks = Array.from(action.description);
        for (let offset = 0; offset < chunks.length; offset += 1800) {
          await bot.telegram.sendMessage(chatId, chunks.slice(offset, offset + 1800).join(""));
        }
        await bot.telegram.sendMessage(
          chatId,
          "Approve only the operation shown above (expires in 2 minutes).",
          Markup.inlineKeyboard([
            [Markup.button.callback("Approve this operation", `agent_confirm_${action.id}`)],
          ]),
        );
      }
    } catch (error) {
      await bot.telegram.sendMessage(
        chatId,
        `❌ ${error instanceof Error ? error.message : String(error)}`,
        mainMenu(),
      );
    }
  }

  let lastGenerated: { messageId?: number; image: PendingImage } | undefined;
  let forgetGenerated: ReturnType<typeof setTimeout> | undefined;

  async function sendLastGenerated(ctx: Context) {
    const generated = lastGenerated;
    if (!generated) {
      await ctx.reply("تصویر آماده‌ای برای ارسال وجود ندارد.");
      return;
    }
    try {
      const { buffer, mimeType } = generated.image;
      const sent = await ctx.replyWithDocument(
        { source: buffer, filename: `oosta-image.${mimeType.split("/")[1]}` },
        { caption: "تصویر آماده است. برای استفاده از تصویر، به همین پیام پاسخ دهید." },
      );
      generated.messageId = sent.message_id;
    } catch {
      await ctx.reply("تصویر ساخته شد ولی ارسال نشد. برای ارسال دوباره /lastimage را بفرستید.");
    }
  }

  bot.command("lastimage", sendLastGenerated);
  bot.action(/^agent_confirm_([a-f0-9]{24})$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const { message, image } = await approveAgentAction(ctx.match[1]);
      if (!image) {
        await ctx.reply(message);
        return;
      }
      lastGenerated = { image };
      clearTimeout(forgetGenerated);
      forgetGenerated = setTimeout(() => {
        lastGenerated = undefined;
      }, 10 * 60 * 1000).unref();
      await sendLastGenerated(ctx);
    } catch (error) {
      await ctx.reply(error instanceof Error ? error.message : String(error));
    }
  });

  // AI agent: any plain text message (not a command) is treated as an instruction.
  bot.on(message("text"), async (ctx) => {
    const text = ctx.message.text?.trim() ?? "";
    if (!text || text.startsWith("/")) return;
    const replyTo = ctx.message.reply_to_message?.message_id;
    const image = replyTo && lastGenerated?.messageId === replyTo ? lastGenerated.image : undefined;
    await runAgentForChat(ctx.chat.id, text, image);
  });

  // AI agent with a photo: the caption is the instruction; the image is attached.
  bot.on(message("photo"), async (ctx) => {
    const caption =
      (ctx.message.caption ?? "").trim() || "این عکس را روی مناسب‌ترین/آخرین محصول یا پست بگذار.";
    try {
      const photos = ctx.message.photo;
      const largest = photos[photos.length - 1];
      const link = await ctx.telegram.getFileLink(largest.file_id);
      const res = await fetch(link.href);
      const buffer = Buffer.from(await res.arrayBuffer());
      await runAgentForChat(ctx.chat.id, caption, { buffer, mimeType: "image/jpeg" });
    } catch (error) {
      await ctx.reply(`❌ ${error instanceof Error ? error.message : String(error)}`, mainMenu());
    }
  });

  // Scheduled automatic backups.
  if (env.BACKUP_INTERVAL_HOURS > 0 && env.BACKUP_AGE_RECIPIENT) {
    backupTimer = setInterval(
      () => {
        sendBackup(adminId).catch(() =>
          console.error("[telegram] scheduled encrypted backup failed"),
        );
      },
      env.BACKUP_INTERVAL_HOURS * 60 * 60 * 1000,
    );
    console.log(`[telegram] automatic backups every ${env.BACKUP_INTERVAL_HOURS}h`);
  }

  console.log("[telegram] starting admin bot…");
  void bot.launch().catch((error) => console.error("[telegram] bot error", error));

  const stop = (signal: string) => {
    if (backupTimer) clearInterval(backupTimer);
    bot?.stop(signal);
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));
}
