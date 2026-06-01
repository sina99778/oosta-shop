// Prisma client singleton. In development we cache the client on globalThis so
// hot-reloads (tsx watch) don't open a new connection pool on every reload.

import { PrismaClient } from "@prisma/client";
import { env } from "../config/env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isDevelopment ? ["warn", "error"] : ["error"],
  });

if (!env.isProduction) {
  globalForPrisma.prisma = prisma;
}
