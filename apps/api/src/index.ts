// API entry point. Loads environment variables first (dotenv), then boots the
// HTTP server with graceful shutdown.

import "dotenv/config";
import { startFxRefresh } from "./modules/suppliers/fx.service";
import { startCatalogRefresh } from "./modules/suppliers/suppliers.service";
import { config as loadDotenv } from "dotenv";
import { env } from "./config/env";
import { createApp } from "./app";
import { prisma } from "./lib/prisma";
import { startBot } from "./bot";

// Explicit server-owned path only; never supplied through an HTTP request.
if (process.env.SUPPLIER_CREDENTIALS_FILE) {
  const loaded = loadDotenv({ path: process.env.SUPPLIER_CREDENTIALS_FILE, override: false });
  if (loaded.error) throw new Error("Supplier credential file could not be loaded");
}

const stopCatalogRefresh = startCatalogRefresh();
const stopFxRefresh = startFxRefresh();
const app = createApp();

const server = app.listen(env.API_PORT, () => {
  console.log(`[oosta-api] listening on http://localhost:${env.API_PORT} (${env.NODE_ENV})`);
});

// Start the Telegram admin bot (no-op unless TELEGRAM_BOT_TOKEN + TELEGRAM_ADMIN_ID are set).
startBot();

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[oosta-api] ${signal} received — shutting down...`);
  stopCatalogRefresh();
  stopFxRefresh();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
  console.log("[oosta-api] shutdown complete");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
