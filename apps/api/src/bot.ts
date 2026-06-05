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
import {
  approveReceipt,
  getReceiptImage,
  listReceipts,
  rejectReceipt,
} from "./modules/admin/admin.service";

let bot: Telegraf | undefined;
let backupTimer: ReturnType<typeof setInterval> | undefined;

function mainMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("📊 Stats", "stats"),
      Markup.button.callback("🧾 Last 5 orders", "orders"),
    ],
    [
      Markup.button.callback("🧾 Pending receipts", "receipts"),
      Markup.button.callback("🗂 Receipt history", "receipts_history"),
    ],
    [
      Markup.button.callback("💾 Backup now", "backup"),
      Markup.button.callback("♻️ Restore", "restore"),
    ],
  ]);
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
    const { data, mimeType } = await getReceiptImage(r.id);
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
  const [users, paidOrders] = await Promise.all([
    prisma.user.count(),
    prisma.order.count({ where: { paymentStatus: "PAID" } }),
  ]);
  return `📊 Stats\n\n👤 Users: ${users}\n✅ Paid orders: ${paidOrders}`;
}

async function ordersMessage(): Promise<string> {
  const orders = await prisma.order.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    include: { user: { select: { email: true, phone: true } } },
  });
  if (orders.length === 0) return "No orders yet.";
  const lines = orders.map((order) => {
    const who = order.user.email ?? order.user.phone ?? "unknown";
    return `#${order.id.slice(-8)} · ${who} · ${Number(order.totalAmount)} ${order.currency} · ${order.paymentStatus}`;
  });
  return `🧾 Last ${orders.length} orders\n\n${lines.join("\n")}`;
}

async function sendBackup(chatId: number): Promise<void> {
  if (!bot) return;
  const file = await createBackup();
  try {
    await bot.telegram.sendDocument(
      chatId,
      { source: file, filename: path.basename(file) },
      { caption: "🗄️ oostaAI database backup" },
    );
  } finally {
    await unlink(file).catch(() => {});
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

  // /start opens the button menu. Plain text messages go to the AI agent.
  bot.start((ctx) =>
    ctx.reply(
      "👋 پنل ادمین oostaAI\n\nیک گزینه را انتخاب کن، یا همین‌جا فارسی دستور بده تا دستیار هوش مصنوعی انجامش بده — مثلاً:\n«یک محصول اکانت اسپاتیفای با قیمت ۱۵۰۰۰۰ بساز» یا «یک پست وبلاگ درباره‌ی خرید امن بنویس».",
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

  // AI agent: any plain text message (not a command) is treated as an instruction.
  bot.on(message("text"), async (ctx) => {
    const text = ctx.message.text?.trim() ?? "";
    if (!text || text.startsWith("/")) return;
    if (!isAgentEnabled()) {
      await ctx.reply("🤖 AI is not configured (set GEMINI_API_KEY).", mainMenu());
      return;
    }
    await ctx.sendChatAction("typing").catch(() => {});
    const thinking = await ctx.reply("🤖 در حال انجام…").catch(() => null);
    try {
      const result = await runAgent(text, (note) => {
        void ctx.sendChatAction("typing").catch(() => {});
        console.log(`[agent] tool: ${note}`);
      });
      if (thinking)
        await ctx.telegram.deleteMessage(ctx.chat.id, thinking.message_id).catch(() => {});
      await ctx.reply(result.slice(0, 3800), mainMenu());
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
