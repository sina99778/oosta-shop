// API entry point. Loads environment variables first (dotenv), then boots the
// HTTP server with graceful shutdown.

import "dotenv/config";
import { env } from "./config/env";
import { createApp } from "./app";
import { prisma } from "./lib/prisma";
import { startBot } from "./bot";
import { startCustomerBot } from "./customerBot";
import { startOrderExpirySweeper } from "./modules/orders/orders.service";
import { encryptLegacyCredentials } from "./lib/credentials";

const app = createApp();

const server = app.listen(env.API_PORT, () => {
  console.log(`[oosta-api] listening on http://localhost:${env.API_PORT} (${env.NODE_ENV})`);
});

// Start the Telegram admin bot (no-op unless TELEGRAM_BOT_TOKEN + TELEGRAM_ADMIN_ID are set).
startBot();
// Customer bot: account linking, orders, tickets, notices (no-op without CUSTOMER_BOT_TOKEN).
const stopCustomerBot = startCustomerBot();

// Expire unpaid orders past their reservation window and return their stock.
const stopSweeper = startOrderExpirySweeper();

// Seal any credentials stored before CREDENTIALS_ENCRYPTION_KEY was configured.
encryptLegacyCredentials()
  .then((count) => {
    if (count > 0) console.log(`[oosta-api] encrypted ${count} legacy inventory item(s)`);
  })
  .catch((error) => console.error("[oosta-api] credential encryption failed", error));

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[oosta-api] ${signal} received — shutting down...`);
  stopSweeper();
  stopCustomerBot();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
  console.log("[oosta-api] shutdown complete");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
