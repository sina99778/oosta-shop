// Assembles the Express application: security middleware, parsers, logging,
// rate limiting, route mounting, and the centralized error handlers (last).

import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import { env } from "./config/env";
import { globalRateLimiter } from "./middleware/rateLimit";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { healthRouter } from "./routes/health";
import { authRouter } from "./modules/auth/auth.routes";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1); // trust the first proxy (correct client IP for rate limiting)

  // Security + parsing
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Logging
  app.use(morgan(env.isProduction ? "combined" : "dev"));

  // Global rate limiting
  app.use(globalRateLimiter);

  // Routes
  app.use("/health", healthRouter);
  app.use("/auth", authRouter);
  // Future routers (catalog, orders, admin) mount here in later phases.

  // 404 + error handling (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
