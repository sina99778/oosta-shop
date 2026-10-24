// Assembles the Express application: security middleware, parsers, logging,
// rate limiting, route mounting, and the centralized error handlers (last).

import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import { env } from "./config/env";
import { globalRateLimiter } from "./middleware/rateLimit";
import { requireTrustedOrigin } from "./lib/session";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { healthRouter } from "./routes/health";
import { authRouter } from "./modules/auth/auth.routes";
import { catalogRouter } from "./modules/catalog/catalog.routes";
import { ordersRouter } from "./modules/orders/orders.routes";
import { paymentsRouter } from "./modules/payments/payments.routes";
import { ticketsRouter } from "./modules/tickets/tickets.routes";
import { blogRouter, blogAdminRouter } from "./modules/blog/blog.routes";
import { pagesRouter, pagesAdminRouter } from "./modules/pages/pages.routes";
import { analyticsRouter } from "./modules/analytics/analytics.routes";
import { settingsRouter, settingsAdminRouter } from "./modules/settings/settings.routes";
import { adminRouter } from "./modules/admin/admin.routes";
import { notificationsRouter } from "./modules/notifications/notifications.routes";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  // Production chain is client -> ArvanCloud edge -> nginx -> Express (2 trusted
  // hops), so req.ip resolves to the real visitor. With only 1, every visitor
  // behind the same CDN edge shared one rate-limit bucket (site-wide 429s).
  // TRUST_PROXY_HOPS overrides it; nginx must only accept CDN traffic (see
  // DEPLOYMENT.md) or a direct client could spoof X-Forwarded-For.
  app.set("trust proxy", env.trustProxyHops);

  // Security + parsing
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Logging
  app.use(morgan(env.isProduction ? "combined" : "dev"));

  // Global rate limiting
  app.use(globalRateLimiter);

  // CSRF guard for cookie-authenticated, state-changing requests
  app.use(requireTrustedOrigin);

  // Routes
  app.use("/health", healthRouter);
  app.use("/auth", authRouter);
  app.use(catalogRouter);
  app.use("/orders", ordersRouter);
  app.use("/payments", paymentsRouter);
  app.use("/tickets", ticketsRouter);
  app.use("/notifications", notificationsRouter);
  app.use(blogRouter); // public blog
  app.use(pagesRouter); // public CMS pages
  app.use(settingsRouter); // public site settings (theme/hero overrides)
  app.use(analyticsRouter); // public page-view beacon
  app.use("/admin/blog", blogAdminRouter); // before /admin so it matches first
  app.use("/admin/pages", pagesAdminRouter);
  app.use("/admin/settings", settingsAdminRouter);
  app.use("/admin", adminRouter);

  // 404 + error handling (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
