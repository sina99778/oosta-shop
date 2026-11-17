import * as qa from "./supplier-qa.service";
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { supplierIds } from "./variant";
import { pricingInput } from "./pricing";
import * as service from "./suppliers.service";
import type { SupplierCheckout } from "./checkout";
import { AppError } from "../../utils/httpError";
export const supplierAdminRouter = Router();
supplierAdminRouter.get("/qa", async (_req, res) => res.json(await qa.qaStatus()));
supplierAdminRouter.post(
  "/qa/attempts",
  validate({ body: z.object({ requestKey: z.string().uuid() }).strict() }),
  async (req, res) =>
    res.json({ attempt: await qa.beginQaPurchase(req.user!.id, req.body.requestKey) }),
);
supplierAdminRouter.post(
  "/qa/attempts/:id/reconcile",
  validate({ params: z.object({ id: z.string().min(1).max(100) }), body: z.object({}).strict() }),
  async (req, res) =>
    res.json({ attempt: await qa.reconcileQaPurchase(req.user!.id, req.params.id as string) }),
);
supplierAdminRouter.get("/", async (_req, res) => {
  res.json(await service.supplierOverview());
});
supplierAdminRouter.post(
  "/:supplier/sync",
  validate({ params: z.object({ supplier: z.enum(supplierIds) }), body: z.object({}).strict() }),
  async (req, res) => {
    res.json({
      catalog: await service.syncCatalog(req.params.supplier as (typeof supplierIds)[number]),
    });
  },
);
supplierAdminRouter.patch("/pricing", validate({ body: pricingInput }), async (req, res) => {
  res.json({ pricing: await service.setPricing(req.body) });
});
export const supplierQuoteRouter = Router();
supplierQuoteRouter.use(authenticate);
supplierQuoteRouter.post(
  "/",
  validate({
    body: z
      .object({ planId: z.string().min(1).max(100), quantity: z.literal(1).optional() })
      .strict(),
  }),
  async (req, res) => {
    const checkout = req.app.locals.supplierCheckout as SupplierCheckout;
    if (checkout?.available && req.user?.role === "USER") {
      try {
        res.json({ quote: await checkout.quote(req.user.id, req.body.planId) });
        return;
      } catch (error) {
        if (!(error instanceof AppError && error.statusCode === 503)) throw error;
      }
    }
    res.json({ quote: await service.quote(req.body.planId) });
  },
);
