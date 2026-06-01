// Telegram admin bot (Telegraf). It stays disabled unless TELEGRAM_BOT_TOKEN and
// TELEGRAM_ADMIN_ID are set. Access is restricted strictly to the configured admin id.

import { Telegraf } from "telegraf";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";

let bot: Telegraf | undefined;

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

  // Restrict every incoming update strictly to the admin.
  bot.use(async (ctx, next) => {
    if (ctx.from?.id !== adminId) {
      await ctx.reply("⛔ Unauthorized.");
      return;
    }
    return next();
  });

  bot.start((ctx) =>
    ctx.reply(
      [
        "👋 oostaAI admin bot",
        "",
        "Available commands:",
        "/stats — total users and paid orders",
        "/orders — the last 5 orders",
      ].join("\n"),
    ),
  );

  bot.command("stats", async (ctx) => {
    const [users, paidOrders] = await Promise.all([
      prisma.user.count(),
      prisma.order.count({ where: { paymentStatus: "PAID" } }),
    ]);
    await ctx.reply(`📊 Stats\n\n👤 Users: ${users}\n✅ Paid orders: ${paidOrders}`);
  });

  bot.command("orders", async (ctx) => {
    const orders = await prisma.order.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { email: true, phone: true } } },
    });
    if (orders.length === 0) {
      await ctx.reply("No orders yet.");
      return;
    }
    const lines = orders.map((order) => {
      const who = order.user.email ?? order.user.phone ?? "unknown";
      return `#${order.id.slice(-8)} · ${who} · ${Number(order.totalAmount)} ${order.currency} · ${order.paymentStatus}`;
    });
    await ctx.reply(`🧾 Last ${orders.length} orders\n\n${lines.join("\n")}`);
  });

  console.log("[telegram] starting admin bot…");
  void bot.launch().catch((error) => console.error("[telegram] bot error", error));

  process.once("SIGINT", () => bot?.stop("SIGINT"));
  process.once("SIGTERM", () => bot?.stop("SIGTERM"));
}
