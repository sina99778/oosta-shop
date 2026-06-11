// Telegram admin bot (Telegraf). Disabled unless TELEGRAM_BOT_TOKEN and
// TELEGRAM_ADMIN_ID are set. Access is restricted strictly to the admin id.
// Features: stats, recent orders, on-demand + scheduled DB backups, and restore
// (admin sends a backup file captioned "restore"). Fully button-driven; /start opens the menu.

import { Telegraf, Markup } from "telegraf";
import { message } from "telegraf/filters";
import { unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";
import { createBackup, restoreFromFile } from "./lib/backup";
import { isAgentEnabled, runAgent } from "./lib/agent";
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

let bot: Telegraf | undefined;
let backupTimer: ReturnType<typeof setInterval> | undefined;

function mainMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("📊 آمار فروش", "stats"),
      Markup.button.callback("🧾 سفارش‌های اخیر", "orders"),
    ],
    [
      Markup.button.callback("🧾 رسیدهای در انتظار", "receipts"),
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
  const who = r.order.user.email ?? r.order.user.phone ?? r.order.user.name;
  const when = new Date(r.createdAt).toISOString().replace("T", " ").slice(0, 16);
  const statusIcon = r.status === "APPROVED" ? "✅" : r.status === "REJECTED" ? "❌" : "🕒";
  return [
    `🧾 Receipt — order #${r.order.id.slice(-8)}`,
    `👤 ${r.order.user.name} (${who})`,
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
      status === "PENDING" ? "✅ No receipts awaiting review." : "No receipts yet.",
      mainMenu(),
    );
    return;
  }
  await bot.telegram.sendMessage(
    chatId,
    status === "PENDING"
      ? `🧾 ${pendingCount} receipt(s) awaiting review:`
      : `🗂 Showing ${items.length} most recent receipt(s):`,
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
    orderBy: { createdAt: "desc" },
    include: { user: { select: { email: true, phone: true } } },
  });
  if (orders.length === 0) return "هنوز سفارشی ثبت نشده.";
  const icon: Record<string, string> = {
    PAID: "✅",
    PENDING: "🕒",
    PENDING_REVIEW: "🧾",
    FAILED: "❌",
    REJECTED: "🚫",
    REFUNDED: "↩️",
    EXPIRED: "⌛",
  };
  const lines = orders.map((order) => {
    const who = order.user.email ?? order.user.phone ?? "ناشناس";
    return `${icon[order.paymentStatus] ?? "•"} #${order.id.slice(-8)} · ${who} · ${fmtAmount(Number(order.totalAmount))} ${order.currency}`;
  });
  return `🧾 ${orders.length} سفارش اخیر\n\n${lines.join("\n")}`;
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
  if (!bot) return;
  const { file, cleanup } = await createBackup();
  try {
    await bot.telegram.sendDocument(
      chatId,
      { source: file, filename: path.basename(file) },
      { caption: "🗄️ oostaAI database backup" },
    );
  } finally {
    await cleanup();
  }
}

// Fire-and-forget notification to the admin (used by e.g. the tickets module).
export async function notifyAdmin(text: string): Promise<void> {
  const adminId = env.TELEGRAM_ADMIN_ID;
  if (!bot || !adminId) return;
  try {
    await bot.telegram.sendMessage(adminId, text);
  } catch (error) {
    console.error("[telegram] notifyAdmin failed", error);
  }
}

export function startBot(): void {
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
    if (ctx.from?.id !== adminId) {
      await ctx.reply("⛔ Unauthorized.");
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

  // /start opens the button menu. Plain text messages go to the AI agent.
  bot.start((ctx) =>
    ctx.reply(
      "👋 پنل ادمین oostaAI\n\nیک گزینه را انتخاب کن، یا همین‌جا فارسی دستور بده تا دستیار هوش مصنوعی انجامش بده — مثلاً:\n«یک محصول اکانت اسپاتیفای با قیمت ۱۵۰۰۰۰ بساز» یا «یک پست وبلاگ درباره‌ی خرید امن بنویس».\n\n🧠 از دکمه‌ی «مدل‌ها» مدل هوش مصنوعی را عوض کن، یا در خود دستور بگو: «با کلود …»، «با جی‌پی‌تی …»، «با جمنای …».",
      mainMenu(),
    ),
  );

  bot.action("stats", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(await statsMessage(), mainMenu());
  });
  bot.action("orders", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(await ordersMessage(), mainMenu());
  });
  bot.action("backup", async (ctx) => {
    await ctx.answerCbQuery("Creating backup…");
    await sendBackup(ctx.chat?.id ?? adminId);
  });
  bot.action("restore", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      "♻️ To restore, send me a backup file (.sql or .sql.gz) with the caption: restore",
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

  bot.action(/^rcp_ok_(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    try {
      const receipt = await approveReceipt(id, {});
      await ctx.answerCbQuery("✅ Approved & delivered");
      await ctx.editMessageReplyMarkup(undefined).catch(() => {});
      await ctx.reply(
        `✅ Approved — order #${receipt.order.id.slice(-8)} is now PAID and delivered.`,
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

  bot.action(/^rcp_no_(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    try {
      const receipt = await rejectReceipt(id, {});
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

  // Restore: admin sends a .sql/.sql.gz dump with the caption "restore".
  bot.on(message("document"), async (ctx) => {
    const caption = ctx.message.caption ?? "";
    if (!/restore/i.test(caption)) {
      await ctx.reply('📥 To restore this backup, resend the file with the caption: "restore"');
      return;
    }
    await ctx.reply("⏳ Restoring database… the site may be briefly unavailable.");
    try {
      const link = await ctx.telegram.getFileLink(ctx.message.document.file_id);
      const response = await fetch(link.href);
      const buffer = Buffer.from(await response.arrayBuffer());
      const name = ctx.message.document.file_name ?? "restore.sql.gz";
      const tmp = path.join(os.tmpdir(), `oosta-restore-${name}`);
      await writeFile(tmp, buffer);
      await restoreFromFile(tmp);
      await unlink(tmp).catch(() => {});
      await ctx.reply("✅ Restore complete.");
    } catch (error) {
      await ctx.reply(
        `❌ Restore failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

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
      const result = await runAgent(instruction, {
        image,
        onStep: (note) => {
          void bot?.telegram.sendChatAction(chatId, "typing").catch(() => {});
          console.log(`[agent] tool: ${note}`);
        },
      });
      if (thinking) await bot.telegram.deleteMessage(chatId, thinking.message_id).catch(() => {});
      await bot.telegram.sendMessage(chatId, result.slice(0, 3800), mainMenu());
    } catch (error) {
      await bot.telegram.sendMessage(
        chatId,
        `❌ ${error instanceof Error ? error.message : String(error)}`,
        mainMenu(),
      );
    }
  }

  // AI agent: any plain text message (not a command) is treated as an instruction.
  bot.on(message("text"), async (ctx) => {
    const text = ctx.message.text?.trim() ?? "";
    if (!text || text.startsWith("/")) return;
    await runAgentForChat(ctx.chat.id, text);
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
  if (env.BACKUP_INTERVAL_HOURS > 0) {
    backupTimer = setInterval(
      () => {
        sendBackup(adminId).catch((error) =>
          console.error("[telegram] scheduled backup failed", error),
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
