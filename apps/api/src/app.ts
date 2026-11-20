import { supplierQuoteRouter } from "./modules/suppliers/suppliers.routes";
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
import { catalogRouter } from "./modules/catalog/catalog.routes";
import { bluEventRouter } from "./modules/orders/blu-events";
import { ordersRouter } from "./modules/orders/orders.routes";
import { paymentsRouter } from "./modules/payments/payments.routes";
import { ticketsRouter } from "./modules/tickets/tickets.routes";
import { blogRouter, blogAdminRouter } from "./modules/blog/blog.routes";
import { pagesRouter, pagesAdminRouter } from "./modules/pages/pages.routes";
import { analyticsRouter } from "./modules/analytics/analytics.routes";
import { settingsRouter, settingsAdminRouter } from "./modules/settings/settings.routes";
import { adminRouter } from "./modules/admin/admin.routes";
import { maintenanceGate } from "./lib/maintenance";
import { createSupplierCheckout, supplierCheckoutRouter } from "./modules/suppliers/checkout";
import type { SupplierRegistry } from "./modules/suppliers/fulfillment";
import { liveSupplierRegistry } from "./modules/suppliers/live-adapters";
import { cartRouter } from "./modules/orders/cart.routes";

export function createApp(options: { supplierAdapters?: SupplierRegistry } = {}) {
  const app = express();
  const supplierCheckout = createSupplierCheckout(
    options.supplierAdapters ?? liveSupplierRegistry(),
  );
  app.locals.supplierCheckout = supplierCheckout;

  app.disable("x-powered-by");
  // Account data, credentials and payment results must not enter browser/proxy caches.
  app.use(
    [
      "/auth",
      "/orders",
      "/cart",
      "/tickets",
      "/admin",
      "/payments/verify",
      "/supplier-quotes",
      "/supplier-checkout",
      "/internal/blu-events",
    ],
    (_req, res, next) => {
      res.setHeader("Cache-Control", "private, no-store");
      next();
    },
  );

  app.use(maintenanceGate);
  // Nginx sanitizes forwarding headers; only explicit proxy subnets are trusted.
  app.set(
    "trust proxy",
    env.TRUST_PROXY.split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );

  // Security + parsing
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(globalRateLimiter);
  app.use("/internal/blu-events", bluEventRouter);
  app.use(express.json({ limit: "1mb", inflate: false }));
  app.use(express.urlencoded({ extended: false, limit: "64kb", inflate: false }));

  // Logging
  app.use(morgan(env.isProduction ? "combined" : "dev"));

  // Global rate limiting

  // Routes
  app.use("/health", healthRouter);
  app.use("/auth", authRouter);
  app.use(catalogRouter);
  app.use("/orders", ordersRouter);
  app.use("/cart", cartRouter);
  app.use("/supplier-quotes", supplierQuoteRouter);
  app.use("/supplier-checkout", supplierCheckoutRouter(supplierCheckout));
  app.use("/payments", paymentsRouter);
  app.use("/tickets", ticketsRouter);
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
