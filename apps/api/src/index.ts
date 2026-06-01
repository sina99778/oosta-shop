// API entry point. Loads environment variables first (dotenv), then boots the
// HTTP server with graceful shutdown.

import "dotenv/config";
import { env } from "./config/env";
import { createApp } from "./app";
import { prisma } from "./lib/prisma";

const app = createApp();

const server = app.listen(env.API_PORT, () => {
  console.log(`[oosta-api] listening on http://localhost:${env.API_PORT} (${env.NODE_ENV})`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[oosta-api] ${signal} received — shutting down...`);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
  console.log("[oosta-api] shutdown complete");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
