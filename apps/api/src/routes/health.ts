// Health endpoints: liveness (process is up) and readiness (database reachable).

import { Router } from "express";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/httpError";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

healthRouter.get("/db", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new AppError(503, "DB_UNAVAILABLE", "Database is not reachable");
  }
  res.json({ status: "ok", database: "connected" });
});
