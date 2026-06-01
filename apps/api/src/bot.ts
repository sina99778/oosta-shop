// Telegram admin bot (Telegraf). It stays disabled unless TELEGRAM_BOT_TOKEN and
// TELEGRAM_ADMIN_ID are set. Access is restricted strictly to the configured admin id.
// Exposes both tappable inline buttons and the equivalent /commands.

import { Telegraf, Markup } from "telegraf";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";

let bot: Telegraf | undefined;

// Inline keyboard shown on /start and after each action.
function mainMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("📊 Stats", "stats"),
      Markup.button.callback("🧾 Last 5 orders", "orders"),
    ],
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

  // Button taps (inline keyboard callbacks)
  bot.action("stats", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(await statsMessage(), mainMenu());
  });
  bot.action("orders", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(await ordersMessage(), mainMenu());
  });

  console.log("[telegram] starting admin bot…");
  void bot.launch().catch((error) => console.error("[telegram] bot error", error));

  process.once("SIGINT", () => bot?.stop("SIGINT"));
  process.once("SIGTERM", () => bot?.stop("SIGTERM"));
}
