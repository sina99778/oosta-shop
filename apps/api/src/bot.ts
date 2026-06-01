// Telegram admin bot (Telegraf). Disabled unless TELEGRAM_BOT_TOKEN and
// TELEGRAM_ADMIN_ID are set. Access is restricted strictly to the admin id.
// Features: stats, recent orders, on-demand + scheduled DB backups, and restore
// (admin sends a backup file captioned "restore"). Inline buttons + /commands.

import { Telegraf, Markup } from "telegraf";
import { message } from "telegraf/filters";
import { unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";
import { createBackup, restoreFromFile } from "./lib/backup";

let bot: Telegraf | undefined;
let backupTimer: ReturnType<typeof setInterval> | undefined;

function mainMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("📊 Stats", "stats"),
      Markup.button.callback("🧾 Last 5 orders", "orders"),
    ],
    [Markup.button.callback("💾 Backup now", "backup")],
  ]);
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

  bot.start((ctx) => ctx.reply("👋 oostaAI admin panel — choose an option:", mainMenu()));

  // Text commands
  bot.command("stats", async (ctx) => {
    await ctx.reply(await statsMessage(), mainMenu());
  });
  bot.command("orders", async (ctx) => {
    await ctx.reply(await ordersMessage(), mainMenu());
  });
  bot.command("backup", async (ctx) => {
    await ctx.reply("📦 Creating backup…");
    await sendBackup(ctx.chat?.id ?? adminId);
  });

  // Button taps
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
