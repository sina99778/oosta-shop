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
import {
  manualSupplierJobs,
  manualSupplierPendingCount,
  recordSupplierFunding,
  refundManualSupplier,
  supplierAmount,
} from "./manual-admin";
export const supplierAdminRouter = Router();
supplierAdminRouter.use("/manual", (req, _res, next) => {
  if (req.authMethod === "api-key")
    throw new AppError(403, "FORBIDDEN", "Administrator session required");
  next();
});
supplierAdminRouter.get(
  "/manual",
  validate({ query: z.object({ orderId: z.string().max(100).optional() }).strict() }),
  async (req, res) => {
    const orderId = req.query.orderId as string | undefined;
    const jobs = await manualSupplierJobs(orderId);
    const checkout = req.app.locals.supplierCheckout as SupplierCheckout;
    res.json({
      jobs: orderId
        ? await Promise.all(
            jobs.map(async (job) => ({
              ...job,
              wallet: (await checkout.walletBalance(job.supplier)) ?? null,
            })),
          )
        : jobs,
    });
  },
);
supplierAdminRouter.get("/manual/pending", async (_req, res) =>
  res.json(await manualSupplierPendingCount()),
);
const manualId = z.object({ id: z.string().regex(/^[a-z0-9]{1,100}$/i) });
supplierAdminRouter.post(
  "/manual/:id/funding",
  validate({
    params: manualId,
    body: z.object({ amount: supplierAmount, requestId: z.uuid() }).strict(),
  }),
  async (req, res) =>
    res.json(
      await recordSupplierFunding(
        req.params.id as string,
        req.user!.id,
        req.body.amount,
        req.body.requestId,
      ),
    ),
);
supplierAdminRouter.post(
  "/manual/:id/dispatch",
  validate({
    params: manualId,
    body: z.object({ acceptedCost: supplierAmount.optional() }).strict(),
  }),
  async (req, res) => {
    const checkout = req.app.locals.supplierCheckout as SupplierCheckout;
    const result = await checkout.dispatchManual(
      req.params.id as string,
      req.user!.id,
      req.body.acceptedCost,
    );
    res.json(result);
  },
);
supplierAdminRouter.post(
  "/manual/:id/reconcile",
  validate({ params: manualId, body: z.object({}).strict() }),
  async (req, res) => {
    if (!(await manualSupplierJobs(undefined, req.params.id as string)).length)
      throw new AppError(404, "NOT_FOUND", "Supplier order not found");
    const checkout = req.app.locals.supplierCheckout as SupplierCheckout;
    res.json(await checkout.reconcile(req.params.id as string));
  },
);
supplierAdminRouter.post(
  "/manual/:id/refund",
  validate({
    params: manualId,
    body: z
      .object({
        tracking: z
          .string()
          .trim()
          .regex(/^[a-z0-9-]{4,80}$/i),
      })
      .strict(),
  }),
  async (req, res) =>
    res.json(await refundManualSupplier(req.params.id as string, req.user!.id, req.body.tracking)),
);
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
